const pool = require("./db.cjs");

async function main() {
  try {
    const result = await pool.query(
      "SELECT project_name FROM projects ORDER BY project_id"
    );

    console.table(result.rows);
  } catch (error) {
    console.error("อ่านฐานข้อมูลไม่สำเร็จ:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();