import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "../src/db.js";
import { provisionAccount, seedAuth } from "../src/provisioning/accounts.js";
import { withProjectLockHeld } from "./helpers/projectLock.js";

// HTTP tests for W4: project member add/remove, GET /api/tasks/mine and GET /api/dashboard.
// Same approach as taskRoutes.test.ts: real server child process, real Better Auth cookies, isolated test DB.
assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
const port = 5100 + Math.floor(Math.random() * 800);
const base = `http://localhost:${port}`;
const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";

// Each group of tests has its own accounts so counts and lists stay exact when other test files ran first.
// "outsider" and "newcomer" never become members of anything except where a test adds them explicitly.
const names = ["owner", "member", "outsider", "newcomer", "mineOwner", "mineMember", "dashOwner", "dashMember",
  "coOwner", "progressOwner"] as const;
type Name = (typeof names)[number];
const ids = {} as Record<Name, number>;
const cookies = {} as Record<Name, string>;
let server: ChildProcess;
let recovery_directory: string;

async function call(cookie: string | null, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
const api = (who: Name | null, method: string, path: string, body?: unknown) =>
  call(who ? cookies[who] : null, method, path, body);

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ email, password }) });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
}

// Due dates are computed from the Bangkok calendar, as the API does, so overdue assertions never expire.
function bangkokDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

const projectUrl = (id: number) => `/api/projects/${id}`;
const membersUrl = (id: number) => `/api/projects/${id}/members`;
const tasksUrl = (id: number) => `/api/projects/${id}/tasks`;

async function newProject(who: Name, memberIds: number[]): Promise<number> {
  const res = await api(who, "POST", "/api/projects", { projectName: "W4 project", startDate: "2026-01-01", memberIds });
  assert.equal(res.status, 201);
  return res.body.project.projectId as number;
}
async function newTask(who: Name, projectId: number, assigneeIds: number[], extra: Record<string, unknown> = {}) {
  const res = await api(who, "POST", tasksUrl(projectId),
    { taskTitle: "W4 task", priority: 2, dueDate: bangkokDatePlus(30), assigneeIds, ...extra });
  assert.equal(res.status, 201);
  return res.body.task as any;
}
async function setStatus(who: Name, projectId: number, taskId: number, status: string) {
  const res = await api(who, "PATCH", `${tasksUrl(projectId)}/${taskId}`, { status });
  assert.equal(res.status, 200);
}
async function memberList(who: Name, projectId: number): Promise<any[]> {
  const res = await api(who, "GET", membersUrl(projectId));
  assert.equal(res.status, 200);
  return res.body.members;
}

// Simulates database failures inside the real server using a trigger in the isolated test database.
// Only constants from this file are interpolated into SQL, never request data.
const LEAK = "SECRET_PROBE password=hunter2 INSERT INTO project_members";
async function withFailingTrigger(event: "INSERT" | "DELETE", failure: { errcode: string; constraint?: string },
  run: () => Promise<void>): Promise<void> {
  const using = `ERRCODE = '${failure.errcode}'${failure.constraint ? `, CONSTRAINT = '${failure.constraint}'` : ""}`;
  await pool.query(`CREATE FUNCTION w4_probe_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${LEAK}' USING ${using}; END $$`);
  await pool.query(`CREATE TRIGGER w4_probe_fail BEFORE ${event} ON project_members
    FOR EACH ROW EXECUTE FUNCTION w4_probe_fail()`);
  try { await run(); }
  finally {
    await pool.query("DROP TRIGGER w4_probe_fail ON project_members");
    await pool.query("DROP FUNCTION w4_probe_fail()");
  }
}
function assertSafeInternalError(res: { status: number; body: any }) {
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  const text = JSON.stringify(res.body);
  for (const secret of ["SECRET_PROBE", "hunter2", "INSERT", "_fkey", "_pkey", "23503", "23505", "stack"]) {
    assert.equal(text.includes(secret), false, secret);
  }
}

