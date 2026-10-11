import { after, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { auth } from "../src/auth.js";
import { pool } from "../src/db.js";
import { provisionAccount, ProvisioningError, seedAuth } from "../src/provisioning/accounts.js";
import { seedDemoProjects } from "../src/provisioning/demoProjects.js";
import { findDomainUserByAuthId } from "../src/services/authDb.js";
import { findProjectMembership, listUsers, listProjectsForUser } from "../src/services/projectDb.js";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
const recovery_directory = await mkdtemp(join(tmpdir(), "mobg-w2-recovery-"));
after(async () => { await pool.end(); await rm(recovery_directory, { recursive: true }); });

test("provisioning preserves demo owner ID, creates usable credentials, and is repeatable", async () => {
  const password = randomBytes(24).toString("hex");
  const result = await provisionAccount({ domain_user_id: 1, password, recovery_directory });
  assert.equal(result.user_id, "1");
  assert.equal((await findProjectMembership(1, 1))?.role, "Owner");
  assert.equal((await findDomainUserByAuthId(result.auth_user_id))?.user_id, "1");
  assert.equal((await provisionAccount({ domain_user_id: 1, recovery_directory })).created, false);
  const response = await auth.api.signInEmail({ body: { email: result.email, password }, asResponse: true });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  assert.equal(session?.user.id, result.auth_user_id);
  await auth.api.signOut({ headers: new Headers({ cookie }) });
  assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) })) === null, true);
});

test("three real accounts and business fixtures are repeatable and preserve outsider isolation", async () => {
  const passwords = [1, 2, 3].map(() => randomBytes(24).toString("hex"));
  const users = [];
  for (const [i, role] of ["Owner", "Member", "Outsider"].entries()) {
    users.push(await provisionAccount({ name: `Fixture ${role}`, email: `fixture-${role.toLowerCase()}@example.test`,
      password: passwords[i]!, recovery_directory }));
  }
  const input = { owner_id: Number(users[0]!.user_id), member_id: Number(users[1]!.user_id), outsider_id: Number(users[2]!.user_id) };
  const first = await seedDemoProjects(input);
  const fixtureRuns = await Promise.all(Array.from({ length: 12 }, () => seedDemoProjects(input)));
  assert.equal(fixtureRuns.every(result => JSON.stringify(result) === JSON.stringify(first)), true);
  assert.equal((await findProjectMembership(Number(first.shared_project_id), input.owner_id))?.role, "Owner");
  assert.equal((await findProjectMembership(Number(first.shared_project_id), input.member_id))?.role, "Member");
  assert.equal(await findProjectMembership(Number(first.private_project_id), input.member_id), null);
  const outsiderList = await listProjectsForUser({ user_id: input.outsider_id, status: null, page: 1, page_size: 10 });
  assert.deepEqual(outsiderList.items, []);
  for (const [i, user] of users.entries()) {
    const response = await auth.api.signInEmail({ body: { email: user.email, password: passwords[i]! }, asResponse: true });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal((await findDomainUserByAuthId(session!.user.id))?.user_id, user.user_id);
    // A fixed past date avoids host/container clock skew in the expiry probe.
    const expired = await pool.query("UPDATE auth_sessions SET expires_at = '2000-01-01 00:00:00+00' WHERE user_id = $1", [user.auth_user_id]);
    assert.equal(expired.rowCount, 1);
    assert.equal((await auth.api.getSession({ headers: new Headers({ cookie }) })) === null, true);
  }
  const command = spawnSync(process.execPath, ["--import", "tsx", "src/check-demo.ts", "--database", process.env.POSTGRES_DB!], {
    encoding: "utf8", env: { ...process.env, SEED_DOMAIN_USER_ID: String(input.owner_id),
      SEED_OWNER_PASSWORD: passwords[0]!, SEED_MEMBER_PASSWORD: passwords[1]!, SEED_OUTSIDER_PASSWORD: passwords[2]!,
      SEED_MEMBER_EMAIL: users[1]!.email, SEED_OUTSIDER_EMAIL: users[2]!.email },
  });
  assert.equal(command.status, 0, "check-demo CLI must pass without displaying credentials");
  assert.match(command.stdout, /Native Better Auth\/DB checks passed/);
  assert.equal(passwords.some(password => command.stdout.includes(password) || command.stderr.includes(password)), false);
});

