import { pool } from "./db.js";

try {
  const result = await pool.query("SELECT project_name FROM projects ORDER BY project_id");
  console.table(result.rows);
} catch (error) {
  console.error("Database connection check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
