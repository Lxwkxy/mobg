import { randomBytes, createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool, type PoolClient } from "pg";
import { pool } from "./db.js";
import { inspectSchema } from "./provisioning/schema.js";
import { auditRelationships, quoteIdentifier } from "./provisioning/verification.js";
import { writeNewArchive } from "./provisioning/backupFiles.js";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const args = process.argv.slice(2);
const option = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const database = option("--database");
const restoreDatabase = option("--restore-database");
let archive: string | undefined;
let created = false;
let source: PoolClient | undefined;
let restorePool: Pool | undefined;
const connection = { host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5433),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, connectionTimeoutMillis: 5000 };
const admin = new Pool({ ...connection, database: "postgres" });

function docker(command: string[], input?: number, output?: number): string {
  const result = spawnSync("docker", ["compose", "exec", "-T", "db", ...command], {
    cwd: repo, encoding: "utf8", stdio: [input ?? "ignore", output ?? "pipe", "pipe"], maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error("Docker PostgreSQL command failed");
  return typeof result.stdout === "string" ? result.stdout.trim() : "";
}

async function inventory(client: PoolClient) {
  const tables = (await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  const counts: Record<string, number> = {};
  // Sensitive rows are compared in memory only. Never return/print their contents
  // or digests (including on assertion failure); the archive is the only copy.
  const digest = createHash("sha256");
  for (const { tablename } of tables) {
    const rows = (await client.query<{ row: string }>(`SELECT row_to_json(t)::text AS row FROM public.${quoteIdentifier(tablename)} t ORDER BY row_to_json(t)::text`)).rows;
    counts[tablename] = rows.length;
    digest.update(JSON.stringify([tablename, rows]));
  }
  const structure = (await client.query(`SELECT table_name,column_name,data_type,is_nullable,column_default
    FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  const constraints = (await client.query(`SELECT c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid)
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' ORDER BY c.relname,k.conname`)).rows;
  const indexes = (await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
  const sequences = (await client.query("SELECT sequencename,last_value FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
  const functions = (await client.query(`SELECT p.proname,pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p') ORDER BY p.proname,p.oid`)).rows;
  digest.update(JSON.stringify({ structure, constraints, indexes, sequences, functions }));
  return { counts, digest: digest.digest("hex") };
}

try {
  if (!database || !/^[a-z][a-z0-9_]{0,62}$/.test(database)
    || !restoreDatabase || !/^mobg_w5_restore_[a-z0-9_]{1,46}$/.test(restoreDatabase)
    || database === restoreDatabase) throw new Error("Exact source and new restore database names required");
  source = await pool.connect();
  if ((await source.query("SELECT current_database() AS name")).rows[0].name !== database) throw new Error("Source target mismatch");
  if ((await admin.query("SELECT 1 FROM pg_database WHERE datname=$1", [restoreDatabase])).rowCount) throw new Error("Restore database already exists");
  const user = process.env.POSTGRES_USER;
  if (!user) throw new Error("Database user missing");
  const system = (await source.query("SELECT system_identifier::text AS id FROM pg_control_system()")).rows[0].id;
  const containerSystem = docker(["psql", "-X", "-U", user, "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", "SELECT system_identifier::text FROM pg_control_system()"]);
  if (system !== containerSystem) throw new Error("Docker and backend target different PostgreSQL clusters");
  const directory = option("--directory") ?? join(tmpdir(), "mobg-private-backups");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const resolved = await realpath(directory);
  const pathFromRepo = relative(await realpath(repo), resolved);
  if (!isAbsolute(pathFromRepo) && pathFromRepo !== ".." && !pathFromRepo.startsWith(".." + sep)) throw new Error("Backups must be outside the repository");
  archive = join(resolved, `${database}-${Date.now()}-${randomBytes(4).toString("hex")}.dump`);
  console.log(`Verified backup source: ${database}; new restore target: ${restoreDatabase}`);
  // Block business/auth writers during dump and inventory. Keep the rehearsal short
  // and stop API/seed writers first. Sequences also require a quiescent source.
  await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  const tables = (await source.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).rows;
  if (!tables.length) throw new Error("Source schema is empty");
  await source.query(`LOCK TABLE ${tables.map(t => "public." + quoteIdentifier(t.tablename)).join(",")} IN SHARE MODE`);
  const snapshot = (await source.query("SELECT pg_export_snapshot() AS id")).rows[0].id as string;
  const before = await inventory(source);
  writeNewArchive(archive, fd => {
    docker(["pg_dump", "-U", user, "-d", database, "--format=custom", "--no-owner", "--no-acl", `--snapshot=${snapshot}`], undefined, fd);
  });
  await source.query("COMMIT");
  console.log(`Private archive saved outside Git: ${archive}`);
  await admin.query(`CREATE DATABASE ${quoteIdentifier(restoreDatabase)} TEMPLATE template0`);
  created = true;
  restorePool = new Pool({ ...connection, database: restoreDatabase });
  const restored = await restorePool.connect();
  try {
    if ((await restored.query("SELECT current_database() AS name")).rows[0].name !== restoreDatabase) throw new Error("Restore target mismatch");
    const archiveFd = openSync(archive, "r");
    try { docker(["pg_restore", "-U", user, "-d", restoreDatabase, "--exit-on-error", "--single-transaction", "--no-owner", "--no-acl"], archiveFd); }
    finally { closeSync(archiveFd); }
    const after = await inventory(restored);
    if (before.digest !== after.digest) throw new Error("Restore inventory differs");
    const schema = await inspectSchema(restored);
    if (schema.migrations.slice(0,5).some(m => m.state !== "complete")) throw new Error("Restored schema incomplete");
    const relationships = await auditRelationships(restored);
    if (Object.keys(relationships.issues).length) throw new Error("Restored relationships need reconciliation");
    console.log(JSON.stringify({ restore_verified: true, table_counts: after.counts,
      foreign_keys_checked: relationships.foreign_keys_checked, rows_schema_indexes_sequences_equal: true }));
  } finally { restored.release(); }
} catch {
  console.error("Backup/restore check failed. Verify exact names, a NEW restore target, idle source, Docker access, outside-repo directory and DB integrity. No raw errors or credentials logged.");
  process.exitCode = 1;
} finally {
  if (source) { await source.query("ROLLBACK").catch(() => {}); source.release(); }
  await restorePool?.end();
  if (created && restoreDatabase) {
    try {
      await admin.query(`DROP DATABASE ${quoteIdentifier(restoreDatabase)}`);
      console.log(`Removed only this invocation's restore database: ${restoreDatabase}`);
    } catch { console.error(`Cleanup incomplete for owned restore database: ${restoreDatabase}`); process.exitCode = 1; }
  }
  await admin.end();
  await pool.end();
}
