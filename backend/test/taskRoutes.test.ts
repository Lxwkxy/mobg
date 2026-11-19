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
import { withProjectLockHeld } from "./helpers/projectLock.js";

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
async function withFailingTrigger(table: "tasks" | "task_assignees" | "comments", event: "INSERT" | "UPDATE",
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

test("owners and unassigned members can persist comments on another person's task", async () => {
  const task = await api("owner", "POST", tasksUrl(shared), valid([ids.owner]));
  assert.equal(task.status, 201);
  const taskId = task.body.task.taskId;
  const url = `${tasksUrl(shared)}/${taskId}/comments`;
  assert.deepEqual((await api("member", "GET", url)).body, { success: true, comments: [] });

  const content = "ตรวจงานแล้ว\n<script>alert('safe text')</script>";
  const member = await api("member", "POST", url, { commentText: `  ${content}  ` });
  assert.equal(member.status, 201);
  assert.deepEqual(member.body.comment, {
    commentId: member.body.comment.commentId, commentText: content,
    createdAt: member.body.comment.createdAt, userId: ids.member, userName: "W3 member",
  });
  assert.ok(Number.isSafeInteger(member.body.comment.commentId));
  assert.ok(Number.isFinite(Date.parse(member.body.comment.createdAt)));
  const owner = await api("owner", "POST", url, { commentText: "Thanks!" });
  assert.equal(owner.status, 201);
  assert.equal(owner.body.comment.userId, ids.owner);
  // Equal timestamps still have a stable order by comment ID.
  await pool.query("UPDATE comments SET comment_created_at = '2026-01-01' WHERE task_id = $1", [taskId]);
  const list = await api("member", "GET", url);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.comments.map((c: any) => c.commentId),
    [member.body.comment.commentId, owner.body.comment.commentId]);
  const stored = (await pool.query("SELECT comment_text, user_id FROM comments WHERE comment_id = $1",
    [member.body.comment.commentId])).rows[0];
  assert.equal(stored.comment_text, content);
  assert.equal(Number(stored.user_id), ids.member);
  assert.equal((await api("owner", "DELETE", `${tasksUrl(shared)}/${taskId}`)).status, 200);
  assert.equal((await api("member", "GET", url)).status, 404);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [taskId])).rowCount, 0);
});

test("comments reject outsiders, wrong project tasks, missing tasks, invalid input and forged authors", async () => {
  const created = await api("owner", "POST", tasksUrl(shared), valid([ids.owner]));
  const taskId = created.body.task.taskId;
  const url = `${tasksUrl(shared)}/${taskId}/comments`;
  for (const method of ["GET", "POST"]) {
    const body = method === "POST" ? { commentText: "Denied" } : undefined;
    assert.equal((await api(null, method, url, body)).status, 401);
    assert.equal((await api("outsider", method, url, body)).status, 404);
    assert.equal((await api("owner", method, `${tasksUrl(privateId)}/${taskId}/comments`, body)).status, 404);
    assert.equal((await api("owner", method, `${tasksUrl(shared)}/999999999/comments`, body)).status, 404);
    assert.equal((await api("owner", method, `${tasksUrl(shared)}/bad/comments`, body)).status, 400);
  }
  for (const body of [{}, { commentText: " \n\t " }, { commentText: 123 }, { commentText: null },
    { commentText: "Forged", userId: ids.owner }, { commentText: "Forged", taskId }]) {
    assert.equal((await api("member", "POST", url, body)).status, 400);
  }
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [taskId])).rowCount, 0);
  assert.equal((await api("owner", "DELETE", `${tasksUrl(shared)}/${taskId}`)).status, 200);
});

test("removed members lose read and write comment access", async () => {
  const project = await api("owner", "POST", "/api/projects", {
    projectName: "Comment access", startDate: "2026-01-01", memberIds: [ids.member],
  });
  const projectId = project.body.project.projectId;
  const task = await api("owner", "POST", tasksUrl(projectId), valid([ids.owner]));
  const url = `${tasksUrl(projectId)}/${task.body.task.taskId}/comments`;
  assert.equal((await api("member", "POST", url, { commentText: "Before removal" })).status, 201);
  assert.equal((await api("owner", "DELETE", `/api/projects/${projectId}/members/${ids.member}`)).status, 200);
  assert.equal((await api("member", "GET", url)).status, 404);
  assert.equal((await api("member", "POST", url, { commentText: "After removal" })).status, 404);
  assert.equal((await api("owner", "GET", url)).body.comments.length, 1);
});

test("a comment waiting for the project lock cannot write after its author is removed", async () => {
  const project = await api("owner", "POST", "/api/projects", {
    projectName: "Comment removal race", startDate: "2026-01-01", memberIds: [ids.member],
  });
  const projectId = project.body.project.projectId;
  const task = await api("owner", "POST", tasksUrl(projectId), valid([ids.owner]));
  const taskId = task.body.task.taskId;
  const url = `${tasksUrl(projectId)}/${taskId}/comments`;
  const result = await withProjectLockHeld(projectId,
    () => api("member", "POST", url, { commentText: "Cannot write after removal" }),
    async (gate) => {
      await gate.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, ids.member]);
    });
  assert.equal(result.status, 404);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [taskId])).rowCount, 0);
});