before(async () => {
  recovery_directory = await mkdtemp(join(tmpdir(), "mobg-w4-recovery-"));
  const passwords = {} as Record<Name, string>;
  for (const name of names) {
    passwords[name] = randomBytes(24).toString("hex");
    const user = await provisionAccount({ name: `W4 ${name}`, email: `w4-${name.toLowerCase()}@example.test`,
      password: passwords[name], recovery_directory });
    ids[name] = Number(user.user_id);
  }
  server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  let serverLog = "";
  server.stderr!.on("data", (chunk) => { serverLog += String(chunk); }); // expected 500 probes log errors
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start\n${serverLog}`)), 20000);
    server.stdout!.on("data", (chunk) => { if (String(chunk).includes("running")) { clearTimeout(timer); resolve(); } });
    server.once("exit", () => reject(new Error(`Server exited early\n${serverLog}`)));
  });
  for (const name of names) cookies[name] = await signIn(`w4-${name.toLowerCase()}@example.test`, passwords[name]);
});
after(async () => {
  server?.kill();
  await pool.end();
  await rm(recovery_directory, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// Cross-cutting: authentication, linked profile, schema names
// ---------------------------------------------------------------------------------------------

test("every new route needs a session (401) and a linked MobG profile (403)", async () => {
  const project = await newProject("owner", [ids.member]);
  const routes: [string, string, unknown?][] = [
    ["GET", "/api/tasks/mine"], ["GET", "/api/dashboard"],
    ["POST", membersUrl(project), { userId: ids.newcomer }], ["DELETE", `${membersUrl(project)}/${ids.member}`],
  ];
  for (const [method, path, body] of routes) {
    const none = await api(null, method, path, body);
    assert.equal(none.status, 401, `${method} ${path}`);
    assert.equal(none.body.error.code, "UNAUTHENTICATED");
    assert.equal((await call("better-auth.session_token=not-a-real-session", method, path, body)).status, 401, `garbage ${path}`);
  }
  // A valid Better Auth session whose account has no users.auth_user_id link.
  const email = "w4-unlinked@example.test";
  const password = randomBytes(24).toString("hex");
  await seedAuth.api.signUpEmail({ body: { name: "W4 unlinked", email, password } });
  assert.equal((await pool.query("SELECT 1 FROM users WHERE lower(email) = $1", [email])).rowCount, 0);
  const cookie = await signIn(email, password);
  for (const [method, path, body] of routes) {
    const res = await call(cookie, method, path, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.error.code, "FORBIDDEN");
  }
  assert.equal((await memberList("owner", project)).length, 2); // nothing changed
});

test("the constraint names the member routes rely on exist in the migrated schema", async () => {
  const rows = (await pool.query(`SELECT conname, contype FROM pg_constraint
    WHERE conrelid = 'public.project_members'::regclass AND conname = ANY($1::text[])`,
  [["project_members_pkey", "project_members_user_id_fkey", "project_members_project_id_fkey"]])).rows;
  assert.deepEqual(Object.fromEntries(rows.map((r) => [r.conname, r.contype])), {
    project_members_pkey: "p", project_members_user_id_fkey: "f", project_members_project_id_fkey: "f",
  });
});

// ---------------------------------------------------------------------------------------------
// POST /api/projects/:projectId/members
// ---------------------------------------------------------------------------------------------

test("POST members: role checks, project lookup and body validation", async () => {
  const project = await newProject("owner", [ids.member]);
  const url = membersUrl(project);
  const body = { userId: ids.newcomer };
  assert.equal((await api("outsider", "POST", url, body)).status, 404);
  const asMember = await api("member", "POST", url, body);
  assert.equal(asMember.status, 403);
  assert.equal(asMember.body.error.code, "FORBIDDEN");
  assert.equal((await api("owner", "POST", membersUrl(999999), body)).status, 404);
  assert.equal((await api("owner", "POST", "/api/projects/1abc/members", body)).status, 400);
  const invalid: [string, unknown][] = [
    ["empty body", {}], ["string id", { userId: String(ids.newcomer) }], ["zero", { userId: 0 }], ["negative", { userId: -1 }],
    ["fraction", { userId: 1.5 }], ["null", { userId: null }], ["unsafe", { userId: Number.MAX_SAFE_INTEGER + 1 }],
    ["forged role", { userId: ids.newcomer, role: "Owner" }], ["extra key", { userId: ids.newcomer, projectId: 1 }],
  ];
  for (const [label, payload] of invalid) {
    const res = await api("owner", "POST", url, payload);
    assert.equal(res.status, 400, label);
    assert.equal(res.body.error.code, "VALIDATION_ERROR", label);
  }
  // Malformed JSON is a 400 as well, not a 500.
  const raw = await fetch(base + url, { method: "POST", body: "{bad",
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookies.owner } });
  assert.equal(raw.status, 400);
  assert.equal(((await raw.json()) as any).error.code, "VALIDATION_ERROR");
  assert.deepEqual((await memberList("owner", project)).map((m) => m.userId).sort(), [ids.owner, ids.member].sort());
});

test("POST members: the Owner adds a Member who immediately gets Member access only", async () => {
  const project = await newProject("owner", [ids.member]);
  const added = await api("owner", "POST", membersUrl(project), { userId: ids.newcomer });
  assert.equal(added.status, 201);
  assert.equal(added.body.success, true);
  const member = added.body.member;
  assert.deepEqual(Object.keys(member).sort(), ["email", "joinDate", "role", "userId", "userName"]);
  assert.equal(member.userId, ids.newcomer);
  assert.equal(member.role, "Member");
  assert.equal(member.userName, "W4 newcomer");
  assert.equal(member.email, "w4-newcomer@example.test");
  assert.match(member.joinDate, /^\d{4}-\d{2}-\d{2}$/);
  const list = await memberList("owner", project);
  assert.equal(list[0].role, "Owner");
  assert.deepEqual(list.map((m) => [m.userId, m.role]).sort(), [[ids.owner, "Owner"], [ids.member, "Member"], [ids.newcomer, "Member"]].sort());

  const read = await api("newcomer", "GET", projectUrl(project));
  assert.equal(read.status, 200);
  assert.equal(read.body.project.myRole, "Member");
  const listed = await api("newcomer", "GET", "/api/projects?pageSize=50");
  assert.ok(listed.body.projects.some((p: any) => p.projectId === project));
  assert.equal((await api("newcomer", "GET", tasksUrl(project))).status, 200);
  assert.equal((await api("newcomer", "PATCH", projectUrl(project), { projectName: "Nope" })).status, 403);
  assert.equal((await api("newcomer", "DELETE", projectUrl(project))).status, 403);
  assert.equal((await api("newcomer", "POST", membersUrl(project), { userId: ids.outsider })).status, 403);
  assert.equal((await api("newcomer", "DELETE", `${membersUrl(project)}/${ids.member}`)).status, 403);
  // The new member can be chosen as an assignee.
  const task = await newTask("owner", project, [ids.newcomer]);
  assert.deepEqual(task.assignees.map((a: any) => a.userId), [ids.newcomer]);
});

test("POST members: duplicates and unknown users are rejected without changing the project", async () => {
  const project = await newProject("owner", [ids.member]);
  const url = membersUrl(project);
  for (const userId of [ids.member, ids.owner]) {
    const dup = await api("owner", "POST", url, { userId });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, "CONFLICT");
    assert.deepEqual(dup.body.error.details, [{ reason: "ALREADY_MEMBER" }]);
  }
  const unknown = await api("owner", "POST", url, { userId: 999999 });
  assert.equal(unknown.status, 400);
  assert.equal(unknown.body.error.code, "VALIDATION_ERROR");
  assert.equal(unknown.body.error.details[0].field, "userId");
  const list = await memberList("owner", project);
  assert.deepEqual(list.map((m) => [m.userId, m.role]).sort(), [[ids.owner, "Owner"], [ids.member, "Member"]].sort()); // creator stays Owner
});

// ---------------------------------------------------------------------------------------------
// DELETE /api/projects/:projectId/members/:userId
// ---------------------------------------------------------------------------------------------

test("DELETE members: role checks, ID validation and unknown members", async () => {
  const project = await newProject("owner", [ids.member, ids.newcomer]);
  const url = (userId: number | string) => `${membersUrl(project)}/${userId}`;
  assert.equal((await api("outsider", "DELETE", url(ids.member))).status, 404);
  const asMember = await api("member", "DELETE", url(ids.newcomer));
  assert.equal(asMember.status, 403);
  assert.equal(asMember.body.error.code, "FORBIDDEN");
  for (const bad of ["1abc", "0", "-1", "1.5"]) {
    const res = await api("owner", "DELETE", url(bad));
    assert.equal(res.status, 400, bad);
    assert.equal(res.body.error.code, "VALIDATION_ERROR", bad);
  }
  assert.equal((await api("owner", "DELETE", `${membersUrl(999999)}/${ids.member}`)).status, 404);
  assert.equal((await api("owner", "DELETE", `/api/projects/1abc/members/${ids.member}`)).status, 400);
  const notMember = await api("owner", "DELETE", url(ids.outsider)); // a real user who is not in this project
  assert.equal(notMember.status, 404);
  assert.equal(notMember.body.error.code, "NOT_FOUND");
  assert.equal((await api("owner", "DELETE", url(999999))).status, 404);
  assert.equal((await memberList("owner", project)).length, 3);
});

test("DELETE members: a removed member loses all access immediately and can be added again", async () => {
  const project = await newProject("owner", [ids.member, ids.newcomer]);
  const removed = await api("owner", "DELETE", `${membersUrl(project)}/${ids.member}`);
  assert.deepEqual(removed.body, { success: true, message: "Member removed" });
  assert.equal(removed.status, 200);
  for (const [method, path, body] of [["GET", projectUrl(project)], ["GET", membersUrl(project)], ["GET", tasksUrl(project)],
    ["POST", tasksUrl(project), { taskTitle: "x", priority: 2, dueDate: bangkokDatePlus(3), assigneeIds: [ids.owner] }]] as const) {
    assert.equal((await api("member", method, path, body)).status, 404, `${method} ${path}`);
  }
  const listed = await api("member", "GET", "/api/projects?pageSize=50");
  assert.equal(listed.body.projects.some((p: any) => p.projectId === project), false);
  assert.deepEqual((await memberList("owner", project)).map((m) => m.userId).sort(), [ids.owner, ids.newcomer].sort());
  assert.equal((await api("newcomer", "GET", projectUrl(project))).status, 200); // others unaffected
  const again = await api("owner", "DELETE", `${membersUrl(project)}/${ids.member}`);
  assert.equal(again.status, 404);
  assert.equal(again.body.error.code, "NOT_FOUND");
  assert.equal((await api("owner", "POST", membersUrl(project), { userId: ids.member })).status, 201);
  assert.equal((await api("member", "GET", projectUrl(project))).status, 200);
});

test("DELETE members: the last Owner cannot be removed", async () => {
  const project = await newProject("owner", [ids.member]);
  const res = await api("owner", "DELETE", `${membersUrl(project)}/${ids.owner}`);
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, "CONFLICT");
  assert.deepEqual(res.body.error.details, [{ reason: "LAST_OWNER" }]);
  assert.equal((await api("owner", "GET", projectUrl(project))).body.project.myRole, "Owner");
  assert.equal((await memberList("owner", project)).length, 2);
});

test("DELETE members: a sole assignee of any task, including Done, blocks removal until reassigned", async () => {
  const project = await newProject("owner", [ids.member]);
  const a = await newTask("owner", project, [ids.member], { taskTitle: "Sole A" });
  const b = await newTask("owner", project, [ids.member], { taskTitle: "Sole B" });
  await setStatus("owner", project, b.taskId, "In progress");
  const c = await newTask("owner", project, [ids.member], { taskTitle: "Sole C" });
  await setStatus("owner", project, c.taskId, "Done");
  const shared = await newTask("owner", project, [ids.owner, ids.member], { taskTitle: "Shared" });
  const before = (await api("owner", "GET", tasksUrl(project))).body.tasks;

  const blocked = await api("owner", "DELETE", `${membersUrl(project)}/${ids.member}`);
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "CONFLICT");
  assert.match(blocked.body.error.message, /sole assignee/i);
  assert.deepEqual(blocked.body.error.details, [
    { reason: "SOLE_ASSIGNEE", taskId: a.taskId, taskTitle: "Sole A", status: "To do" },
    { reason: "SOLE_ASSIGNEE", taskId: b.taskId, taskTitle: "Sole B", status: "In progress" },
    { reason: "SOLE_ASSIGNEE", taskId: c.taskId, taskTitle: "Sole C", status: "Done" },
  ]);
  // Nothing changed: still a member, every task identical, shared task keeps both assignees.
  assert.equal((await memberList("owner", project)).length, 2);
  assert.deepEqual((await api("owner", "GET", tasksUrl(project))).body.tasks, before);
  assert.equal((await api("owner", "GET", `${tasksUrl(project)}/${shared.taskId}`)).body.task.assignees.length, 2);

  for (const task of [a, b, c]) {
    const res = await api("owner", "PATCH", `${tasksUrl(project)}/${task.taskId}`, { assigneeIds: [ids.owner] });
    assert.equal(res.status, 200);
  }
  const removed = await api("owner", "DELETE", `${membersUrl(project)}/${ids.member}`);
  assert.equal(removed.status, 200);
  const after = (await api("owner", "GET", tasksUrl(project))).body.tasks as any[];
  assert.equal(after.length, 4);
  for (const task of after) assert.deepEqual(task.assignees.map((x: any) => x.userId), [ids.owner]);
});

test("DELETE members: removal only touches this project and rejects stale assignees afterwards", async () => {
  const p1 = await newProject("owner", [ids.member]);
  const p2 = await newProject("owner", [ids.member]);
  const co = await newTask("owner", p1, [ids.owner, ids.member]);
  const other = await newTask("owner", p2, [ids.member]);
  assert.equal((await api("owner", "DELETE", `${membersUrl(p1)}/${ids.member}`)).status, 200);
  assert.deepEqual((await api("owner", "GET", `${tasksUrl(p1)}/${co.taskId}`)).body.task.assignees.map((a: any) => a.userId), [ids.owner]);
  assert.equal((await api("member", "GET", projectUrl(p2))).status, 200);
  assert.deepEqual((await api("member", "GET", `${tasksUrl(p2)}/${other.taskId}`)).body.task.assignees.map((a: any) => a.userId), [ids.member]);
  const stale = await api("owner", "PATCH", `${tasksUrl(p1)}/${co.taskId}`, { assigneeIds: [ids.member] });
  assert.equal(stale.status, 400);
  assert.equal(stale.body.error.details[0].field, "assigneeIds");
  assert.equal((await api("owner", "POST", tasksUrl(p1), { taskTitle: "x", priority: 1, dueDate: bangkokDatePlus(3), assigneeIds: [ids.member] })).status, 400);
});

// ---------------------------------------------------------------------------------------------
// Concurrency and database failures
// ---------------------------------------------------------------------------------------------

test("concurrent member requests keep exactly one result per action", async () => {
  const project = await newProject("owner", []);
  const adds = await Promise.all([1, 2].map(() => api("owner", "POST", membersUrl(project), { userId: ids.newcomer })));
  assert.deepEqual(adds.map((r) => r.status).sort(), [201, 409]);
  const removes = await Promise.all([1, 2].map(() => api("owner", "DELETE", `${membersUrl(project)}/${ids.newcomer}`)));
  assert.deepEqual(removes.map((r) => r.status).sort(), [200, 404]);
  assert.equal((await memberList("owner", project)).length, 1);

  // A task assigned only to a member that is being removed: either the task wins (removal 409) or the removal
  // wins (task 400). Never a 500, and never a task whose only assignee is no longer a member.
  for (let i = 0; i < 4; i++) {
    const p = await newProject("owner", [ids.member]);
    const [created, removed] = await Promise.all([
      api("owner", "POST", tasksUrl(p), { taskTitle: "Race", priority: 1, dueDate: bangkokDatePlus(3), assigneeIds: [ids.member] }),
      api("owner", "DELETE", `${membersUrl(p)}/${ids.member}`),
    ]);
    const members = (await memberList("owner", p)).map((m) => m.userId);
    const tasks = (await api("owner", "GET", tasksUrl(p))).body.tasks as any[];
    if (created.status === 201) {
      assert.equal(removed.status, 409);
      assert.equal(removed.body.error.details[0].reason, "SOLE_ASSIGNEE");
      assert.ok(members.includes(ids.member));
      assert.deepEqual(tasks[0].assignees.map((a: any) => a.userId), [ids.member]);
    } else {
      assert.equal(created.status, 400);
      assert.equal(created.body.error.details[0].field, "assigneeIds");
      assert.equal(removed.status, 200);
      assert.equal(members.includes(ids.member), false);
      assert.equal(tasks.length, 0);
    }
  }
});

// The route guard sees an Owner, then the request waits for the project lock while that caller loses Owner
// (or leaves the project). The service recheck under the lock must refuse the write: 403 / 404, nothing written.
test("member writes by a caller who loses rights while waiting for the project lock change nothing", async () => {
  const cases = [
    { change: "demote", method: "POST", status: 403, code: "FORBIDDEN" },
    { change: "demote", method: "DELETE", status: 403, code: "FORBIDDEN" },
    { change: "remove", method: "POST", status: 404, code: "NOT_FOUND" },
    { change: "remove", method: "DELETE", status: 404, code: "NOT_FOUND" },
  ] as const;
  for (const { change, method, status, code } of cases) {
    const label = `${change} ${method}`;
    const project = await newProject("owner", [ids.coOwner, ids.member]);
    await pool.query("UPDATE project_members SET role = 'Owner' WHERE project_id = $1 AND user_id = $2", [project, ids.coOwner]);
    const result = await withProjectLockHeld(project,
      () => method === "POST"
        ? api("coOwner", "POST", membersUrl(project), { userId: ids.newcomer })
        : api("coOwner", "DELETE", `${membersUrl(project)}/${ids.member}`),
      async (gate) => {
        await gate.query(change === "demote"
          ? "UPDATE project_members SET role = 'Member' WHERE project_id = $1 AND user_id = $2"
          : "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [project, ids.coOwner]);
      });
    const res = result;
    assert.equal(res.status, status, label);
    assert.equal(res.body.error.code, code, label);
    const expected = change === "demote" ? [ids.owner, ids.coOwner, ids.member] : [ids.owner, ids.member];
    assert.deepEqual((await memberList("owner", project)).map((m) => m.userId).sort(), expected.sort(), label);
  }
});

// PATCH task: the guard sees a Member, then the request waits for the project lock while that Member is removed.
// The service recheck under the lock must answer 404 and leave the task row and its assignees untouched.
test("PATCH task by a caller removed from the project while waiting for the project lock is 404 and changes nothing", async () => {
  const taskRow = async (taskId: number) => (await pool.query(`SELECT t.task_title, t.task_description, t.priority,
      t.due_date::text, s.status_name, ARRAY(SELECT user_id::text FROM task_assignees a WHERE a.task_id = t.task_id
      ORDER BY user_id) AS assignees
    FROM tasks t JOIN task_statuses s USING (status_id) WHERE t.task_id = $1`, [taskId])).rows[0];
  const edit = { taskTitle: "Edited while removed", taskDescription: "changed", priority: 3, status: "Done",
    dueDate: bangkokDatePlus(60), assigneeIds: [ids.member] };

  // Control: the same lock wait without a membership change lets the Member's PATCH through.
  const control = await newProject("owner", [ids.member]);
  const controlTask = await newTask("owner", control, [ids.owner]);
  const allowed = await withProjectLockHeld(control,
    () => api("member", "PATCH", `${tasksUrl(control)}/${controlTask.taskId}`, { taskTitle: "Edited" }), async () => {});
  assert.equal(allowed.status, 200);
  assert.equal((await taskRow(controlTask.taskId)).task_title, "Edited");

  const project = await newProject("owner", [ids.member]);
  const task = await newTask("owner", project, [ids.owner], { taskTitle: "Original", taskDescription: "keep" });
  const before = await taskRow(task.taskId);
  const result = await withProjectLockHeld(project,
    () => api("member", "PATCH", `${tasksUrl(project)}/${task.taskId}`, edit),
    async (gate) => {
      await gate.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [project, ids.member]);
    });
  const res = result;
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
  assert.deepEqual(await taskRow(task.taskId), before);
  assert.deepEqual(before.assignees, [String(ids.owner)]);
  assert.equal(before.task_title, "Original");
  assert.equal((await api("member", "GET", `${tasksUrl(project)}/${task.taskId}`)).status, 404);
});

// POST task: the creator passes the guard as a Member, then is removed while the request waits for the project lock.
// The only assignee is the Owner, who stays a member, so the assignee checks would pass: a 404 here can only come
// from the creator recheck under the lock. No task (and no assignee row) may be written.
test("POST task by a creator removed from the project while waiting for the project lock is 404 and writes no task", async () => {
  const taskCount = async (projectId: number) => (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM tasks
    WHERE project_id = $1`, [projectId])).rows[0]!.n;
  const assigneeRows = async (projectId: number) => (await pool.query<{ n: number }>(`SELECT count(*)::int AS n
    FROM task_assignees a JOIN tasks t USING (task_id) WHERE t.project_id = $1`, [projectId])).rows[0]!.n;
  const body = { taskTitle: "Created while removed", priority: 1, dueDate: bangkokDatePlus(5), assigneeIds: [ids.owner] };

  // Control: the same lock wait without a membership change creates the task (201).
  const control = await newProject("owner", [ids.member]);
  const allowed = await withProjectLockHeld(control, () => api("member", "POST", tasksUrl(control), body), async () => {});
  assert.equal(allowed.status, 201);
  assert.equal(allowed.body.task.createdById, ids.member);
  assert.equal(await taskCount(control), 1);

  const project = await newProject("owner", [ids.member]);
  assert.equal(await taskCount(project), 0);
  const res = await withProjectLockHeld(project, () => api("member", "POST", tasksUrl(project), body), async (gate) => {
    await gate.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [project, ids.member]);
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, "NOT_FOUND");
  assert.equal(await taskCount(project), 0);
  assert.equal(await assigneeRows(project), 0);
  assert.ok((await memberList("owner", project)).some((m) => m.userId === ids.owner)); // assignee still a member
  assert.equal((await api("owner", "GET", tasksUrl(project))).body.tasks.length, 0);
});

