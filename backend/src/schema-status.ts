import { readFile } from "node:fs/promises";
import type { PoolClient } from "pg";
import { pool } from "./db.js";
import { inspectSchema, migrationFiles } from "./provisioning/schema.js";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const databaseIndex = args.indexOf("--database");
const expectedDatabase = databaseIndex >= 0 ? args[databaseIndex + 1] : undefined;
let client: PoolClient | undefined;
let broken = false;
try {
  if (apply && !expectedDatabase) throw new Error("Applying requires --database with the exact target name");
  client = await pool.connect();
  await client.query("SELECT pg_advisory_lock(hashtextextended('mobg-schema-migrations', 0))");
  let status = await inspectSchema(client);
  console.log(JSON.stringify(status, null, 2));
  if (expectedDatabase && expectedDatabase !== status.database) throw new Error("Database target does not match --database");
  if (status.migrations.some((migration) => migration.state === "partial")) {
    throw new Error("Partial schema detected; repair explicitly instead of rerunning CREATE/ALTER statements");
  }
  if (apply) {
    for (const file of migrationFiles) {
      status = await inspectSchema(client);
      if (status.migrations.find((migration) => migration.file === file)?.state === "complete") continue;
      console.log(`Applying ${file} to ${status.database}`);
      await client.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8"));
    }
    console.log(JSON.stringify(await inspectSchema(client), null, 2));
  }
} catch (error) {
  if (client) await client.query("ROLLBACK").catch(() => { broken = true; });
  // Never print SQL parameters or credential-bearing error objects.
  console.error(error instanceof Error && !('code' in error) ? error.message : "Schema operation failed; inspect database state");
  process.exitCode = 1;
} finally {
  if (client) {
    await client.query("SELECT pg_advisory_unlock(hashtextextended('mobg-schema-migrations', 0))").catch(() => { broken = true; });
    client.release(broken);
  }
  await pool.end();
}
