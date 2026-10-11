import { after, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { inspectSchema, requireAccountSchema } from "../src/provisioning/schema.js";
import { domainIdToNumber } from "../src/services/dbHelpers.js";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
after(() => pool.end());
test("schema preflight accepts 001-005 and blocks partial auth migration", async () => {
  assert.equal((await inspectSchema(pool)).migrations.every(m => m.state === "complete"), true);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("ALTER TABLE users DROP CONSTRAINT users_auth_user_id_key");
    assert.equal((await inspectSchema(client)).migrations[4]?.state, "partial");
    await assert.rejects(requireAccountSchema(client), /Apply\/repair migrations/);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
test("MobG decimal ID conversion rejects partial strings and overflow", () => {
  assert.equal(domainIdToNumber("1"), 1);
  for (const id of ["1tail", "1.5", "-1", "0", "9007199254740992", "auth-id", " 1"]) {
    assert.throws(() => domainIdToNumber(id), TypeError);
  }
});
