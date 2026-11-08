import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "../src/db.js";
import { provisionAccount, seedAuth } from "../src/provisioning/accounts.js";
import { seedDemoProjects } from "../src/provisioning/demoProjects.js";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
const port = 5100 + Math.floor(Math.random() * 800);
const base = `http://localhost:${port}`;
const origin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
let server: ChildProcess;
let recovery_directory: string;
let shared = 0, privateId = 0;
const ids = { owner: 0, member: 0, outsider: 0 };
const cookies: Record<"owner" | "member" | "outsider", string> = { owner: "", member: "", outsider: "" };
const extra: { users: Awaited<ReturnType<typeof provisionAccount>>[]; passwords: string[] } = { users: [], passwords: [] };

type Who = keyof typeof cookies | null;
async function api(who: Who, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: origin, ...(who ? { Cookie: cookies[who] } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() as any };
}
const tasksUrl = (projectId: number) => `/api/projects/${projectId}/tasks`;
// Due dates are computed at run time (Bangkok calendar, as the API uses) so isOverdue assertions never expire.
function bangkokDatePlus(days: number): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date());
  return new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
const dueDate = bangkokDatePlus(30);
const laterDueDate = bangkokDatePlus(60);
const valid = (assigneeIds: number[]) => ({ taskTitle: "Write plan", priority: 2, dueDate, assigneeIds });

async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ email, password }) });
  assert.equal(res.status, 200);
  return res.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
}
async function callWith(cookie: string, method: string, path: string, body?: unknown) {
  const response = await fetch(base + path, { method,
    headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
}

// Simulates a database failure inside the real server by installing a trigger in the isolated test
// database. Every value interpolated into SQL is a constant from this file, never request data.
const LEAK = "SECRET_PROBE password=hunter2 INSERT INTO tasks";
async function withFailingTrigger(table: "tasks" | "task_assignees", event: "INSERT" | "UPDATE",
  failure: { errcode: string; constraint?: string }, run: () => Promise<void>): Promise<void> {
  const using = `ERRCODE = '${failure.errcode}'${failure.constraint ? `, CONSTRAINT = '${failure.constraint}'` : ""}`;
  await pool.query(`CREATE FUNCTION w3_probe_fail() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION '${LEAK}' USING ${using}; END $$`);
  await pool.query(`CREATE TRIGGER w3_probe_fail BEFORE ${event} ON ${table}
    FOR EACH ROW EXECUTE FUNCTION w3_probe_fail()`);
  try { await run(); }
  finally {
    await pool.query(`DROP TRIGGER w3_probe_fail ON ${table}`);
    await pool.query("DROP FUNCTION w3_probe_fail()");
  }
}
function assertSafeInternalError(res: { status: number; body: any }) {
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } });
  const text = JSON.stringify(res.body);
  for (const secret of ["SECRET_PROBE", "hunter2", "INSERT", "_fkey", "23503", "stack"]) assert.equal(text.includes(secret), false, secret);
}