test("POST members maps only known constraints; other database errors are a safe 500", async () => {
  const project = await newProject("owner", []);
  const url = membersUrl(project);
  const body = { userId: ids.newcomer };
  const count = async () => (await memberList("owner", project)).length;
  await withFailingTrigger("INSERT", { errcode: "23505", constraint: "project_members_pkey" }, async () => {
    const res = await api("owner", "POST", url, body);
    assert.equal(res.status, 409);
    assert.deepEqual(res.body.error.details, [{ reason: "ALREADY_MEMBER" }]);
  });
  await withFailingTrigger("INSERT", { errcode: "23503", constraint: "project_members_user_id_fkey" }, async () => {
    const res = await api("owner", "POST", url, body);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, "userId");
    assert.equal(JSON.stringify(res.body).includes("SECRET_PROBE"), false);
  });
  await withFailingTrigger("INSERT", { errcode: "23503", constraint: "project_members_project_id_fkey" }, async () => {
    assert.equal((await api("owner", "POST", url, body)).status, 404);
  });
  const unknown: { errcode: string; constraint?: string }[] = [
    { errcode: "23505", constraint: "some_other_unique" }, { errcode: "23505" },
    { errcode: "23503", constraint: "some_other_fkey" }, { errcode: "23503" },
    { errcode: "P0001" }, { errcode: "08006" },
  ];
  for (const failure of unknown) {
    await withFailingTrigger("INSERT", failure, async () => assertSafeInternalError(await api("owner", "POST", url, body)));
  }
  assert.equal(await count(), 1); // every failed insert left nothing behind
});

