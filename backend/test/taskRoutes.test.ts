import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pool } from "../src/db.js";
import { provisionAccount } from "../src/provisioning/accounts.js";
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
const valid = (assigneeIds: number[]) => ({ taskTitle: "Write plan", priority: 2, dueDate: "2026-12-01", assigneeIds });

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
    env: { ...process.env, PORT: String(port) }, stdio: ["ignore", "pipe", "inherit"],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Server did not start")), 20000);
    server.stdout!.on("data", (chunk) => { if (String(chunk).includes("running")) { clearTimeout(timer); resolve(); } });
    server.once("exit", () => reject(new Error("Server exited early")));
  });
  for (const [i, role] of roles.entries()) {
    const res = await fetch(`${base}/api/auth/sign-in/email`, { method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({ email: users[i]!.email, password: passwords[i] }) });
    assert.equal(res.status, 200);
    cookies[role] = res.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  }
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
  assert.equal(task.dueDate, "2026-12-01");
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