before(async () => {
  recovery_directory = await mkdtemp(join(tmpdir(), "mobg-w3-recovery-"));
  const passwords = [1, 2, 3].map(() => randomBytes(24).toString("hex"));
  const roles = ["owner", "member", "outsider"] as const;
  const users: Awaited<ReturnType<typeof provisionAccount>>[] = [];
  for (const [i, role] of roles.entries()) {
    users.push(await provisionAccount({ name: `W3 ${role}`, email: `w3-${role}@example.test`,
      password: passwords[i]!, recovery_directory }));
    ids[role] = Number(users[i]!.user_id);
  }
  const projects = await seedDemoProjects({ owner_id: ids.owner, member_id: ids.member, outsider_id: ids.outsider });
  shared = Number(projects.shared_project_id);
  privateId = Number(projects.private_project_id);

  server = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "pipe"],
  });
  // Expected 500 probes make the server log errors; keep them out of the test output unless startup fails.
  let serverLog = "";
  server.stderr!.on("data", (chunk) => { serverLog += String(chunk); });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server did not start\n${serverLog}`)), 20000);
    server.stdout!.on("data", (chunk) => { if (String(chunk).includes("running")) { clearTimeout(timer); resolve(); } });
    server.once("exit", () => reject(new Error(`Server exited early\n${serverLog}`)));
  });
  for (const [i, role] of roles.entries()) cookies[role] = await signIn(users[i]!.email, passwords[i]!);
  extra.users = users;
  extra.passwords = passwords;
});
after(async () => {
  server?.kill();
  await pool.end();
  await rm(recovery_directory, { recursive: true, force: true });
});

test("authentication, membership and ID validation come first", async () => {
  assert.equal((await api(null, "GET", tasksUrl(shared))).status, 401);
  assert.equal((await api(null, "POST", tasksUrl(shared), valid([ids.owner]))).status, 401);
  const outsiderRead = await api("outsider", "GET", tasksUrl(shared));
  assert.equal(outsiderRead.status, 404);
  assert.equal(outsiderRead.body.error.code, "NOT_FOUND");
  assert.equal((await api("outsider", "POST", tasksUrl(shared), valid([ids.owner]))).status, 404);
  assert.equal((await api("owner", "GET", tasksUrl(999999))).status, 404);
  assert.equal((await api("owner", "GET", "/api/projects/1abc/tasks")).status, 400);
  assert.equal((await api("owner", "GET", `${tasksUrl(shared)}/1abc`)).status, 400);
});

test("membership lost after route validation returns 400 on create and update, with no partial writes", async () => {
  const project = await api("owner", "POST", "/api/projects", { projectName: "W4 validation race",
    startDate: "2026-01-01", memberIds: [ids.member] });
  assert.equal(project.status, 201);
  const projectId = project.body.project.projectId;
  const created = await api("owner", "POST", tasksUrl(projectId), valid([ids.owner]));
  assert.equal(created.status, 201);
  const taskId = created.body.task.taskId;
  // Simulate membership disappearing between the HTTP precheck and the DB recheck.
  // This is error mapping evidence; the true concurrent transaction test is in w4Db.test.ts.
  await pool.query(`CREATE FUNCTION w4_lose_membership() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      DELETE FROM project_members WHERE project_id = NEW.project_id AND role = 'Member';
      RETURN NEW;
    END $$;
    CREATE TRIGGER w4_lose_membership BEFORE INSERT OR UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION w4_lose_membership()`);
  try {
    for (const method of ["POST", "PATCH"] as const) {
      const response = await api("owner", method, tasksUrl(projectId) + (method === "PATCH" ? `/${taskId}` : ""), valid([ids.member]));
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.equal(response.body.error.details[0].field, "assigneeIds");
    }
    assert.deepEqual((await api("owner", "GET", `${tasksUrl(projectId)}/${taskId}`)).body.task, created.body.task);
    assert.equal((await api("owner", "GET", tasksUrl(projectId))).body.tasks.length, 1);
  } finally {
    await pool.query("DROP TRIGGER w4_lose_membership ON tasks; DROP FUNCTION w4_lose_membership()");
  }
});

test("empty project returns an empty list; invalid status is rejected", async () => {
  const empty = await api("owner", "GET", tasksUrl(shared));
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body, { success: true, tasks: [] });
  const bad = await api("owner", "GET", `${tasksUrl(shared)}?status=Doing`);
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_ERROR");
  assert.equal((await api("owner", "GET", `${tasksUrl(shared)}?foo=1`)).status, 400);
});

test("Member creates a task as To do with the session creator; invalid input is rejected", async () => {
  const created = await api("member", "POST", tasksUrl(shared), { ...valid([ids.member, ids.owner]), taskDescription: "Details" });
  assert.equal(created.status, 201);
  const task = created.body.task;
  assert.equal(task.status, "To do");
  assert.equal(task.createdById, ids.member);
  assert.equal(task.projectId, shared);
  assert.equal(task.dueDate, dueDate);
  assert.equal(task.isOverdue, false);
  assert.equal(task.assignees.length, 2);
  assert.equal(typeof task.taskId, "number");

  const bodies: [string, unknown][] = [
    ["forged creator", { ...valid([ids.member]), createdBy: ids.owner }],
    ["forged status", { ...valid([ids.member]), status: "Done" }],
    ["no assignees", valid([])],
    ["duplicate assignees", valid([ids.member, ids.member])],
    ["null dueDate", { ...valid([ids.member]), dueDate: null }],
    ["bad calendar date", { ...valid([ids.member]), dueDate: "2026-02-30" }],
    ["empty title", { ...valid([ids.member]), taskTitle: "   " }],
    ["long title", { ...valid([ids.member]), taskTitle: "x".repeat(201) }],
    ["bad priority", { ...valid([ids.member]), priority: 4 }],
  ];
  for (const [label, body] of bodies) {
    const res = await api("member", "POST", tasksUrl(shared), body);
    assert.equal(res.status, 400, label);
    assert.equal(res.body.error.code, "VALIDATION_ERROR", label);
  }
  const outsider = await api("member", "POST", tasksUrl(shared), valid([ids.outsider]));
  assert.equal(outsider.status, 400);
  assert.equal(outsider.body.error.details[0].field, "assigneeIds");
  // Member is not in the private project.
  assert.equal((await api("member", "POST", tasksUrl(privateId), valid([ids.owner]))).status, 404);
  const list = await api("owner", "GET", tasksUrl(shared));
  assert.equal(list.body.tasks.length, 1); // rejected requests created nothing
});

test("PATCH changes only sent fields, clears with null, replaces assignees, rejects bad input", async () => {
  const created = await api("owner", "POST", tasksUrl(shared), { ...valid([ids.owner, ids.member]), taskDescription: "Keep me" });
  const id = created.body.task.taskId;
  const url = `${tasksUrl(shared)}/${id}`;
  const before = created.body.task;

  const status = await api("member", "PATCH", url, { status: "In progress" });
  assert.equal(status.status, 200);
  assert.deepEqual(status.body.task, { ...before, status: "In progress" });
  const priority = await api("member", "PATCH", url, { priority: 1 });
  assert.deepEqual(priority.body.task, { ...before, status: "In progress", priority: 1 });

  const filtered = await api("owner", "GET", `${tasksUrl(shared)}?status=In%20progress`);
  assert.deepEqual(filtered.body.tasks.map((t: any) => t.taskId), [id]);

  const cleared = await api("owner", "PATCH", url, { taskDescription: null });
  assert.equal(cleared.body.task.taskDescription, null);
  assert.equal(cleared.body.task.taskTitle, "Write plan");
  assert.equal(cleared.body.task.assignees.length, 2);

  const replaced = await api("owner", "PATCH", url, { assigneeIds: [ids.member] });
  assert.deepEqual(replaced.body.task.assignees.map((a: any) => a.userId), [ids.member]);
  assert.equal(replaced.body.task.status, "In progress");

  for (const [label, body] of [["empty body", {}], ["null dueDate", { dueDate: null }],
    ["empty assignees", { assigneeIds: [] }], ["unknown field", { projectId: privateId }],
    ["bad status", { status: "Doing" }]] as const) {
    const res = await api("owner", "PATCH", url, body);
    assert.equal(res.status, 400, label);
  }
  const outsider = await api("owner", "PATCH", url, { assigneeIds: [ids.outsider] });
  assert.equal(outsider.status, 400);
  assert.equal(outsider.body.error.details[0].field, "assigneeIds");
  assert.deepEqual((await api("owner", "GET", url)).body.task, replaced.body.task); // failures changed nothing
  assert.equal((await api("outsider", "PATCH", url, { priority: 3 })).status, 404);
  assert.equal((await api("owner", "PATCH", `${tasksUrl(shared)}/999999`, { priority: 3 })).status, 404);
});

test("a task is only reachable through its own project", async () => {
  const inPrivate = await api("owner", "POST", tasksUrl(privateId), valid([ids.owner]));
  assert.equal(inPrivate.status, 201);
  const id = inPrivate.body.task.taskId;
  assert.equal((await api("owner", "GET", `${tasksUrl(privateId)}/${id}`)).status, 200);
  for (const [method, body] of [["GET", undefined], ["PATCH", { priority: 3 }], ["DELETE", undefined]] as const) {
    const res = await api("owner", method, `${tasksUrl(shared)}/${id}`, body);
    assert.equal(res.status, 404, method);
  }
  assert.equal((await api("owner", "GET", `${tasksUrl(privateId)}/${id}`)).body.task.priority, 2);
});

test("only an Owner deletes; related rows are removed and repeats return 404", async () => {
  const created = await api("owner", "POST", tasksUrl(shared), valid([ids.member]));
  const id = created.body.task.taskId;
  const url = `${tasksUrl(shared)}/${id}`;
  await pool.query("INSERT INTO comments (task_id, user_id, comment_text) VALUES ($1, $2, 'bye')", [id, ids.member]);
  assert.equal((await api("member", "DELETE", url)).status, 403);
  assert.equal((await api("outsider", "DELETE", url)).status, 404);
  assert.equal((await api(null, "DELETE", url)).status, 401);
  assert.equal((await api("owner", "GET", url)).status, 200);
  const deleted = await api("owner", "DELETE", url);
  assert.deepEqual(deleted.body, { success: true, message: "Task deleted" });
  assert.equal((await api("owner", "GET", url)).status, 404);
  assert.equal((await api("owner", "DELETE", url)).status, 404);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [id])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM task_assignees WHERE task_id = $1", [id])).rowCount, 0);
});

test("project summary reflects task changes made through the API", async () => {
  const before = await api("owner", "GET", `/api/projects/${privateId}`);
  const created = await api("owner", "POST", tasksUrl(privateId), valid([ids.owner]));
  await api("owner", "PATCH", `${tasksUrl(privateId)}/${created.body.task.taskId}`, { status: "Done" });
  const after = (await api("owner", "GET", `/api/projects/${privateId}`)).body.project;
  assert.equal(after.totalTasks, before.body.project.totalTasks + 1);
  assert.equal(after.completedTasks, before.body.project.completedTasks + 1);
});

test("the foreign keys the route relies on keep their expected names", async () => {
  const rows = (await pool.query(`SELECT c.conname, t.relname AS child, r.relname AS parent
    FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_class r ON r.oid = c.confrelid
    WHERE c.contype = 'f' AND c.conname = ANY($1::text[])`,
  [["task_assignees_user_id_fkey", "task_assignees_task_id_fkey", "tasks_project_id_fkey",
    "tasks_created_by_fkey", "tasks_status_id_fkey"]])).rows;
  const byName = Object.fromEntries(rows.map((row) => [row.conname, `${row.child}->${row.parent}`]));
  assert.deepEqual(byName, {
    task_assignees_user_id_fkey: "task_assignees->users", task_assignees_task_id_fkey: "task_assignees->tasks",
    tasks_project_id_fkey: "tasks->projects", tasks_created_by_fkey: "tasks->users", tasks_status_id_fkey: "tasks->task_statuses",
  });
});

test("only the assignee user FK becomes a 400 on create; other database errors are a safe 500", async () => {
  const count = async () => (await api("owner", "GET", tasksUrl(shared))).body.tasks.length;
  const before = await count();
  await withFailingTrigger("task_assignees", "INSERT", { errcode: "23503", constraint: "task_assignees_user_id_fkey" }, async () => {
    const res = await api("member", "POST", tasksUrl(shared), valid([ids.member]));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "VALIDATION_ERROR");
    assert.equal(res.body.error.details[0].field, "assigneeIds");
    assert.equal(JSON.stringify(res.body).includes("SECRET_PROBE"), false);
  });
  const probes: { table: "tasks" | "task_assignees"; errcode: string; constraint?: string }[] = [
    { table: "tasks", errcode: "23503", constraint: "tasks_project_id_fkey" },
    { table: "tasks", errcode: "23503", constraint: "tasks_created_by_fkey" },
    { table: "tasks", errcode: "23503", constraint: "tasks_status_id_fkey" },
    { table: "tasks", errcode: "23503" },                                          // FK without a constraint name
    { table: "task_assignees", errcode: "23503", constraint: "task_assignees_task_id_fkey" },
    { table: "task_assignees", errcode: "23505", constraint: "task_assignees_pkey" },
    { table: "tasks", errcode: "P0001" },                                          // unknown error
    { table: "tasks", errcode: "08006" },                                          // connection failure class
  ];
  for (const probe of probes) {
    await withFailingTrigger(probe.table, "INSERT", probe, async () => {
      assertSafeInternalError(await api("member", "POST", tasksUrl(shared), valid([ids.member])));
    });
  }
  assert.equal(await count(), before); // every failed create rolled back
});

test("PATCH maps only the assignee user FK to 400; other database errors are a safe 500 and change nothing", async () => {
  const created = await api("owner", "POST", tasksUrl(shared), valid([ids.owner, ids.member]));
  const id = created.body.task.taskId;
  const url = `${tasksUrl(shared)}/${id}`;
  const original = (await api("owner", "GET", url)).body.task;
  await withFailingTrigger("task_assignees", "INSERT", { errcode: "23503", constraint: "task_assignees_user_id_fkey" }, async () => {
    const res = await api("owner", "PATCH", url, { assigneeIds: [ids.member] });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].field, "assigneeIds");
    assert.equal(JSON.stringify(res.body).includes("SECRET_PROBE"), false);
  });
  await withFailingTrigger("task_assignees", "INSERT", { errcode: "23503", constraint: "task_assignees_task_id_fkey" }, async () => {
    assertSafeInternalError(await api("owner", "PATCH", url, { assigneeIds: [ids.member] }));
  });
  // No assigneeIds in the request: even the assignee constraint name cannot be an input error.
  await withFailingTrigger("tasks", "UPDATE", { errcode: "23503", constraint: "task_assignees_user_id_fkey" }, async () => {
    assertSafeInternalError(await api("owner", "PATCH", url, { priority: 1 }));
  });
  await withFailingTrigger("tasks", "UPDATE", { errcode: "23503", constraint: "tasks_status_id_fkey" }, async () => {
    assertSafeInternalError(await api("owner", "PATCH", url, { status: "Done" }));
  });
  await withFailingTrigger("tasks", "UPDATE", { errcode: "P0001" }, async () => {
    assertSafeInternalError(await api("owner", "PATCH", url, { taskTitle: "Never saved" }));
  });
  assert.deepEqual((await api("owner", "GET", url)).body.task, original);
});

test("PATCH of title, date or description leaves every other field unchanged", async () => {
  const created = await api("owner", "POST", tasksUrl(shared), { ...valid([ids.owner, ids.member]), taskDescription: "Original" });
  const url = `${tasksUrl(shared)}/${created.body.task.taskId}`;
  // Start from a non-default state so a stray reset of status/priority would be visible.
  await api("member", "PATCH", url, { status: "In progress", priority: 1 });
  let current = (await api("owner", "GET", url)).body.task;
  assert.equal(current.status, "In progress");
  assert.equal(current.priority, 1);
  const steps: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ["title", { taskTitle: "  Renamed  " }, { taskTitle: "Renamed" }],
    ["due date", { dueDate: laterDueDate }, { dueDate: laterDueDate }],
    ["description", { taskDescription: "New text" }, { taskDescription: "New text" }],
    ["empty description", { taskDescription: "" }, { taskDescription: "" }],
  ];
  for (const [label, patch, change] of steps) {
    const res = await api("member", "PATCH", url, patch);
    assert.equal(res.status, 200, label);
    current = { ...current, ...change };
    assert.deepEqual(res.body.task, current, label);
    assert.deepEqual((await api("owner", "GET", url)).body.task, current, label);
  }
  assert.equal(current.isOverdue, false);
});

test("anonymous requests, garbage cookies and an expired session get 401 on detail and PATCH", async () => {
  const created = await api("owner", "POST", tasksUrl(shared), valid([ids.owner]));
  const url = `${tasksUrl(shared)}/${created.body.task.taskId}`;
  const before = (await api("owner", "GET", url)).body.task;
  for (const [method, body] of [["GET", undefined], ["PATCH", { priority: 3 }], ["DELETE", undefined]] as const) {
    const res = await api(null, method, url, body);
    assert.equal(res.status, 401, method);
    assert.equal(res.body.error.code, "UNAUTHENTICATED", method);
  }
  assert.equal((await callWith("better-auth.session_token=not-a-real-session", "GET", url)).status, 401);

  const password = randomBytes(24).toString("hex");
  const expiring = await provisionAccount({ name: "W3 expiry", email: "w3-expiry@example.test", password, recovery_directory });
  const cookie = await signIn(expiring.email, password);
  assert.equal((await callWith(cookie, "GET", "/api/me")).status, 200); // the session was valid first
  const expired = await pool.query("UPDATE auth_sessions SET expires_at = '2000-01-01 00:00:00+00' WHERE user_id = $1", [expiring.auth_user_id]);
  assert.equal(expired.rowCount, 1);
  for (const [method, path, body] of [["GET", "/api/me", undefined], ["GET", tasksUrl(shared), undefined],
    ["GET", url, undefined], ["PATCH", url, { priority: 3 }], ["DELETE", url, undefined]] as const) {
    const res = await callWith(cookie, method, path, body);
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.equal(res.body.error.code, "UNAUTHENTICATED");
  }
  assert.deepEqual((await api("owner", "GET", url)).body.task, before); // nothing changed
});

test("a valid session without a linked MobG profile gets 403 on every task route", async () => {
  const email = "w3-unlinked@example.test";
  const password = randomBytes(24).toString("hex");
  await seedAuth.api.signUpEmail({ body: { name: "W3 unlinked", email, password } });
  assert.equal((await pool.query("SELECT 1 FROM users WHERE lower(email) = $1", [email])).rowCount, 0);
  const cookie = await signIn(email, password);
  const created = await api("owner", "POST", tasksUrl(shared), valid([ids.owner]));
  const url = `${tasksUrl(shared)}/${created.body.task.taskId}`;
  const before = (await api("owner", "GET", url)).body.task;
  for (const [method, path, body] of [["GET", "/api/me", undefined], ["GET", tasksUrl(shared), undefined],
    ["GET", url, undefined], ["POST", tasksUrl(shared), valid([ids.owner])],
    ["PATCH", url, { priority: 3 }], ["DELETE", url, undefined]] as const) {
    const res = await callWith(cookie, method, path, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.error.code, "FORBIDDEN");
  }
  assert.deepEqual((await api("owner", "GET", url)).body.task, before);
});
