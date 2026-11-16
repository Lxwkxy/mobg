import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { Pool } from "pg";
import "../src/env.js";
import { migrationFiles } from "../src/provisioning/schema.js";

// W5-Book-01 API audit. Builds a fresh mobg_w5_demo_audit_* database with Pai's seed
// (demo.sql + `seed-demo --w5`), starts the real Express server on it, signs in the three
// fixture accounts with disposable in-memory passwords and calls every W1-W4 endpoint for
// success / invalid input / unknown ID / empty result / no permission. Prints a Markdown
// table (and writes it to --out FILE if given). Only this invocation's database is removed.
const suffix = `${process.pid}_${randomBytes(4).toString("hex")}`;
const database = `mobg_w5_demo_audit_${suffix}`;
if (!/^mobg_w5_demo_audit_[0-9]+_[0-9a-f]{8}$/.test(database)) throw new Error("Unsafe audit database name");
const outIndex = process.argv.indexOf("--out");
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : undefined;
const connection = { host: process.env.POSTGRES_HOST, port: Number(process.env.POSTGRES_PORT || 5433),
  user: process.env.POSTGRES_USER, password: process.env.POSTGRES_PASSWORD, connectionTimeoutMillis: 5000 };
const passwords = { owner: randomBytes(24).toString("hex"), member: randomBytes(24).toString("hex"),
  outsider: randomBytes(24).toString("hex") };
const env = { ...process.env, POSTGRES_DB: database, BETTER_AUTH_SECRET: randomBytes(48).toString("hex"),
  SEED_DOMAIN_USER_ID: "1", SEED_OWNER_PASSWORD: passwords.owner, SEED_MEMBER_PASSWORD: passwords.member,
  SEED_OUTSIDER_PASSWORD: passwords.outsider, SEED_MEMBER_EMAIL: "mobg-member@example.test",
  SEED_OUTSIDER_EMAIL: "mobg-outsider@example.test", DEMO_REFERENCE_DATE: "" };
const port = 5900 + Math.floor(Math.random() * 90);
const base = `http://localhost:${port}`;
const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const secrets = [env.BETTER_AUTH_SECRET, ...Object.values(passwords), process.env.POSTGRES_PASSWORD ?? ""].filter(Boolean);

type Who = "owner" | "member" | "outsider" | null;
type Result = { status: number; body: any };
const rows: { area: string; who: string; request: string; scenario: string; expected: string; actual: string; pass: boolean }[] = [];
const cookies: Record<string, string> = {};

async function raw(cookie: string | undefined, method: string, path: string, init: { body?: string; headers?: Record<string, string> } = {}): Promise<Result> {
  const response = await fetch(base + path, { method, body: init.body,
    headers: { Origin: origin, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {}), ...init.headers } });
  const text = await response.text();
  let body: any = text;
  try { body = JSON.parse(text); } catch { /* non-JSON is recorded as text */ }
  if (secrets.some((secret) => text.includes(secret))) throw new Error("Sensitive value in a response");
  return { status: response.status, body };
}
const api = (who: Who, method: string, path: string, body?: unknown) =>
  raw(who ? cookies[who] : undefined, method, path, body === undefined ? {} : { body: JSON.stringify(body) });

// Business routes use the contract envelope (section 9). Better Auth (/api/auth/*) and /api/health
// answer in their own shapes, so only their status and `extra` checks apply.
const isBusiness = (request: string) => !/ \/api\/(auth|health)\b/.test(request);
function envelopeProblem(body: any, expected: number, code?: string): string | undefined {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return "body is not a JSON object";
  if (expected < 400) return body.success === true ? undefined : "success is not true";
  if (body.success !== false) return "success is not false";
  if (!code) return "audit row has no expected error.code";
  if (body.error?.code !== code) return `error.code ${String(body.error?.code)}`;
  if (typeof body.error.message !== "string" || body.error.message.trim() === "") return "error.message missing";
  return undefined;
}

// Records one row. `extra` checks the body; a false/throwing check is a failure with the reason shown.
function check(area: string, who: Who | string, request: string, scenario: string, res: Result,
  expected: number, code?: string, extra?: (body: any) => boolean | string) {
  let pass = res.status === expected;
  let note = `${res.status}${res.body?.error?.code ? " " + res.body.error.code : ""}`;
  if (pass && isBusiness(request)) {
    const problem = envelopeProblem(res.body, expected, code);
    if (problem) { pass = false; note += ` (${problem})`; }
  }
  if (pass && extra) {
    try {
      const outcome = extra(res.body);
      if (outcome !== true) { pass = false; note += ` (${outcome === false ? "body check failed" : outcome})`; }
    } catch (error) { pass = false; note += ` (${(error as Error).message})`; }
  }
  rows.push({ area, who: who ?? "none", request, scenario, expected: `${expected}${code ? " " + code : ""}`, actual: note, pass });
}
const keys = (o: object) => Object.keys(o).sort().join(",");

async function signIn(email: string, password: string): Promise<{ status: number; cookie: string; body: any }> {
  const response = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ email, password }) });
  const cookie = response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  return { status: response.status, cookie, body: await response.json().catch(() => null) };
}

