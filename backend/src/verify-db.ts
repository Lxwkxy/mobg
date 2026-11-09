import { pool } from "./db.js";
import { verifyDatabase } from "./provisioning/verification.js";

try {
  const index = process.argv.indexOf("--database");
  const expected = index >= 0 ? process.argv[index + 1] : undefined;
  const actual = (await pool.query("SELECT current_database() AS name")).rows[0].name;
  if (!expected || expected !== actual) throw new Error("Database target mismatch");
  const report = await verifyDatabase();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} catch {
  console.error("Database verification failed; check the exact target, schema and connection. No row contents or credentials logged.");
  process.exitCode = 1;
} finally { await pool.end(); }