test("DELETE members: a database failure is a safe 500 and rolls everything back", async () => {
  const project = await newProject("owner", [ids.member]);
  const task = await newTask("owner", project, [ids.owner, ids.member]);
  await withFailingTrigger("DELETE", { errcode: "P0001" }, async () => {
    assertSafeInternalError(await api("owner", "DELETE", `${membersUrl(project)}/${ids.member}`));
  });
  assert.equal((await memberList("owner", project)).length, 2);
  assert.deepEqual((await api("owner", "GET", `${tasksUrl(project)}/${task.taskId}`)).body.task, task); // assignments restored
});

// ---------------------------------------------------------------------------------------------
// GET /api/tasks/mine
// ---------------------------------------------------------------------------------------------

test("GET /api/tasks/mine: another user's id, unknown keys and bad status are rejected", async () => {
  for (const query of [`?userId=${ids.owner}`, "?projectId=1", "?q=report", "?priority=1", "?status=Doing", "?status=To%20do&status=Done", "?page=1"]) {
    const res = await api("mineMember", "GET", `/api/tasks/mine${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, "VALIDATION_ERROR", query);
  }
});

test("GET /api/tasks/mine: a user without assigned tasks gets an empty list", async () => {
  const res = await api("outsider", "GET", "/api/tasks/mine");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, tasks: [] });
});

test("GET /api/tasks/mine: only my assignments across my projects, ordered, filterable, and cut off with membership", async () => {
  const p1 = await newProject("mineOwner", [ids.mineMember]);
  const p2 = await newProject("mineOwner", [ids.mineMember]);
  const p3 = await newProject("mineOwner", []);
  const t1 = await newTask("mineOwner", p1, [ids.mineMember], { taskTitle: "T1", priority: 1, dueDate: bangkokDatePlus(10) });
  const t2 = await newTask("mineOwner", p1, [ids.mineOwner], { taskTitle: "T2", dueDate: bangkokDatePlus(5) });
  const t3 = await newTask("mineOwner", p1, [ids.mineOwner, ids.mineMember], { taskTitle: "T3", dueDate: bangkokDatePlus(5) });
  const t4 = await newTask("mineOwner", p2, [ids.mineMember], { taskTitle: "T4", dueDate: bangkokDatePlus(1) });
  const t5 = await newTask("mineOwner", p3, [ids.mineOwner], { taskTitle: "T5", dueDate: bangkokDatePlus(20) });

  // Identical objects to the project task API; due date then task id decide the order (T2 and T3 tie).
  const mine = await api("mineMember", "GET", "/api/tasks/mine");
  assert.equal(mine.status, 200);
  assert.deepEqual(mine.body.tasks, [t4, t3, t1]);
  const owner = await api("mineOwner", "GET", "/api/tasks/mine");
  assert.deepEqual(owner.body.tasks.map((t: any) => t.taskId), [t2.taskId, t3.taskId, t5.taskId]);
  assert.ok(mine.body.tasks.every((t: any) => typeof t.projectName === "string" && typeof t.isOverdue === "boolean"));

  await setStatus("mineMember", p1, t1.taskId, "In progress");
  const filter = async (status: string) => (await api("mineMember", "GET", `/api/tasks/mine?status=${encodeURIComponent(status)}`))
    .body.tasks.map((t: any) => t.taskId);
  assert.deepEqual(await filter("In progress"), [t1.taskId]);
  assert.deepEqual(await filter("To do"), [t4.taskId, t3.taskId]);
  assert.deepEqual(await filter("Done"), []);

  // Assignments left behind without a membership never show up (membership removed outside the API).
  await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [p2, ids.mineMember]);
  assert.deepEqual((await api("mineMember", "GET", "/api/tasks/mine")).body.tasks.map((t: any) => t.taskId), [t3.taskId, t1.taskId]);
  // An unknown stored role grants nothing.
  await pool.query("UPDATE project_members SET role = 'Unknown' WHERE project_id = $1 AND user_id = $2", [p1, ids.mineMember]);
  assert.deepEqual((await api("mineMember", "GET", "/api/tasks/mine")).body, { success: true, tasks: [] });
});

// ---------------------------------------------------------------------------------------------
// GET /api/dashboard
// ---------------------------------------------------------------------------------------------

const zeroSummary = { projectCount: 0, taskCount: 0, statusCounts: { todo: 0, inProgress: 0, done: 0 }, overdueCount: 0, highPriorityCount: 0 };

test("GET /api/dashboard: bad or unknown query values are rejected and a user without projects gets zeros", async () => {
  for (const query of [`?userId=${ids.owner}`, "?projectId=1", "?limit=0", "?limit=101", "?limit=abc", "?limit=1.5",
    "?limit=-1", "?limit=", "?limit=5&limit=6"]) {
    const res = await api("outsider", "GET", `/api/dashboard${query}`);
    assert.equal(res.status, 400, query);
    assert.equal(res.body.error.code, "VALIDATION_ERROR", query);
  }
  const res = await api("outsider", "GET", "/api/dashboard");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, summary: zeroSummary, highPriorityTasks: [] }); // exactly these keys
  for (const limit of ["1", "100"]) {
    assert.equal((await api("outsider", "GET", `/api/dashboard?limit=${limit}`)).status, 200, limit);
  }
});

test("GET /api/dashboard: counts every task of my projects once, follows changes and membership", async () => {
  const pA = await newProject("dashOwner", [ids.dashMember]);
  const t1 = await newTask("dashOwner", pA, [ids.dashOwner, ids.dashMember], { priority: 1, dueDate: bangkokDatePlus(-1) }); // To do, overdue, high
  const t2 = await newTask("dashOwner", pA, [ids.dashOwner, ids.dashMember], { priority: 1, dueDate: bangkokDatePlus(0) });  // Doing, due today, high
  const t3 = await newTask("dashOwner", pA, [ids.dashOwner], { priority: 1, dueDate: bangkokDatePlus(-1) });                  // Done: not overdue, not high
  await newTask("dashOwner", pA, [ids.dashOwner], { priority: 2, dueDate: bangkokDatePlus(7) });                              // To do, future
  await setStatus("dashOwner", pA, t2.taskId, "In progress");
  await setStatus("dashOwner", pA, t3.taskId, "Done");
  const summary = async (who: Name) => {
    const res = await api(who, "GET", "/api/dashboard");
    assert.equal(res.status, 200);
    return res.body.summary;
  };
  const expected = { projectCount: 1, taskCount: 4, statusCounts: { todo: 2, inProgress: 1, done: 1 }, overdueCount: 1, highPriorityCount: 2 };
  assert.deepEqual(await summary("dashOwner"), expected);
  assert.deepEqual(await summary("dashMember"), expected); // scope is the whole project, not only my assignments
  assert.deepEqual(await summary("outsider"), zeroSummary);

  await newProject("dashOwner", []); // an empty project counts as a project but adds no tasks
  assert.deepEqual(await summary("dashOwner"), { ...expected, projectCount: 2 });
  assert.deepEqual(await summary("dashMember"), expected);

  await setStatus("dashOwner", pA, t1.taskId, "Done"); // finishing the overdue high task
  assert.deepEqual(await summary("dashOwner"), { projectCount: 2, taskCount: 4,
    statusCounts: { todo: 1, inProgress: 1, done: 2 }, overdueCount: 0, highPriorityCount: 1 });

  const removed = await api("dashOwner", "DELETE", `${membersUrl(pA)}/${ids.dashMember}`);
  assert.equal(removed.status, 200);
  assert.deepEqual(await summary("dashMember"), zeroSummary); // access and numbers disappear together

  await pool.query("UPDATE project_members SET role = 'Unknown' WHERE project_id = $1 AND user_id = $2", [pA, ids.dashOwner]);
  assert.deepEqual(await summary("dashOwner"), { ...zeroSummary, projectCount: 1 }); // only the empty project still counts
});

test("GET /api/dashboard: highPriorityTasks lists priority-1 open tasks of my projects in contract order", async () => {
  const pA = await newProject("dashOwner", [ids.dashMember]);
  const pB = await newProject("dashOwner", []); // dashMember is not a member of pB
  const late = await newTask("dashOwner", pA, [ids.dashOwner], { taskTitle: "late", priority: 1, dueDate: bangkokDatePlus(-2) });
  const soonA = await newTask("dashOwner", pA, [ids.dashOwner, ids.dashMember], { taskTitle: "soonA", priority: 1, dueDate: bangkokDatePlus(3) });
  const soonB = await newTask("dashOwner", pB, [ids.dashOwner], { taskTitle: "soonB", priority: 1, dueDate: bangkokDatePlus(3) });
  const done = await newTask("dashOwner", pA, [ids.dashOwner], { taskTitle: "done", priority: 1, dueDate: bangkokDatePlus(1) });
  await newTask("dashOwner", pA, [ids.dashOwner], { taskTitle: "low", priority: 2, dueDate: bangkokDatePlus(0) });
  await setStatus("dashOwner", pA, done.taskId, "Done");

  const list = async (who: Name, query = "") => {
    const res = await api(who, "GET", `/api/dashboard${query}`);
    assert.equal(res.status, 200);
    return res.body as { summary: any; highPriorityTasks: any[] };
  };

  // Due date, then task id (soonA and soonB tie on date); the same Task object as the project task API.
  const owner = await list("dashOwner");
  assert.deepEqual(owner.highPriorityTasks, [late, soonA, soonB]);
  assert.equal(owner.summary.highPriorityCount, 3); // count and list use the same definition
  assert.deepEqual((await list("dashOwner", "?limit=1")).highPriorityTasks, [late]);

  // A member sees priority-1 tasks of projects they belong to, assigned or not; never another project's.
  assert.deepEqual((await list("dashMember")).highPriorityTasks, [late, soonA]);
  assert.deepEqual((await list("outsider")).highPriorityTasks, []);

  // Leaving the project removes its tasks from the list at once.
  await setStatus("dashOwner", pA, soonA.taskId, "Done");
  assert.equal((await api("dashOwner", "DELETE", `${membersUrl(pA)}/${ids.dashMember}`)).status, 200);
  assert.deepEqual((await list("dashMember")).highPriorityTasks, []);
  assert.deepEqual((await list("dashOwner")).highPriorityTasks, [late, soonB]);
});

// ---------------------------------------------------------------------------------------------
// progressPercent on GET /api/projects (Dashboard project cards)
// ---------------------------------------------------------------------------------------------

test("GET /api/projects: progressPercent is ROUND(100 x done / total), 0 for a project without tasks", async () => {
  const empty = await newProject("progressOwner", []);
  const partial = await newProject("progressOwner", []);
  const progress = async () => {
    const res = await api("progressOwner", "GET", "/api/projects?pageSize=50");
    assert.equal(res.status, 200);
    const pick = (id: number) => {
      const p = res.body.projects.find((row: any) => row.projectId === id);
      return { progressPercent: p.progressPercent, totalTasks: p.totalTasks, completedTasks: p.completedTasks };
    };
    return { empty: pick(empty), partial: pick(partial) };
  };
  const detail = async (id: number) => (await api("progressOwner", "GET", projectUrl(id))).body.project.progressPercent;

  assert.deepEqual((await progress()).empty, { progressPercent: 0, totalTasks: 0, completedTasks: 0 });
  assert.equal(await detail(empty), 0);

  const tasks = [];
  for (let i = 0; i < 3; i++) tasks.push(await newTask("progressOwner", partial, [ids.progressOwner]));
  assert.deepEqual((await progress()).partial, { progressPercent: 0, totalTasks: 3, completedTasks: 0 });
  await setStatus("progressOwner", partial, tasks[0].taskId, "Done");
  await setStatus("progressOwner", partial, tasks[1].taskId, "In progress"); // in progress is not completed
  assert.deepEqual((await progress()).partial, { progressPercent: 33, totalTasks: 3, completedTasks: 1 }); // 33.3 -> 33
  await setStatus("progressOwner", partial, tasks[1].taskId, "Done");
  assert.deepEqual((await progress()).partial, { progressPercent: 67, totalTasks: 3, completedTasks: 2 }); // 66.7 -> 67
  assert.equal(await detail(partial), 67);
  assert.deepEqual((await progress()).empty, { progressPercent: 0, totalTasks: 0, completedTasks: 0 }); // still 0
});