function runCli(file: string, args: string[]) {
  const result = spawnSync(process.execPath, ["--import", "tsx", file, ...args], { env, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const output = String(result.stdout) + String(result.stderr);
  if (secrets.some((secret) => output.includes(secret))) throw new Error("Sensitive CLI output suppressed");
  if (result.status !== 0) throw new Error(`${file} failed:\n${output}`);
}

const admin = new Pool({ ...connection, database: "postgres" });
let created = false;
let server: ChildProcess | undefined;
let exitCode = 1;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const db = new Pool({ ...connection, database });
  try {
    if ((await db.query("SELECT current_database() AS name")).rows[0].name !== database) throw new Error("Target mismatch");
    for (const file of migrationFiles) {
      await db.query(await readFile(new URL(`../../database/migrations/${file}`, import.meta.url), "utf8"));
    }
    await db.query(await readFile(new URL("../../database/seeds/demo.sql", import.meta.url), "utf8"));
    runCli("src/seed-demo.ts", ["--database", database, "--w5"]);
    runCli("src/verify-db.ts", ["--database", database]);
    console.log(`Seeded Pai's W5 fixture into ${database}; db:verify PASS`);

    const fixture = (await db.query("SELECT fixture FROM demo_seed_runs WHERE seed_key='mobg-w5-v1'")).rows[0].fixture;
    const P = Object.fromEntries(Object.entries(fixture.project_ids).map(([k, v]) => [k, Number(v)])) as Record<"main" | "completed" | "empty" | "delete", number>;
    const T = (fixture.task_ids as string[]).map(Number); // 0-4 main, 5-6 completed, 7 sandbox
    const R = fixture.roles as { owner_id: number; member_id: number; outsider_id: number };
    // Dates relative to the seed's reference date (Bangkok "today" when seeded), like Pai's fixture,
    // so isOverdue expectations hold on any day the audit runs.
    const referenceDate = fixture.reference_date as string;
    const seedDay = (days: number) => new Date(Date.parse(`${referenceDate}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
    const emails = Object.fromEntries((await db.query("SELECT user_id::int AS id, email FROM users WHERE user_id = ANY($1::bigint[])",
      [Object.values(R)])).rows.map((r) => [r.id, r.email]));

    server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
      env: { ...env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"] });
    let serverLog = "";
    server.stderr!.on("data", (chunk) => { serverLog += String(chunk); });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server did not start\n${serverLog}`)), 20000);
      server!.stdout!.on("data", (chunk) => { if (String(chunk).includes("running")) { clearTimeout(timer); resolve(); } });
      server!.once("exit", () => reject(new Error(`Server exited early\n${serverLog}`)));
    });

    // ---- Auth: Login / Logout / session / me ------------------------------------------------
    check("health", null, "GET /api/health", "server up (no auth, no DB)", await raw(undefined, "GET", "/api/health"), 200);
    const wrong = await signIn(emails[R.owner_id], "definitely-wrong-password");
    rows.push({ area: "auth", who: "none", request: "POST /api/auth/sign-in/email", scenario: "wrong password",
      expected: "401 INVALID_EMAIL_OR_PASSWORD, no cookie", actual: `${wrong.status} ${wrong.body?.code ?? ""}${wrong.cookie ? " + cookie" : ""}`,
      pass: wrong.status === 401 && wrong.body?.code === "INVALID_EMAIL_OR_PASSWORD" && !wrong.cookie.includes("session_token") });
    const unknown = await signIn("nobody@example.test", "whatever-password");
    rows.push({ area: "auth", who: "none", request: "POST /api/auth/sign-in/email", scenario: "unknown email (same answer as wrong password)",
      expected: "401 INVALID_EMAIL_OR_PASSWORD", actual: `${unknown.status} ${unknown.body?.code ?? ""}`,
      pass: unknown.status === 401 && unknown.body?.code === "INVALID_EMAIL_OR_PASSWORD" });
    for (const who of ["owner", "member", "outsider"] as const) {
      const id = R[`${who}_id`];
      const res = await signIn(emails[id], passwords[who]);
      rows.push({ area: "auth", who, request: "POST /api/auth/sign-in/email", scenario: "correct password",
        expected: "200 + session cookie", actual: `${res.status}${res.cookie.includes("session_token") ? " + cookie" : ""}`,
        pass: res.status === 200 && res.cookie.includes("session_token") });
      cookies[who] = res.cookie;
    }
    check("auth", "owner", "GET /api/auth/get-session", "native session", await api("owner", "GET", "/api/auth/get-session"), 200,
      undefined, (b) => typeof b?.user?.id === "string" || "no string auth id");
    check("me", null, "GET /api/me", "no cookie", await api(null, "GET", "/api/me"), 401, "UNAUTHENTICATED");
    check("me", "garbage cookie", "GET /api/me", "forged session token",
      await raw("better-auth.session_token=forged.value", "GET", "/api/me"), 401, "UNAUTHENTICATED");
    check("me", "owner", "GET /api/me", "linked profile", await api("owner", "GET", "/api/me"), 200, undefined,
      (b) => (keys(b.user) === "email,userId,userName" && b.user.userId === R.owner_id) || `keys ${keys(b.user)}`);
    check("me", "member", "GET /api/me", "numeric MobG id of session", await api("member", "GET", "/api/me"), 200, undefined,
      (b) => b.user.userId === R.member_id);

    // ---- Dashboard on the untouched fixture (expected = Pai's table in docs/w5-db-verification.md)
    // Order: projects/tasks/todo/inProgress/done/overdue/highPriority.
    const summary = (expected: number[]) => (b: any) => {
      const s = b.summary;
      const actual = [s.projectCount, s.taskCount, s.statusCounts.todo, s.statusCounts.inProgress, s.statusCounts.done, s.overdueCount, s.highPriorityCount];
      return actual.join("/") === expected.join("/") || `got ${actual.join("/")}`;
    };
    check("dashboard", "owner", "GET /api/dashboard", "Pai table 6/9/4/2/3/1/4", await api("owner", "GET", "/api/dashboard"), 200, undefined, summary([6, 9, 4, 2, 3, 1, 4]));
    check("dashboard", "member", "GET /api/dashboard", "Pai table 4/6/3/2/1/1/3", await api("member", "GET", "/api/dashboard"), 200, undefined, summary([4, 6, 3, 2, 1, 1, 3]));

    // ---- Users --------------------------------------------------------------------------------
    check("users", null, "GET /api/users", "no cookie", await api(null, "GET", "/api/users"), 401, "UNAUTHENTICATED");
    check("users", "outsider", "GET /api/users", "any linked user may list (no secrets)", await api("outsider", "GET", "/api/users"), 200,
      undefined, (b) => (b.users.length === 3 && b.users.every((u: object) => keys(u) === "email,userId,userName")) || `n=${b.users.length}`);

    // ---- Projects list ------------------------------------------------------------------------
    check("projects", null, "GET /api/projects", "no cookie", await api(null, "GET", "/api/projects"), 401, "UNAUTHENTICATED");
    check("projects", "owner", "GET /api/projects", "own projects only", await api("owner", "GET", "/api/projects"), 200, undefined,
      (b) => b.pagination.totalItems === 6 || `total ${b.pagination.totalItems}`);
    check("projects", "member", "GET /api/projects", "own projects only", await api("member", "GET", "/api/projects"), 200, undefined,
      (b) => (b.pagination.totalItems === 4 && !b.projects.some((p: any) => p.projectId === P.completed)) || `total ${b.pagination.totalItems}`);
    check("projects", "outsider", "GET /api/projects", "empty result", await api("outsider", "GET", "/api/projects"), 200, undefined,
      (b) => (b.projects.length === 0 && b.pagination.totalItems === 0 && b.pagination.totalPages === 0) || JSON.stringify(b.pagination));
    check("projects", "owner", "GET /api/projects?status=Done", "filter before paging", await api("owner", "GET", "/api/projects?status=Done"), 200,
      undefined, (b) => (b.projects.length > 0 && b.projects.every((p: any) => p.derivedStatus === "Done")) || "non-Done project");
    check("projects", "owner", "GET /api/projects?pageSize=1&page=2", "pagination", await api("owner", "GET", "/api/projects?pageSize=1&page=2"), 200,
      undefined, (b) => (b.projects.length === 1 && b.pagination.totalPages === 6) || JSON.stringify(b.pagination));
    check("projects", "owner", "GET /api/projects?page=99", "page past the end -> empty", await api("owner", "GET", "/api/projects?page=99"), 200,
      undefined, (b) => b.projects.length === 0 && b.pagination.totalItems === 6);
    for (const [q, scenario] of [["status=Bad", "unknown status"], ["page=0", "page 0"], ["pageSize=51", "pageSize > 50"],
      ["page=1abc", "partial number"], ["userId=" + R.member_id, "tamper: userId filter"], ["status=Done&status=Done", "repeated key"]]) {
      check("projects", "owner", `GET /api/projects?${q}`, scenario, await api("owner", "GET", `/api/projects?${q}`), 400, "VALIDATION_ERROR");
    }

    // ---- Project detail -----------------------------------------------------------------------
    check("projects", "owner", "GET /api/projects/:main", "progress 1/5", await api("owner", "GET", `/api/projects/${P.main}`), 200, undefined,
      (b) => (b.project.progressPercent === 20 && b.project.derivedStatus === "In progress" && b.project.myRole === "Owner"
        && b.project.totalTasks === 5 && b.project.completedTasks === 1) || JSON.stringify(b.project));
    check("projects", "member", "GET /api/projects/:main", "myRole Member", await api("member", "GET", `/api/projects/${P.main}`), 200, undefined,
      (b) => b.project.myRole === "Member");
    check("projects", "owner", "GET /api/projects/:completed", "100% Done", await api("owner", "GET", `/api/projects/${P.completed}`), 200,
      undefined, (b) => b.project.progressPercent === 100 && b.project.derivedStatus === "Done");
    check("projects", "member", "GET /api/projects/:empty", "no tasks -> 0% To do", await api("member", "GET", `/api/projects/${P.empty}`), 200,
      undefined, (b) => b.project.progressPercent === 0 && b.project.derivedStatus === "To do" && b.project.myRole === "Owner");
    check("projects", "outsider", "GET /api/projects/:main", "non-member", await api("outsider", "GET", `/api/projects/${P.main}`), 404, "NOT_FOUND");
    check("projects", "member", "GET /api/projects/:completed", "tamper: other user's project id", await api("member", "GET", `/api/projects/${P.completed}`), 404, "NOT_FOUND");
    check("projects", "owner", "GET /api/projects/999999", "unknown id (same as non-member)", await api("owner", "GET", "/api/projects/999999"), 404, "NOT_FOUND");
    for (const bad of ["abc", "0", "-1", "1.5", "1abc", "9007199254740993"]) {
      check("projects", "owner", `GET /api/projects/${bad}`, "invalid id", await api("owner", "GET", `/api/projects/${bad}`), 400, "VALIDATION_ERROR");
    }
    check("projects", null, "GET /api/projects/:main", "no cookie", await api(null, "GET", `/api/projects/${P.main}`), 401, "UNAUTHENTICATED");

    // ---- Project create / edit / delete -------------------------------------------------------
    const invalidProjects: [string, unknown][] = [
      ["missing projectName", { startDate: "2026-11-01" }], ["blank projectName", { projectName: "   ", startDate: "2026-11-01" }],
      ["name > 150", { projectName: "x".repeat(151), startDate: "2026-11-01" }],
      ["dueDate == startDate", { projectName: "A", startDate: "2026-11-01", dueDate: "2026-11-01" }],
      ["impossible date", { projectName: "A", startDate: "2026-02-30" }],
      ["unknown memberIds", { projectName: "A", startDate: "2026-11-01", memberIds: [999999] }],
      ["duplicate memberIds", { projectName: "A", startDate: "2026-11-01", memberIds: [R.member_id, R.member_id] }],
      ["forged createdBy", { projectName: "A", startDate: "2026-11-01", createdBy: R.member_id }],
    ];
    for (const [scenario, body] of invalidProjects) {
      check("projects", "owner", "POST /api/projects", scenario, await api("owner", "POST", "/api/projects", body), 400, "VALIDATION_ERROR");
    }
    check("projects", null, "POST /api/projects", "no cookie", await api(null, "POST", "/api/projects", { projectName: "A", startDate: "2026-11-01" }), 401, "UNAUTHENTICATED");
    const createdProject = await api("owner", "POST", "/api/projects",
      { projectName: "  Audit project  ", startDate: "2026-11-01", dueDate: "2026-12-01", memberIds: [R.member_id, R.owner_id] });
    check("projects", "owner", "POST /api/projects", "creator Owner, self in memberIds kept Owner, name trimmed", createdProject, 201, undefined,
      (b) => (b.project.myRole === "Owner" && b.project.projectName === "Audit project" && b.project.creatorId === R.owner_id) || JSON.stringify(b.project));
    const audit = createdProject.body.project.projectId as number;
    check("members", "owner", "GET /api/projects/:audit/members", "Owner first, no duplicate creator", await api("owner", "GET", `/api/projects/${audit}/members`), 200,
      undefined, (b) => (b.members.length === 2 && b.members[0].role === "Owner" && b.members[0].userId === R.owner_id) || JSON.stringify(b.members));
    check("projects", "member", "PATCH /api/projects/:audit", "Member edits project", await api("member", "PATCH", `/api/projects/${audit}`, { projectName: "x" }), 403, "FORBIDDEN");
    check("projects", "outsider", "PATCH /api/projects/:audit", "non-member", await api("outsider", "PATCH", `/api/projects/${audit}`, { projectName: "x" }), 404, "NOT_FOUND");
    check("projects", "owner", "PATCH /api/projects/:audit", "empty body", await api("owner", "PATCH", `/api/projects/${audit}`, {}), 400, "VALIDATION_ERROR");
    check("projects", "owner", "PATCH /api/projects/:audit", "dueDate before stored startDate", await api("owner", "PATCH", `/api/projects/${audit}`, { dueDate: "2026-10-01" }), 400, "VALIDATION_ERROR");
    check("projects", "owner", "PATCH /api/projects/:audit", "startDate after stored dueDate", await api("owner", "PATCH", `/api/projects/${audit}`, { startDate: "2026-12-05" }), 400, "VALIDATION_ERROR");
    check("projects", "owner", "PATCH /api/projects/999999", "unknown id", await api("owner", "PATCH", "/api/projects/999999", { projectName: "x" }), 404, "NOT_FOUND");
    check("projects", "owner", "PATCH /api/projects/:audit", "rename + clear dueDate", await api("owner", "PATCH", `/api/projects/${audit}`, { projectName: "Audit renamed", dueDate: null }), 200,
      undefined, (b) => b.project.projectName === "Audit renamed" && b.project.dueDate === null);

    // ---- Members ------------------------------------------------------------------------------
    check("members", "outsider", "GET /api/projects/:main/members", "non-member", await api("outsider", "GET", `/api/projects/${P.main}/members`), 404, "NOT_FOUND");
    check("members", "member", "GET /api/projects/:main/members", "assignee dropdown", await api("member", "GET", `/api/projects/${P.main}/members`), 200,
      undefined, (b) => b.members.length === 2 && b.members.every((m: object) => keys(m) === "email,joinDate,role,userId,userName"));
    check("members", "member", "POST /api/projects/:audit/members", "Member adds", await api("member", "POST", `/api/projects/${audit}/members`, { userId: R.outsider_id }), 403, "FORBIDDEN");
    check("members", "outsider", "POST /api/projects/:audit/members", "non-member adds self", await api("outsider", "POST", `/api/projects/${audit}/members`, { userId: R.outsider_id }), 404, "NOT_FOUND");
    check("members", "owner", "POST /api/projects/:audit/members", "unknown user", await api("owner", "POST", `/api/projects/${audit}/members`, { userId: 999999 }), 400, "VALIDATION_ERROR");
    check("members", "owner", "POST /api/projects/:audit/members", "forged role field", await api("owner", "POST", `/api/projects/${audit}/members`, { userId: R.outsider_id, role: "Owner" }), 400, "VALIDATION_ERROR");
    check("members", "owner", "POST /api/projects/:audit/members", "already a member", await api("owner", "POST", `/api/projects/${audit}/members`, { userId: R.member_id }), 409, "CONFLICT",
      (b) => b.error.details?.[0]?.reason === "ALREADY_MEMBER");
    check("members", "owner", "POST /api/projects/:audit/members", "add outsider", await api("owner", "POST", `/api/projects/${audit}/members`, { userId: R.outsider_id }), 201,
      undefined, (b) => b.member.userId === R.outsider_id && b.member.role === "Member");
    check("members", "outsider", "GET /api/projects/:audit", "new member can read", await api("outsider", "GET", `/api/projects/${audit}`), 200);
    check("members", "owner", "DELETE /api/projects/:main/members/:member", "sole assignee (any status)", await api("owner", "DELETE", `/api/projects/${P.main}/members/${R.member_id}`), 409,
      "CONFLICT", (b) => (b.error.details.length === 1 && b.error.details[0].reason === "SOLE_ASSIGNEE" && b.error.details[0].taskId === T[1]) || JSON.stringify(b.error.details));
    check("members", "owner", "DELETE /api/projects/:main/members/:owner", "last Owner", await api("owner", "DELETE", `/api/projects/${P.main}/members/${R.owner_id}`), 409,
      "CONFLICT", (b) => b.error.details?.[0]?.reason === "LAST_OWNER");
    check("members", "owner", "DELETE /api/projects/:main/members/:outsider", "user not in project", await api("owner", "DELETE", `/api/projects/${P.main}/members/${R.outsider_id}`), 404, "NOT_FOUND");
    check("members", "owner", "DELETE /api/projects/:main/members/abc", "invalid user id", await api("owner", "DELETE", `/api/projects/${P.main}/members/abc`), 400, "VALIDATION_ERROR");
    check("members", "member", "DELETE /api/projects/:main/members/:owner", "Member removes", await api("member", "DELETE", `/api/projects/${P.main}/members/${R.owner_id}`), 403, "FORBIDDEN");
    check("members", "owner", "DELETE /api/projects/:audit/members/:outsider", "remove plain member", await api("owner", "DELETE", `/api/projects/${audit}/members/${R.outsider_id}`), 200);
    check("members", "outsider", "GET /api/projects/:audit", "removed user loses access at once", await api("outsider", "GET", `/api/projects/${audit}`), 404, "NOT_FOUND");

    // ---- Tasks --------------------------------------------------------------------------------
    const mainTasks = `/api/projects/${P.main}/tasks`;
    check("tasks", "owner", "GET /api/projects/:main/tasks", "5 tasks, dueDate order, overdue rules", await api("owner", "GET", mainTasks), 200, undefined, (b) => {
      const byId = Object.fromEntries(b.tasks.map((t: any) => [t.taskId, t]));
      const sorted = b.tasks.every((t: any, i: number) => i === 0 || b.tasks[i - 1].dueDate <= t.dueDate);
      return (b.tasks.length === 5 && sorted && byId[T[0]].isOverdue === true && byId[T[1]].isOverdue === false
        && byId[T[2]].isOverdue === false && byId[T[1]].status === "In progress") || "order/overdue mismatch";
    });
    check("tasks", "member", "GET /api/projects/:main/tasks?status=Done", "status filter", await api("member", "GET", `${mainTasks}?status=Done`), 200,
      undefined, (b) => b.tasks.length === 1 && b.tasks[0].taskId === T[2]);
    check("tasks", "member", "GET /api/projects/:empty/tasks", "empty project", await api("member", "GET", `/api/projects/${P.empty}/tasks`), 200, undefined, (b) => b.tasks.length === 0);
    check("tasks", "owner", "GET /api/projects/:main/tasks?status=Doing", "DB name is not an API status", await api("owner", "GET", `${mainTasks}?status=Doing`), 400, "VALIDATION_ERROR");
    check("tasks", "owner", "GET /api/projects/:main/tasks?priority=1", "unsupported filter", await api("owner", "GET", `${mainTasks}?priority=1`), 400, "VALIDATION_ERROR");
    check("tasks", "outsider", "GET /api/projects/:main/tasks", "non-member", await api("outsider", "GET", mainTasks), 404, "NOT_FOUND");
    check("tasks", "member", "GET /api/projects/:main/tasks/:id", "detail", await api("member", "GET", `${mainTasks}/${T[0]}`), 200, undefined,
      (b) => (b.task.assignees.length === 2 && b.task.priority === 1 && b.task.projectId === P.main) || JSON.stringify(b.task));
    check("tasks", "owner", "GET /api/projects/:main/tasks/:completedTask", "tamper: task id of another project", await api("owner", "GET", `${mainTasks}/${T[5]}`), 404, "NOT_FOUND");
    check("tasks", "member", "GET /api/projects/:completed/tasks/:completedTask", "tamper: project the user is not in", await api("member", "GET", `/api/projects/${P.completed}/tasks/${T[5]}`), 404, "NOT_FOUND");
    check("tasks", "owner", "GET /api/projects/:main/tasks/999999", "unknown task", await api("owner", "GET", `${mainTasks}/999999`), 404, "NOT_FOUND");
    check("tasks", "owner", "GET /api/projects/:main/tasks/abc", "invalid task id", await api("owner", "GET", `${mainTasks}/abc`), 400, "VALIDATION_ERROR");
    check("tasks", "outsider", "GET /api/projects/:main/tasks/abc", "non-member gets 404 before id validation", await api("outsider", "GET", `${mainTasks}/abc`), 404, "NOT_FOUND");

    const goodTask = { taskTitle: "Audit task", priority: 2, dueDate: seedDay(30), assigneeIds: [R.member_id] };
    const invalidTasks: [string, unknown][] = [
      ["missing taskTitle", { ...goodTask, taskTitle: undefined }], ["title > 200", { ...goodTask, taskTitle: "x".repeat(201) }],
      ["priority 4", { ...goodTask, priority: 4 }], ["priority as string", { ...goodTask, priority: "1" }],
      ["missing dueDate", { ...goodTask, dueDate: undefined }], ["bad dueDate", { ...goodTask, dueDate: "24/12/2026" }],
      ["no assignees", { ...goodTask, assigneeIds: [] }], ["duplicate assignees", { ...goodTask, assigneeIds: [R.member_id, R.member_id] }],
      ["assignee not in project", { ...goodTask, assigneeIds: [R.outsider_id] }], ["forged status", { ...goodTask, status: "Done" }],
      ["forged createdById", { ...goodTask, createdById: R.owner_id }],
    ];
    for (const [scenario, body] of invalidTasks) {
      check("tasks", "member", "POST /api/projects/:main/tasks", scenario, await api("member", "POST", mainTasks, body), 400, "VALIDATION_ERROR");
    }
    check("tasks", "outsider", "POST /api/projects/:main/tasks", "non-member", await api("outsider", "POST", mainTasks, goodTask), 404, "NOT_FOUND");
    const createdTask = await api("member", "POST", mainTasks, goodTask);
    check("tasks", "member", "POST /api/projects/:main/tasks", "Member creates; To do; creator from session", createdTask, 201, undefined,
      (b) => (b.task.status === "To do" && b.task.createdById === R.member_id && b.task.isOverdue === false) || JSON.stringify(b.task));
    const newTask = createdTask.body.task.taskId as number;
    check("tasks", "member", "PATCH /api/projects/:main/tasks/:new", "status In progress", await api("member", "PATCH", `${mainTasks}/${newTask}`, { status: "In progress" }), 200,
      undefined, (b) => b.task.status === "In progress");
    check("tasks", "owner", "PATCH /api/projects/:main/tasks/:new", "replace assignees", await api("owner", "PATCH", `${mainTasks}/${newTask}`, { assigneeIds: [R.owner_id, R.member_id] }), 200,
      undefined, (b) => b.task.assignees.length === 2);
    check("tasks", "owner", "PATCH /api/projects/:main/tasks/:new", "clear description", await api("owner", "PATCH", `${mainTasks}/${newTask}`, { taskDescription: null }), 200,
      undefined, (b) => b.task.taskDescription === null);
    for (const [scenario, body] of [["empty body", {}], ["dueDate null", { dueDate: null }], ["no assignees", { assigneeIds: [] }],
      ["status 'Doing'", { status: "Doing" }], ["unknown field", { projectId: P.completed }]] as [string, unknown][]) {
      check("tasks", "member", "PATCH /api/projects/:main/tasks/:new", scenario, await api("member", "PATCH", `${mainTasks}/${newTask}`, body), 400, "VALIDATION_ERROR");
    }
    check("tasks", "owner", "PATCH /api/projects/:main/tasks/:completedTask", "tamper: task of another project", await api("owner", "PATCH", `${mainTasks}/${T[5]}`, { status: "To do" }), 404, "NOT_FOUND");
    check("tasks", "outsider", "PATCH /api/projects/:main/tasks/:new", "non-member", await api("outsider", "PATCH", `${mainTasks}/${newTask}`, { status: "Done" }), 404, "NOT_FOUND");
    check("tasks", "owner", "GET /api/projects/:main", "progress recalculated after new task", await api("owner", "GET", `/api/projects/${P.main}`), 200,
      undefined, (b) => (b.project.totalTasks === 6 && b.project.progressPercent === 17) || JSON.stringify(b.project));
    check("tasks", "member", "DELETE /api/projects/:main/tasks/:new", "Member deletes", await api("member", "DELETE", `${mainTasks}/${newTask}`), 403, "FORBIDDEN");
    check("tasks", "outsider", "DELETE /api/projects/:main/tasks/:new", "non-member", await api("outsider", "DELETE", `${mainTasks}/${newTask}`), 404, "NOT_FOUND");
    check("tasks", "owner", "DELETE /api/projects/:main/tasks/:completedTask", "tamper: task of another project", await api("owner", "DELETE", `${mainTasks}/${T[5]}`), 404, "NOT_FOUND");
    check("tasks", "owner", "DELETE /api/projects/:main/tasks/:new", "Owner deletes", await api("owner", "DELETE", `${mainTasks}/${newTask}`), 200);
    check("tasks", "owner", "GET /api/projects/:main/tasks/:new", "deleted task", await api("owner", "GET", `${mainTasks}/${newTask}`), 404, "NOT_FOUND");
    check("tasks", "owner", "GET /api/projects/:completed/tasks/:completedTask", "other-project task still intact", await api("owner", "GET", `/api/projects/${P.completed}/tasks/${T[5]}`), 200);

    // ---- My Tasks -----------------------------------------------------------------------------
    const mine = (who: Exclude<Who, null>, id: number) => (b: any) =>
      b.tasks.every((t: any) => t.assignees.some((a: any) => a.userId === id)) || "task not assigned to me";
    check("my tasks", null, "GET /api/tasks/mine", "no cookie", await api(null, "GET", "/api/tasks/mine"), 401, "UNAUTHENTICATED");
    check("my tasks", "owner", "GET /api/tasks/mine", "only my assignments", await api("owner", "GET", "/api/tasks/mine"), 200, undefined,
      (b) => (b.tasks.length === 8 && mine("owner", R.owner_id)(b) === true) || `n=${b.tasks.length}`);
    check("my tasks", "member", "GET /api/tasks/mine", "only my assignments", await api("member", "GET", "/api/tasks/mine"), 200, undefined,
      (b) => (b.tasks.length === 4 && mine("member", R.member_id)(b) === true) || `n=${b.tasks.length}`);
    check("my tasks", "member", "GET /api/tasks/mine?status=In%20progress", "status filter", await api("member", "GET", "/api/tasks/mine?status=In%20progress"), 200,
      undefined, (b) => b.tasks.length === 2 && b.tasks.every((t: any) => t.status === "In progress"));
    check("my tasks", "outsider", "GET /api/tasks/mine", "empty result", await api("outsider", "GET", "/api/tasks/mine"), 200, undefined, (b) => b.tasks.length === 0);
    for (const q of [`userId=${R.owner_id}`, `projectId=${P.main}`, "status=Bad", "status=Done&status=Done", "q=W5"]) {
      check("my tasks", "outsider", `GET /api/tasks/mine?${q}`, "tamper / unsupported query", await api("outsider", "GET", `/api/tasks/mine?${q}`), 400, "VALIDATION_ERROR");
    }

    // ---- Dashboard after the edits above -------------------------------------------------------
    check("dashboard", null, "GET /api/dashboard", "no cookie", await api(null, "GET", "/api/dashboard"), 401, "UNAUTHENTICATED");
    check("dashboard", "owner", "GET /api/dashboard", "after audit edits: Pai table + 1 empty audit project", await api("owner", "GET", "/api/dashboard"), 200, undefined, summary([7, 9, 4, 2, 3, 1, 4]));
    check("dashboard", "member", "GET /api/dashboard", "after audit edits: Pai table + 1 empty audit project", await api("member", "GET", "/api/dashboard"), 200, undefined, summary([5, 6, 3, 2, 1, 1, 3]));
    check("dashboard", "outsider", "GET /api/dashboard", "empty: all zero", await api("outsider", "GET", "/api/dashboard"), 200, undefined,
      (b) => summary([0, 0, 0, 0, 0, 0, 0])(b) === true && b.highPriorityTasks.length === 0);
    check("dashboard", "owner", "GET /api/dashboard?limit=2", "important tasks: High, not Done, due order", await api("owner", "GET", "/api/dashboard?limit=2"), 200, undefined,
      (b) => (b.highPriorityTasks.length === 2 && b.highPriorityTasks.every((t: any) => t.priority === 1 && t.status !== "Done")
        && b.highPriorityTasks[0].taskId === T[0]) || JSON.stringify(b.highPriorityTasks.map((t: any) => t.taskId)));
    for (const q of ["limit=0", "limit=101", "limit=abc", `userId=${R.owner_id}`]) {
      check("dashboard", "outsider", `GET /api/dashboard?${q}`, "invalid / tamper query", await api("outsider", "GET", `/api/dashboard?${q}`), 400, "VALIDATION_ERROR");
    }

    // ---- Search -------------------------------------------------------------------------------
    const search = (who: Who, q: string) => api(who, "GET", `/api/search?${new URLSearchParams({ q })}`);
    check("search", null, "GET /api/search?q=W5", "no cookie", await search(null, "W5"), 401, "UNAUTHENTICATED");
    check("search", "owner", "GET /api/search?q=w5", "case-insensitive, my projects", await search("owner", "w5"), 200, undefined,
      (b) => b.projects.length === 3 || `projects ${b.projects.map((p: any) => p.projectName).join(";")}`);
    check("search", "member", "GET /api/search?q=Completed", "project the user is not in stays hidden", await search("member", "Completed"), 200,
      undefined, (b) => (b.projects.length === 0 && b.tasks.length === 0) || JSON.stringify(b));
    check("search", "outsider", "GET /api/search?q=W5", "empty result", await search("outsider", "W5"), 200, undefined, (b) => b.projects.length === 0 && b.tasks.length === 0);
    check("search", "owner", "GET /api/search?q=%", "% is literal, not a wildcard", await search("owner", "%"), 200, undefined, (b) => b.projects.length === 0 && b.tasks.length === 0);
    check("search", "owner", "GET /api/search?q=", "blank query", await search("owner", "   "), 400, "VALIDATION_ERROR");
    check("search", "owner", "GET /api/search", "missing q", await api("owner", "GET", "/api/search"), 400, "VALIDATION_ERROR");
    check("search", "owner", "GET /api/search?q=(201 chars)", "too long", await search("owner", "x".repeat(201)), 400, "VALIDATION_ERROR");

    // ---- Request body errors ------------------------------------------------------------------
    check("body", "owner", "POST /api/projects", "malformed JSON", await raw(cookies.owner, "POST", "/api/projects", { body: "{bad" }), 400, "VALIDATION_ERROR");
    check("body", "owner", "POST /api/projects", "body over 100 kB", await raw(cookies.owner, "POST", "/api/projects",
      { body: JSON.stringify({ projectName: "A", startDate: "2026-11-01", projectDescription: "x".repeat(150_000) }) }), 413, "VALIDATION_ERROR");
    check("body", "owner", "POST /api/projects", "unsupported charset", await raw(cookies.owner, "POST", "/api/projects",
      { body: "{}", headers: { "Content-Type": "application/json; charset=x-unknown" } }), 415, "VALIDATION_ERROR");
    check("body", "owner", "POST /api/projects", "unsupported Content-Encoding", await raw(cookies.owner, "POST", "/api/projects",
      { body: "{}", headers: { "Content-Encoding": "x-unknown" } }), 415, "VALIDATION_ERROR");
    check("body", "owner", "POST /api/projects", "not JSON content type", await raw(cookies.owner, "POST", "/api/projects",
      { body: "projectName=A", headers: { "Content-Type": "application/x-www-form-urlencoded" } }), 400, "VALIDATION_ERROR");
    check("routing", "owner", "GET /api/nope", "unknown endpoint", await api("owner", "GET", "/api/nope"), 404, "NOT_FOUND");

    // ---- Delete policy on Pai's sandbox ------------------------------------------------------
    const sandbox = `/api/projects/${P.delete}`;
    check("delete", "member", `DELETE /api/projects/:sandbox`, "Member deletes project", await api("member", "DELETE", sandbox), 403, "FORBIDDEN");
    check("delete", "owner", `DELETE /api/projects/:sandbox/tasks/:task`, "Owner deletes task (comment + assignees cascade)", await api("owner", "DELETE", `${sandbox}/tasks/${T[7]}`), 200);
    const leftovers = (await db.query(`SELECT (SELECT count(*) FROM comments WHERE task_id=$1)::int AS c,
      (SELECT count(*) FROM task_assignees WHERE task_id=$1)::int AS a`, [T[7]])).rows[0];
    rows.push({ area: "delete", who: "db", request: "SELECT comments/task_assignees", scenario: "cascade after task delete",
      expected: "0 / 0", actual: `${leftovers.c} / ${leftovers.a}`, pass: leftovers.c === 0 && leftovers.a === 0 });
    check("delete", "owner", `DELETE /api/projects/:sandbox/members/:member`, "member with no sole tasks", await api("owner", "DELETE", `${sandbox}/members/${R.member_id}`), 200);
    check("delete", "member", `GET /api/projects/:sandbox`, "removed member", await api("member", "GET", sandbox), 404, "NOT_FOUND");
    check("delete", "owner", `DELETE /api/projects/:sandbox`, "Owner deletes project", await api("owner", "DELETE", sandbox), 200);
    check("delete", "owner", `DELETE /api/projects/:sandbox`, "already deleted", await api("owner", "DELETE", sandbox), 404, "NOT_FOUND");
    check("delete", "owner", `GET /api/projects/:main`, "Main Demo intact", await api("owner", "GET", `/api/projects/${P.main}`), 200, undefined, (b) => b.project.totalTasks === 5);
    check("delete", "owner", `DELETE /api/projects/:audit`, "Owner deletes audit project", await api("owner", "DELETE", `/api/projects/${audit}`), 200);

    // ---- Logout, expiry, unlinked profile -----------------------------------------------------
    const before = cookies.owner;
    check("session", "owner", "POST /api/auth/sign-out", "logout", await raw(before, "POST", "/api/auth/sign-out", { body: "{}" }), 200);
    check("session", "owner (old cookie)", "GET /api/me", "after logout", await raw(before, "GET", "/api/me"), 401, "UNAUTHENTICATED");
    check("session", "owner (old cookie)", "GET /api/projects", "after logout", await raw(before, "GET", "/api/projects"), 401, "UNAUTHENTICATED");
    const memberAuth = (await db.query("SELECT auth_user_id FROM users WHERE user_id=$1", [R.member_id])).rows[0].auth_user_id;
    await db.query("UPDATE auth_sessions SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [memberAuth]);
    check("session", "member (expired)", "GET /api/me", "session expired", await api("member", "GET", "/api/me"), 401, "UNAUTHENTICATED");
    check("session", "member (expired)", "PATCH /api/projects/:main/tasks/:id", "session expired write", await api("member", "PATCH", `${mainTasks}/${T[1]}`, { status: "Done" }), 401, "UNAUTHENTICATED");
    const stillDoing = (await db.query("SELECT s.status_name FROM tasks t JOIN task_statuses s USING(status_id) WHERE task_id=$1", [T[1]])).rows[0].status_name;
    rows.push({ area: "session", who: "db", request: "SELECT task status", scenario: "expired write changed nothing", expected: "Doing", actual: stillDoing, pass: stillDoing === "Doing" });
    const outsiderAuth = (await db.query("SELECT auth_user_id FROM users WHERE user_id=$1", [R.outsider_id])).rows[0].auth_user_id;
    await db.query("UPDATE users SET auth_user_id = NULL WHERE user_id = $1", [R.outsider_id]);
    check("session", "outsider (unlinked)", "GET /api/me", "session without MobG profile", await api("outsider", "GET", "/api/me"), 403, "FORBIDDEN");
    check("session", "outsider (unlinked)", "GET /api/dashboard", "session without MobG profile", await api("outsider", "GET", "/api/dashboard"), 403, "FORBIDDEN");
    await db.query("UPDATE users SET auth_user_id = $2 WHERE user_id = $1", [R.outsider_id, outsiderAuth]);
    check("session", "outsider (relinked)", "GET /api/me", "link restored", await api("outsider", "GET", "/api/me"), 200);
  } finally { await db.end(); }

  const failed = rows.filter((r) => !r.pass);
  const escape = (s: string) => s.replace(/\|/g, "\\|");
  const table = ["| # | Area | Caller | Request | Scenario | Expected | Actual | Result |", "|---:|---|---|---|---|---|---|---|",
    ...rows.map((r, i) => `| ${i + 1} | ${r.area} | ${r.who} | \`${escape(r.request)}\` | ${escape(r.scenario)} | ${r.expected} | ${escape(r.actual)} | ${r.pass ? "PASS" : "**FAIL**"} |`)].join("\n");
  const summaryLine = `${rows.length - failed.length}/${rows.length} checks PASS against ${database.replace(/_[0-9]+_[0-9a-f]{8}$/, "_<run>")}`;
  console.log(table + "\n\n" + summaryLine);
  if (outFile) await writeFile(outFile, `${table}\n\n${summaryLine}\n`, "utf8");
  exitCode = failed.length === 0 ? 0 : 1;
} catch (error) {
  console.error(`API audit stopped: ${(error as Error).message}`);
} finally {
  server?.kill();
  if (created) {
    await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    console.log(`Removed only this invocation's audit database: ${database}`);
  }
  await admin.end();
  process.exitCode = exitCode;
}