test("comment database failures return safe errors without saving a partial comment", async () => {
  const task = await api("owner", "POST", tasksUrl(shared), valid([ids.owner]));
  const taskId = task.body.task.taskId;
  const url = `${tasksUrl(shared)}/${taskId}/comments`;
  await withFailingTrigger("comments", "INSERT", { errcode: "P0001" }, async () => {
    assertSafeInternalError(await api("member", "POST", url, { commentText: "Try again" }));
  });
  assert.deepEqual((await api("owner", "GET", url)).body.comments, []);
  assert.equal((await api("member", "POST", url, { commentText: "Recovered" })).status, 201);
  assert.equal((await api("owner", "DELETE", `${tasksUrl(shared)}/${taskId}`)).status, 200);
});

test("browser comments persist and appear in both activity feeds through the real API and database", {
  skip: !process.env.COMMENTS_WEB_URL,
}, async () => {
  // Browser coverage is optional; ordinary backend CI does not install root dependencies.
  const playwrightModule = "playwright";
  const { chromium } = await import(playwrightModule);
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const task = await api("owner", "POST", tasksUrl(shared), valid([ids.owner]));
  const taskId = task.body.task.taskId;
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const web = process.env.COMMENTS_WEB_URL!;
    // Forward browser requests to this test's isolated API, with a real member session.
    // Responses and persisted data come from the running backend, not fixtures.
    await page.route("**/api/**", async (route: any) => {
      const request = route.request();
      const url = new URL(request.url());
      const headers = { "Access-Control-Allow-Origin": new URL(web).origin,
        "Access-Control-Allow-Credentials": "true", "Access-Control-Allow-Headers": "content-type" };
      if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      const response = await route.fetch({ url: base + url.pathname + url.search,
        headers: { ...request.headers(), Origin: origin, Cookie: cookies.member } });
      await route.fulfill({ response, headers: { ...response.headers(), ...headers } });
    });
    await page.goto(`${web}/projects/${shared}/tasks/${taskId}`);
    const section = page.getByRole("region", { name: "Comments" });
    const activity = page.getByRole("region", { name: "Activity" });
    await activity.getByText("created this task", { exact: false }).waitFor();
    const content = "Browser to PostgreSQL: ตรวจงานของคนอื่นแล้ว";
    await section.getByLabel("Add a comment").fill(content);
    await section.getByRole("button", { name: "Post comment", exact: true }).click();
    await section.getByRole("listitem").getByText(content, { exact: true }).waitFor();
    await activity.getByText(content, { exact: true }).waitFor();
    const saved = (await pool.query("SELECT comment_text, user_id FROM comments WHERE task_id = $1", [taskId])).rows;
    assert.deepEqual(saved, [{ comment_text: content, user_id: String(ids.member) }]);
    await page.reload();
    await section.getByRole("listitem").getByText(content, { exact: true }).waitFor();
    assert.equal(await section.getByRole("listitem").count(), 1);
    await page.screenshot({ path: "../web/.next/task-comments-smoke.png", fullPage: true });
    await page.getByRole("link", { name: "Back to Project" }).click();
    await page.waitForURL(`**/projects/${shared}`);
    const entry = activity.getByRole("listitem").filter({ hasText: content });
    await entry.waitFor();
    assert.equal(await entry.getByRole("link").getAttribute("href"), `/projects/${shared}/tasks/${taskId}`);
  } finally {
    await browser.close();
    await api("owner", "DELETE", `${tasksUrl(shared)}/${taskId}`);
  }
});

test("topbar search matches literal names and titles in current project memberships", async () => {
  const search = (who: Who, q: string) => api(who, "GET", `/api/search?${new URLSearchParams({ q })}`);
  assert.equal((await search(null, "test")).status, 401);
  for (const invalid of [" ", "a".repeat(201), "\0"]) {
    assert.equal((await search("owner", invalid)).status, 400);
  }
  assert.equal((await api("owner", "GET", "/api/search?q=a&q=b")).status, 400);

  const name = "Search fixture 100%_";
  const taskTitle = "Search task 100%_";
  const memberProject = await api("owner", "POST", "/api/projects", {
    projectName: name, startDate: "2026-01-01", memberIds: [ids.member],
  });
  const hiddenProject = await api("outsider", "POST", "/api/projects", {
    projectName: name, startDate: "2026-01-01",
  });
  assert.equal(memberProject.status, 201);
  assert.equal(hiddenProject.status, 201);
  const projectId = memberProject.body.project.projectId;
  const hiddenId = hiddenProject.body.project.projectId;
  const match = await api("owner", "POST", tasksUrl(projectId), { ...valid([ids.owner]), taskTitle });
  const hidden = await api("outsider", "POST", tasksUrl(hiddenId), { ...valid([ids.outsider]), taskTitle });
  const decoy = await api("owner", "POST", tasksUrl(projectId), { ...valid([ids.owner]), taskTitle: "Search task 100XYZ" });
  assert.equal(match.status, 201);
  assert.equal(hidden.status, 201);
  assert.equal(decoy.status, 201);

  const response = await search("member", "  100%_  ");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    success: true,
    projects: [{ projectId, projectName: name }],
    tasks: [{ projectId, projectName: name, taskId: match.body.task.taskId, taskTitle }],
  });
  assert.deepEqual(new Set((await search("member", "sEaRcH TaSk")).body.tasks.map((task: { taskId: number }) => task.taskId)),
    new Set([match.body.task.taskId, decoy.body.task.taskId]));

  await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, ids.member]);
  assert.deepEqual((await search("member", "100%_")).body, { success: true, projects: [], tasks: [] });
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