test("pre-existing unlinked auth accounts are never attached just by email", async () => {
  const email = "unlinked-auth@example.test";
  const authUser = await seedAuth.api.signUpEmail({ body: { name: "Existing Auth", email, password: randomBytes(24).toString("hex") } });
  const user = (await pool.query("INSERT INTO users (user_name,email) VALUES ('Existing domain',$1) RETURNING user_id", [email])).rows[0];
  await assert.rejects(provisionAccount({ domain_user_id: Number(user.user_id), password: randomBytes(24).toString("hex"), recovery_directory }),
    /do not attach it by email/);
  assert.equal((await pool.query("SELECT auth_user_id FROM users WHERE user_id = $1", [user.user_id])).rows[0].auth_user_id, null);
  assert.equal((await pool.query("SELECT id FROM auth_users WHERE email = $1", [email])).rows[0].id, authUser.user.id);
});

test("normalized email collisions stop provisioning before signup", async () => {
  const rows = (await pool.query(`INSERT INTO users (user_name,email) VALUES ('Collision A','case@example.test'),
    ('Collision B',' CASE@EXAMPLE.TEST ') RETURNING user_id`)).rows;
  try {
    await assert.rejects(provisionAccount({ name: "Blocked", email: "collision-blocked@example.test",
      password: randomBytes(24).toString("hex"), recovery_directory }), /Normalized email collisions/);
    assert.equal((await pool.query("SELECT 1 FROM auth_users WHERE email = 'collision-blocked@example.test'")).rowCount, 0);
  } finally { await pool.query("DELETE FROM users WHERE user_id = ANY($1::bigint[])", [rows.map(r => r.user_id)]); }
});

test("seeds beyond pool capacity serialize without starvation or duplicates", async () => {
  const input = { name: "Concurrent", email: "concurrent@example.test", password: randomBytes(24).toString("hex"), recovery_directory };
  const results = await Promise.all(Array.from({ length: 12 }, () => provisionAccount(input)));
  assert.equal(results.every(result => result.user_id === results[0]!.user_id && result.auth_user_id === results[0]!.auth_user_id), true);
  assert.equal(results.filter(result => result.created).length, 1);
});

test("new explicit profile provisioning normalizes email and reruns without duplication", async () => {
  const target = { name: "W2 Member", email: "  W2.Member@Example.test  ", recovery_directory };
  const originalPassword = randomBytes(24).toString("hex");
  const first = await provisionAccount({ ...target, password: originalPassword });
  const second = await provisionAccount({ ...target, password: randomBytes(24).toString("hex") });
  assert.equal(second.user_id, first.user_id);
  assert.equal(second.auth_user_id, first.auth_user_id);
  assert.equal(second.email, "w2.member@example.test");
  assert.equal(second.created, false);
  assert.equal((await listUsers()).filter((user) => user.email === second.email).length, 1);
  const response = await auth.api.signInEmail({ body: { email: second.email, password: originalPassword }, asResponse: true });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
  await auth.api.signOut({ headers: new Headers({ cookie }) });
});

test("public signup remains disabled", async () => {
  await assert.rejects(auth.api.signUpEmail({ body: {
    name: "Public Signup", email: "blocked@example.test", password: randomBytes(24).toString("hex"),
  } }));
  assert.equal(auth.options.emailAndPassword?.disableSignUp, true);
});

test("link failure is recorded privately and requires explicit recovery", async () => {
  await pool.query(`CREATE FUNCTION w2_fail_link() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.email = 'recover@example.test' THEN RAISE EXCEPTION 'intentional link failure'; END IF;
    RETURN NEW; END $$`);
  await pool.query("CREATE TRIGGER w2_fail_link BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION w2_fail_link()");
  const target = { name: "Recovery Test", email: "recover@example.test", recovery_directory };
  let error: ProvisioningError | undefined;
  try { await provisionAccount({ ...target, password: randomBytes(24).toString("hex") }); }
  catch (caught) { error = caught as ProvisioningError; }
  assert.ok(error instanceof ProvisioningError && error.recovery_file);
  const record = JSON.parse(await readFile(error.recovery_file, "utf8"));
  assert.equal(record.verified_creation, true);
  assert.equal('password' in record, false);
  await assert.rejects(provisionAccount(target), ProvisioningError);
  await pool.query("DROP TRIGGER w2_fail_link ON users");
  await pool.query("DROP FUNCTION w2_fail_link()");
  const recovered = await provisionAccount({ ...target, recover: true });
  assert.equal(recovered.auth_user_id, record.auth_user_id);
  assert.equal((await findDomainUserByAuthId(record.auth_user_id))?.user_id, recovered.user_id);
});
