import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import "../src/env.js";
import { migrationFiles } from "../src/provisioning/schema.js";

// Disposable credentials stay in memory/child process env. No human credentials
// are changed, saved to this repo or printed. All resources have invocation IDs.
const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
const database = `mobg_w5_demo_${suffix}`;
const restoreDatabase = `mobg_w5_restore_${suffix}`;
const connection = { host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5433),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, connectionTimeoutMillis: 5000 };
const admin = new Pool({ ...connection, database: "postgres" });
const env = { ...process.env, POSTGRES_DB: database, BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
  SEED_DOMAIN_USER_ID: "1", SEED_OWNER_PASSWORD: randomBytes(24).toString("hex"),
  SEED_MEMBER_PASSWORD: randomBytes(24).toString("hex"), SEED_OUTSIDER_PASSWORD: randomBytes(24).toString("hex"),
  SEED_MEMBER_EMAIL: "mobg-member@example.test", SEED_OUTSIDER_EMAIL: "mobg-outsider@example.test", DEMO_REFERENCE_DATE: "" };
let created = false;
let stage = "create isolated database";
function reject(file: string, args: string[]) {
  stage = `rejection: ${file}`;
  const result = spawnSync(process.execPath, ["--import", "tsx", file, ...args], { env, encoding: "utf8" });
  if (result.status !== 1) throw new Error("Unsafe target was not rejected");
  console.log(`${file}: unsafe/mismatched target rejected`);
}
function run(file: string, args: string[]) {
  stage = file;
  console.log(`Running ${file}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", file, ...args], { env, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  // Only our scrubbed CLI output. Reject accidental credential output before printing.
  const output = String(result.stdout) + String(result.stderr);
  if ([env.BETTER_AUTH_SECRET, env.SEED_OWNER_PASSWORD, env.SEED_MEMBER_PASSWORD, env.SEED_OUTSIDER_PASSWORD,
    process.env.POSTGRES_PASSWORD].some(secret => secret && output.includes(secret))) throw new Error("Sensitive output suppressed");
  if (result.status !== 0) throw new Error(`Rehearsal step failed: ${file}`);
  console.log(String(result.stdout).trim());
}
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const db = new Pool({ ...connection, database });
  try {
    if ((await db.query("SELECT current_database() AS name")).rows[0].name !== database) throw new Error("Target mismatch");
    console.log(`Verified isolated rehearsal database: ${database}`);
    for (const file of migrationFiles) await db.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8"));
    await db.query(await readFile(new URL("../../database/seeds/demo.sql", import.meta.url), "utf8"));
  } finally { await db.end(); }
  run("src/seed-demo.ts", ["--database", database, "--w5"]);
  run("src/seed-demo.ts", ["--database", database, "--w5"]);
  run("src/check-demo.ts", ["--database", database]);
  run("src/verify-db.ts", ["--database", database]);
  reject("src/seed-demo.ts", ["--database", "mobg_db", "--w5"]);
  reject("src/backup-db.ts", ["--database", "mobg_db", "--restore-database", restoreDatabase]);
  reject("src/backup-db.ts", ["--database", database, "--restore-database", "mobg_db"]);
  // Existing targets must remain untouched, even if their name has the allowed prefix.
  await admin.query(`CREATE DATABASE "${restoreDatabase}"`);
  try { reject("src/backup-db.ts", ["--database", database, "--restore-database", restoreDatabase]); }
  finally { await admin.query(`DROP DATABASE "${restoreDatabase}"`); }
  run("src/backup-db.ts", ["--database", database, "--restore-database", restoreDatabase]);
  console.log("W5 isolated provisioning, rerun, native Login/Logout, independent DB oracle and backup/restore PASS");
} catch {
  console.error(`W5 rehearsal failed at ${stage}; no raw errors or credentials logged.`);
  process.exitCode = 1;
} finally {
  if (created) {
    await admin.query(`DROP DATABASE "${database}"`);
    console.log(`Removed only this invocation's rehearsal database: ${database}`);
  }
  await admin.end();
}
