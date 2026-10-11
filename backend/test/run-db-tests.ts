import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import "../src/env.js";

const database = `mobg_w2_test_${process.pid}_${randomBytes(4).toString("hex")}`;
if (!/^mobg_w2_test_[0-9]+_[0-9a-f]{8}$/.test(database)) throw new Error("Unsafe test database name");
const connection = {
  host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5433),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD,
  connectionTimeoutMillis: 5000,
};
const admin = new Pool({ ...connection, database: "postgres" });
let created = false;
let exitCode = 1;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const testDb = new Pool({ ...connection, database });
  try {
    for (const file of ["001_initial_schema.sql", "002_require_task_due_date.sql",
      "003_add_project_start_date.sql", "004_add_sessions.sql", "005_add_better_auth.sql"]) {
      await testDb.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8"));
    }
    await testDb.query(await readFile(new URL("../../database/seeds/demo.sql", import.meta.url), "utf8"));
  } finally { await testDb.end(); }
  const files = (await readdir(new URL("./", import.meta.url)))
    .filter((name) => name.endsWith(".test.ts")).map((name) => `test/${name}`);
  const result = spawnSync(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", ...files], {
    stdio: "inherit", env: { ...process.env, POSTGRES_DB: database, NODE_ENV: "test",
      BETTER_AUTH_SECRET: randomBytes(48).toString("hex") },
  });
  exitCode = result.status ?? 1;
} finally {
  // Only the unique database created by this invocation can be removed.
  if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  await admin.end();
}
process.exitCode = exitCode;
