import { after, test, mock } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { findProjectMembership } from "../src/services/projectDb.js";
import { withTransaction } from "../src/services/dbHelpers.js";
import { findDomainUserByAuthId } from "../src/services/authDb.js";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
after(() => pool.end());
test("missing Auth ID returns null without interpreting it as a domain ID", async () => {
  assert.equal(await findDomainUserByAuthId("1' OR 1=1 --"), null);
});

test("lookup functions propagate the original database error", async () => {
  const error = Object.assign(new Error("Database probe failure"), { code: "08006" });
  const query = mock.method(pool, "query", async () => { throw error; });
  try {
    await assert.rejects(findDomainUserByAuthId("string-auth-id"), caught => caught === error);
    await assert.rejects(findProjectMembership(1, 1), caught => caught === error);
  } finally { query.mock.restore(); }
});

test("transaction callback failure is propagated and all changes are rolled back", async () => {
  const failure = new Error("Original transaction failure");
  await assert.rejects(withTransaction(async client => {
    await client.query("INSERT INTO users (user_name,email) VALUES ('Rollback','rollback@example.test')");
    throw failure;
  }), caught => caught === failure);
  assert.equal((await pool.query("SELECT 1 FROM users WHERE email = 'rollback@example.test'")).rowCount, 0);
});
