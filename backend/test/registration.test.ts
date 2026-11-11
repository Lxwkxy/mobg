import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { pool } from "../src/db.js";
import { createEmailVerificationToken } from "better-auth/api";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
const port = Number(process.env.REGISTRATION_BACKEND_PORT) || 6100 + Math.floor(Math.random() * 700);
const base = `http://localhost:${port}`;
const origin = process.env.ACCOUNT_WEB_URL || "http://localhost:4300";
const password = randomBytes(24).toString("hex");
const email = `registration-${randomBytes(6).toString("hex")}@example.test`;
let server: ChildProcess;
let cookie = "";

async function mailLink(address: string, subject: string): Promise<string> {
  const inbox = process.env.MAILPIT_URL || "http://127.0.0.1:8025";
  for (let attempt = 0; attempt < 30; attempt++) {
    const list = await (await fetch(`${inbox}/api/v1/messages`)).json() as {
      messages: { ID: string; Subject: string; To: { Address: string }[] }[] };
    const message = list.messages.find(m => m.Subject === subject && m.To.some(to => to.Address === address));
    if (message) {
      const detail = await (await fetch(`${inbox}/api/v1/message/${message.ID}`)).json() as { Text: string };
      const link = detail.Text.match(/http[^\s]+/u)?.[0];
      assert.ok(link, "email contains the expected action link");
      return link;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Expected authentication email was not delivered");
}

async function api(path: string, body?: unknown, cookie?: string) {
  return fetch(base + path, { method: body === undefined ? "GET" : "POST",
    headers: { Origin: origin, "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual" });
}

before(async () => {
  server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: { ...process.env, PORT: String(port), BETTER_AUTH_URL: base, CORS_ORIGIN: origin, AUTH_MAIL_MODE: "mailpit" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Auth logs can contain credentials or links. Report startup status only.
  server.stderr!.resume();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Registration test server startup timed out")), 20000);
    server.stdout!.on("data", chunk => { if (String(chunk).includes("running")) { clearTimeout(timer); resolve(); } });
    server.once("exit", () => { clearTimeout(timer); reject(new Error("Registration test server exited")); });
  });
});
after(async () => { server?.kill(); await pool.end(); });

test("public registration requires email verification before a session is issued", async () => {
  const signup = await api("/api/auth/sign-up/email", { name: "New Member", email, password,
    callbackURL: `${origin}/verify-email` });
  assert.equal(signup.status, 200);
  assert.ok(!signup.headers.get("set-cookie"), "signup must not issue a session");
  const login = await api("/api/auth/sign-in/email", { email, password });
  assert.equal(login.status, 403);
  assert.equal((await login.json()).code, "EMAIL_NOT_VERIFIED");
});

test("verification permits login with a linked MobG profile and no inherited project access", async () => {
  const link = await mailLink(email, "Verify your MobG email");
  const verified = await fetch(link, { redirect: "manual" });
  assert.equal(verified.status, 302);
  const login = await api("/api/auth/sign-in/email", { email, password });
  assert.equal(login.status, 200);
  cookie = login.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
  assert.ok(cookie, "verified login issues a cookie");
  const profile = await api("/api/me", undefined, cookie);
  assert.equal(profile.status, 200);
  const body = await profile.json();
  assert.equal(body.user.email, email);
  assert.equal(body.user.userName, "New Member");
  assert.equal(typeof body.user.userId, "number");
  const projects = await api("/api/projects", undefined, cookie);
  assert.equal(projects.status, 200);
  assert.deepEqual((await projects.json()).projects, []);
});

test("password reset revokes old sessions and tokens can only be used once", async () => {
  const requested = await api("/api/auth/request-password-reset", { email, redirectTo: `${origin}/reset-password` });
  assert.equal(requested.status, 200);
  const unknown = await api("/api/auth/request-password-reset", { email: "unknown@example.test", redirectTo: `${origin}/reset-password` });
  assert.equal(unknown.status, 200);
  assert.deepEqual(await unknown.json(), await requested.json(), "reset must not disclose account existence");
  const mail = await mailLink(email, "Reset your MobG password");
  const redirect = await fetch(mail, { redirect: "manual" });
  const location = redirect.headers.get("location");
  assert.ok(location, "reset email forwards to the web form");
  const token = new URL(location).searchParams.get("token");
  assert.ok(token, "reset form receives a token");
  const newPassword = randomBytes(24).toString("hex");
  const reset = await api("/api/auth/reset-password", { token, newPassword });
  assert.equal(reset.status, 200);
  assert.equal((await api("/api/me", undefined, cookie)).status, 401);
  assert.equal((await api("/api/auth/sign-in/email", { email, password })).status, 401);
  assert.equal((await api("/api/auth/sign-in/email", { email, password: newPassword })).status, 200);
  assert.equal((await api("/api/auth/reset-password", { token, newPassword: password })).status, 400);
});

test("a public client cannot declare itself provisioned or verified", async () => {
  const spoofEmail = `spoof-${randomBytes(6).toString("hex")}@example.test`;
  const response = await api("/api/auth/sign-up/email", { name: "Spoof", email: spoofEmail, password,
    registrationKind: "provisioned", emailVerified: true, userId: 1, role: "Owner" });
  assert.ok([200, 400].includes(response.status), "server ignores or rejects protected fields");
  assert.equal((await api("/api/auth/sign-in/email", { email: spoofEmail, password })).status, response.status === 200 ? 403 : 401);
});

test("signup validates names, refuses hostile redirects and prevents duplicate account takeover", async () => {
  assert.equal((await api("/api/auth/sign-up/email", { name: " ", email: "blank@example.test", password })).status, 400);
  assert.equal((await api("/api/auth/sign-up/email", { name: "x".repeat(101), email: "long@example.test", password })).status, 400);
  const hostile = await api("/api/auth/sign-up/email", { name: "Redirect", email: "redirect@example.test", password,
    callbackURL: "https://untrusted.example/steal" });
  assert.equal(hostile.status, 403);
  const duplicate = await api("/api/auth/sign-up/email", { name: "Impersonator", email, password });
  assert.equal(duplicate.status, 200, "duplicate signup uses an enumeration-safe response");
  assert.ok(!duplicate.headers.get("set-cookie"));
  assert.equal((await api("/api/auth/sign-in/email", { email, password })).status, 401, "duplicate signup cannot replace the reset password");
});

test("resend delivers verification and an expired reset link does not change the password", async () => {
  const expiredEmail = `expiry-${randomBytes(6).toString("hex")}@example.test`;
  assert.equal((await api("/api/auth/sign-up/email", { name: "Expiry", email: expiredEmail, password })).status, 200);
  const expired = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET!, expiredEmail, undefined, -10);
  const expiredLink = `${base}/api/auth/verify-email?token=${encodeURIComponent(expired)}&callbackURL=${encodeURIComponent(`${origin}/verify-email`)}`;
  const expiredResult = await fetch(expiredLink, { redirect: "manual" });
  assert.equal(expiredResult.status, 302);
  assert.equal(new URL(expiredResult.headers.get("location")!).searchParams.get("error"), "TOKEN_EXPIRED");
  assert.equal((await api("/api/auth/sign-in/email", { email: expiredEmail, password })).status, 403);
  const resend = await api("/api/auth/send-verification-email", { email: expiredEmail, callbackURL: `${origin}/verify-email` });
  assert.equal(resend.status, 200);
  const link = await mailLink(expiredEmail, "Verify your MobG email");
  assert.equal((await fetch(link, { redirect: "manual" })).status, 302);
  assert.equal((await api("/api/auth/request-password-reset", { email: expiredEmail, redirectTo: `${origin}/reset-password` })).status, 200);
  const mail = await mailLink(expiredEmail, "Reset your MobG password");
  const redirect = await fetch(mail, { redirect: "manual" });
  const location = redirect.headers.get("location");
  assert.ok(location);
  const token = new URL(location).searchParams.get("token");
  // Arrange expiry in this isolated DB; all assertions observe the public endpoints.
  await pool.query("UPDATE auth_verifications SET expires_at = TIMESTAMPTZ '2000-01-01 00:00:00+00' WHERE identifier LIKE 'reset-password:%'");
  assert.equal((await api("/api/auth/reset-password", { token, newPassword: randomBytes(24).toString("hex") })).status, 400);
  assert.equal((await api("/api/auth/sign-in/email", { email: expiredEmail, password })).status, 200);
});

test("failed credential creation rolls back public profiles and allows a clean retry", async () => {
  const retryEmail = `rollback-${randomBytes(6).toString("hex")}@example.test`;
  await pool.query(`CREATE FUNCTION registration_fail_credential() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'Registration failure probe'; END $$`);
  await pool.query(`CREATE TRIGGER registration_fail_credential BEFORE INSERT ON auth_accounts
    FOR EACH ROW EXECUTE FUNCTION registration_fail_credential()`);
  try {
    const failed = await api("/api/auth/sign-up/email", { name: "Retry", email: retryEmail, password });
    assert.ok(failed.status >= 400);
  } finally {
    await pool.query("DROP TRIGGER registration_fail_credential ON auth_accounts");
    await pool.query("DROP FUNCTION registration_fail_credential()");
  }
  assert.equal((await api("/api/auth/sign-up/email", { name: "Retry", email: retryEmail, password })).status, 200);
  const link = await mailLink(retryEmail, "Verify your MobG email");
  await fetch(link, { redirect: "manual" });
  const login = await api("/api/auth/sign-in/email", { email: retryEmail, password });
  assert.equal(login.status, 200);
  const retryCookie = login.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
  assert.equal((await api("/api/me", undefined, retryCookie)).status, 200);
});

test("signup does not disclose or claim an unlinked existing domain profile", async () => {
  const legacyEmail = `legacy-${randomBytes(6).toString("hex")}@example.test`;
  await pool.query("INSERT INTO users (user_name, email) VALUES ($1, $2)", ["Existing profile", legacyEmail]);
  const duplicate = await api("/api/auth/sign-up/email", { name: "Impersonator", email: legacyEmail, password });
  assert.equal(duplicate.status, 200, "legacy email uses the same neutral signup response");
  assert.ok(!duplicate.headers.get("set-cookie"));
  assert.equal((await api("/api/auth/sign-in/email", { email: legacyEmail, password })).status, 401);
});

test("real browser account flow and responsive layouts", { skip: !process.env.ACCOUNT_WEB_URL, timeout: 180000 }, async (t) => {
  const browserTest = spawn(process.execPath, [fileURLToPath(new URL("../../web/test/account-flow.mjs", import.meta.url))],
    { env: process.env, stdio: "inherit" });
  t.after(() => { browserTest.kill(); });
  const status = await new Promise<number | null>((resolve, reject) => {
    browserTest.once("exit", resolve); browserTest.once("error", reject);
  });
  assert.equal(status, 0, "browser account flow passes");
});

test("public registration is throttled rather than allowing unlimited attempts", async () => {
  let throttled = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await api("/api/auth/sign-up/email", { name: "", email: "rate@example.test", password });
    if (response.status === 429) {
      assert.ok(Number(response.headers.get("x-retry-after")) > 0, "native auth response gives a retry delay");
      throttled = true; break;
    }
    assert.equal(response.status, 400);
  }
  assert.ok(throttled, "repeated signup attempts are rate limited");
});