test("PATCH requires an Owner or existing assignee, including when replacing assignees", async () => {
  const project = await api("owner", "POST", "/api/projects", {
    projectName: "Task edit permissions", startDate: "2026-01-01", memberIds: [ids.member],
  });
  const projectId = project.body.project.projectId;
  const created = await api("owner", "POST", tasksUrl(projectId), valid([ids.owner]));
  const url = `${tasksUrl(projectId)}/${created.body.task.taskId}`;

  for (const patch of [{ priority: 1 }, { taskTitle: "Self-assigned edit", assigneeIds: [ids.member] }]) {
    const denied = await api("member", "PATCH", url, patch);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, "FORBIDDEN");
    assert.deepEqual((await api("owner", "GET", url)).body.task, created.body.task);
  }
  assert.equal((await api(null, "PATCH", url, { priority: 1 })).status, 401);
  assert.equal((await api("outsider", "PATCH", url, { priority: 1 })).status, 404);

  // Owners need no task assignment; an assignee may also replace the assignment set.
  const assigned = await api("owner", "PATCH", url, { assigneeIds: [ids.member] });
  assert.equal(assigned.status, 200);
  assert.equal((await api("owner", "PATCH", url, { taskTitle: "Unassigned Owner edit" })).status, 200);
  const updated = await api("member", "PATCH", url, { priority: 1, assigneeIds: [ids.owner] });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.task.priority, 1);
  assert.equal((await api("member", "PATCH", url, { priority: 3 })).status, 403);
  assert.deepEqual((await api("owner", "GET", url)).body.task, updated.body.task);
});

test("PATCH rechecks assignment after waiting for the project lock", async () => {
  const project = await api("owner", "POST", "/api/projects", {
    projectName: "Task assignment race", startDate: "2026-01-01", memberIds: [ids.member],
  });
  const projectId = project.body.project.projectId;
  const created = await api("owner", "POST", tasksUrl(projectId), valid([ids.owner, ids.member]));
  const taskId = created.body.task.taskId;
  const url = `${tasksUrl(projectId)}/${taskId}`;
  const result = await withProjectLockHeld(projectId,
    () => api("member", "PATCH", url, { taskTitle: "Must not save", assigneeIds: [ids.member] }),
    async (gate) => {
      await gate.query("DELETE FROM task_assignees WHERE task_id = $1 AND user_id = $2", [taskId, ids.member]);
    });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "FORBIDDEN");
  assert.deepEqual((await api("owner", "GET", url)).body.task, {
    ...created.body.task,
    assignees: created.body.task.assignees.filter((person: { userId: number }) => person.userId !== ids.member),
  });
});

test("PATCH rechecks an unassigned Owner's role after waiting for the project lock", async () => {
  const project = await api("owner", "POST", "/api/projects", {
    projectName: "Task Owner role race", startDate: "2026-01-01", memberIds: [ids.member],
  });
  const projectId = project.body.project.projectId;
  const created = await api("owner", "POST", tasksUrl(projectId), valid([ids.member]));
  const url = `${tasksUrl(projectId)}/${created.body.task.taskId}`;
  const result = await withProjectLockHeld(projectId,
    () => api("owner", "PATCH", url, { taskTitle: "Must not save" }),
    async (gate) => {
      await gate.query("UPDATE project_members SET role = 'Member' WHERE project_id = $1 AND user_id = $2", [projectId, ids.owner]);
    });
  assert.equal(result.status, 403);
  assert.equal(result.body.error.code, "FORBIDDEN");
  assert.deepEqual((await api("member", "GET", url)).body.task, created.body.task);
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
    ["GET", url, undefined], ["PATCH", url, { priority: 3 }], ["DELETE", url, undefined],
    ["GET", `${url}/comments`, undefined], ["POST", `${url}/comments`, { commentText: "Expired" }]] as const) {
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
    ["PATCH", url, { priority: 3 }], ["DELETE", url, undefined],
    ["GET", `${url}/comments`, undefined], ["POST", `${url}/comments`, { commentText: "Unlinked" }]] as const) {
    const res = await callWith(cookie, method, path, body);
    assert.equal(res.status, 403, `${method} ${path}`);
    assert.equal(res.body.error.code, "FORBIDDEN");
  }
  assert.deepEqual((await api("owner", "GET", url)).body.task, before);
});
