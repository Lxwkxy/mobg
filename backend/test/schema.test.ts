import { after, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { inspectSchema, requireAccountSchema } from "../src/provisioning/schema.js";
import { domainIdToNumber } from "../src/services/dbHelpers.js";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
after(() => pool.end());
test("schema preflight accepts 001-007 and blocks partial auth migration", async () => {
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

test("demo metadata is optional for account provisioning but the registration trigger is required", async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DROP TABLE demo_seed_runs");
    const state = await inspectSchema(client);
    assert.equal(state.migrations.find(m => m.file === "006_demo_seed_runs.sql")?.state, "missing");
    assert.equal(state.migrations.find(m => m.file === "007_public_registration.sql")?.state, "complete");
    await requireAccountSchema(client);
    await client.query("ALTER TABLE auth_users DISABLE TRIGGER create_registered_profile");
    assert.equal((await inspectSchema(client)).migrations.find(m => m.file === "007_public_registration.sql")?.state, "partial");
    await assert.rejects(requireAccountSchema(client), /Apply\/repair migrations/);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
