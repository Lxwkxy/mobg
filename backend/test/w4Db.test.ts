import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { pool } from "../src/db.js";
import * as projects from "../src/services/projectDb.js";
import * as tasks from "../src/services/taskDb.js";
import { getDashboardSummary } from "../src/services/dashboardDb.js";
import { withProjectLockHeld } from "./helpers/projectLock.js";

before(async () => {
  const expected = process.env.POSTGRES_DB ?? "";
  assert.match(expected, /^mobg_w2_test_[0-9]+_[0-9a-f]{8}$/);
  assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, expected);
});
after(() => pool.end());

test("Dashboard counts each task once in current member projects, using Bangkok dates and excluding Done from high priority", async () => {
  const f = await fixture();
  const other = await fixture();
  const zero = { project_count: "0", task_count: "0", todo_count: "0", in_progress_count: "0",
    done_count: "0", overdue_count: "0", high_priority_count: "0" };
  assert.deepEqual(await getDashboardSummary(f.outsider), zero);
  assert.deepEqual(await getDashboardSummary(999999), zero);
  assert.deepEqual(await getDashboardSummary(f.first), { ...zero, project_count: "1" });
  const now: Date = (await pool.query("SELECT CURRENT_TIMESTAMP AS now")).rows[0].now;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  await task(f, [f.owner, f.first, f.second], "To Do", yesterday);
  await task(f, [f.first, f.second], "Doing", today);
  await task(f, [f.first], "Done", yesterday);
  const low = await task(f, [f.first], "To Do", tomorrow);
  await tasks.updateTask(low, { priority: 3 });
  await task(other, [other.owner], "To Do", yesterday);
  await projects.createProjectWithMembers({ project_name: "Empty member project", start_date: "2026-01-01",
    created_by: f.first, member_ids: [] });
  assert.deepEqual(await getDashboardSummary(f.first), { project_count: "2", task_count: "4", todo_count: "2",
    in_progress_count: "1", done_count: "1", overdue_count: "1", high_priority_count: "2" });
  const mine = await tasks.listTasksForAssignee({ user_id: f.first, status_name: null });
  assert.deepEqual(mine.map(row => row.is_overdue), [true, false, false, false]);
  await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
  assert.deepEqual(await getDashboardSummary(f.first), { ...zero, project_count: "1" });
  await assert.rejects(getDashboardSummary(Number.MAX_SAFE_INTEGER + 1), TypeError);
});

test("adding a member returns the full member row and propagates duplicate and foreign key errors", async () => {
  const f = await fixture();
  const added = await addMember(f.project, f.owner, f.outsider);
  assert.ok(added.added);
  assert.deepEqual({ ...added.member, date_join: "date" }, {
    user_id: String(f.outsider), user_name: "Outsider", email: `w4-${sequence}-3@w4.example.test`, role: "Member", date_join: "date",
  });
  assert.match(added.member.date_join, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal((await projects.listProjectMembers(f.project)).length, 4);
  await assert.rejects(addMember(f.project, f.owner, f.outsider), { code: "23505" });
  await assert.rejects(addMember(f.project, f.owner, 999999), { code: "23503" });
  await assert.rejects(addMember(0, f.owner, f.first), TypeError);
  await assert.rejects(addMember(f.project, 0, f.first), TypeError);
});

test("important tasks share Dashboard scope, exclude Done, and apply stable order before limit", async () => {
  const f = await fixture();
  const other = await fixture();
  const ids: number[] = [];
  for (let i = 0; i < 7; i++) ids.push(await task(f, [f.owner, f.second], "Doing", i === 0 ? "2026-03-01" : "2026-02-01"));
  await task(f, [f.first], "Done", "2026-01-01");
  const low = await task(f, [f.first], "To Do", "2026-01-01");
  await tasks.updateTask(low, { priority: 2 });
  await task(other, [other.owner]);
  assert.deepEqual((await tasks.listHighPriorityTasks(f.first)).map(row => row.task_id), ids.slice(1, 6).map(String));
  assert.deepEqual((await tasks.listHighPriorityTasks(f.first, 100)).map(row => row.task_id), [...ids.slice(1), ids[0]!].map(String));
  assert.deepEqual((await tasks.listHighPriorityTasks(f.first, 1))[0], await tasks.getTaskById(f.project, ids[1]!));
  assert.equal((await getDashboardSummary(f.first)).high_priority_count, "7");
  assert.deepEqual(await tasks.listHighPriorityTasks(f.outsider), []);
  assert.deepEqual(await tasks.listHighPriorityTasks(999999), []);
  for (const limit of [0, -1, 1.5, 101, NaN]) await assert.rejects(tasks.listHighPriorityTasks(f.first, limit), TypeError);
  await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
  assert.deepEqual(await tasks.listHighPriorityTasks(f.first), []);
});

test("unknown membership roles grant no My Tasks or Dashboard access", async () => {
  const f = await fixture();
  await task(f, [f.first]);
  await pool.query("UPDATE project_members SET role = 'Unknown' WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
  assert.deepEqual(await tasks.listTasksForAssignee({ user_id: f.first, status_name: null }), []);
  assert.deepEqual(await tasks.listHighPriorityTasks(f.first), []);
  assert.deepEqual(await getDashboardSummary(f.first), { project_count: "0", task_count: "0", todo_count: "0",
    in_progress_count: "0", done_count: "0", overdue_count: "0", high_priority_count: "0" });
});

let sequence = 0;

// Actor-scoped wrappers; `row => row` keeps the raw row as the prepared member.
const addMember = (project: number, actor: number, user: number) =>
  projects.addProjectMember({ project_id: project, actor_user_id: actor, user_id: user }, (row) => row);
const removeMember = (project: number, actor: number, user: number) =>
  projects.removeProjectMember({ project_id: project, actor_user_id: actor, user_id: user });
const memberIds = async (project: number) => (await projects.listProjectMembers(project)).map(m => m.user_id).sort();

test("member writes authorize the actor under the project lock: outsider 404-class, Member/unknown role 403-class", async () => {
  const f = await fixture();
  const before = await memberIds(f.project);
  assert.deepEqual(await addMember(f.project, f.outsider, f.outsider), { added: false, reason: "ACTOR_NOT_MEMBER" });
  assert.deepEqual(await addMember(f.project, f.first, f.outsider), { added: false, reason: "ACTOR_NOT_OWNER" });
  assert.deepEqual(await addMember(999999, f.owner, f.outsider), { added: false, reason: "ACTOR_NOT_MEMBER" });
  assert.deepEqual(await removeMember(f.project, f.outsider, f.second), { removed: false, reason: "ACTOR_NOT_MEMBER" });
  assert.deepEqual(await removeMember(f.project, f.first, f.second), { removed: false, reason: "ACTOR_NOT_OWNER" });
  assert.deepEqual(await removeMember(999999, f.owner, f.first), { removed: false, reason: "ACTOR_NOT_MEMBER" });
  await pool.query("UPDATE project_members SET role = 'Unknown' WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
  assert.deepEqual(await addMember(f.project, f.first, f.outsider), { added: false, reason: "ACTOR_NOT_OWNER" });
  assert.deepEqual(await removeMember(f.project, f.first, f.second), { removed: false, reason: "ACTOR_NOT_OWNER" });
  assert.deepEqual(await memberIds(f.project), before);
});

test("an actor demoted or removed while waiting for the project lock writes nothing", async () => {
  for (const change of ["demote", "remove"] as const) {
    for (const action of ["add", "remove"] as const) {
      const f = await fixture();
      await pool.query("UPDATE project_members SET role = 'Owner' WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
      const before = await memberIds(f.project);
      const result = await withProjectLockHeld<unknown>(f.project,
        () => action === "add" ? addMember(f.project, f.first, f.outsider) : removeMember(f.project, f.first, f.second),
        async (gate) => {
          await gate.query(change === "demote"
            ? "UPDATE project_members SET role = 'Member' WHERE project_id = $1 AND user_id = $2"
            : "DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
        });
      const reason = change === "demote" ? "ACTOR_NOT_OWNER" : "ACTOR_NOT_MEMBER";
      assert.deepEqual(result, action === "add" ? { added: false, reason } : { removed: false, reason }, `${change} ${action}`);
      const expected = change === "demote" ? before : before.filter(id => id !== String(f.first));
      assert.deepEqual(await memberIds(f.project), expected, `${change} ${action}`);
    }
  }
});

test("updateTask with an actor rechecks membership under the project lock and leaves the task untouched otherwise", async () => {
  const f = await fixture();
  const other = await fixture();
  const id = await task(f, [f.owner]);
  const original = await tasks.getTaskById(f.project, id);
  const change = { task_title: "Must not land", status_name: "Done" as const, assignee_ids: [f.second] };
  assert.equal(await tasks.updateTask(id, change, { project_id: f.project, user_id: f.outsider }), false);
  assert.equal(await tasks.updateTask(id, change, { project_id: other.project, user_id: other.owner }), false); // wrong project
  await pool.query("UPDATE project_members SET role = 'Unknown' WHERE project_id = $1 AND user_id = $2", [f.project, f.second]);
  assert.equal(await tasks.updateTask(id, change, { project_id: f.project, user_id: f.second }), false);
  assert.deepEqual(await tasks.getTaskById(f.project, id), original);

  // Removed while waiting for the lock: false, nothing written.
  const result = await withProjectLockHeld(f.project,
    () => tasks.updateTask(id, { task_title: "Must not land", priority: 3 }, { project_id: f.project, user_id: f.first }),
    async (gate) => {
      await gate.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
    });
  assert.equal(result, false);
  assert.deepEqual(await tasks.getTaskById(f.project, id), original);

  // A current member still updates.
  assert.equal(await tasks.updateTask(id, { task_title: "Owner edit" }, { project_id: f.project, user_id: f.owner }), true);
  assert.equal((await tasks.getTaskById(f.project, id))?.task_title, "Owner edit");
});

test("the lock helper rolls back, frees the lock and lets the waiting operation finish when a test fails before COMMIT", async () => {
  const f = await fixture();
  let finished = false;
  await assert.rejects(withProjectLockHeld(f.project,
    () => addMember(f.project, f.owner, f.outsider).finally(() => { finished = true; }),
    async (gate) => {
      await gate.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [f.project, f.first]);
      throw new Error("simulated assertion failure");
    }), /simulated assertion failure/);
  assert.equal(finished, true); // the blocked add completed before the error surfaced
  assert.ok(await projects.findProjectMembership(f.project, f.first)); // the gate's delete was rolled back
  assert.ok(await projects.findProjectMembership(f.project, f.outsider)); // the waiting add ran after the lock was freed
  const client = await pool.connect();
  let broken = false;
  try {
    await client.query("BEGIN");
    await client.query("SELECT 1 FROM projects WHERE project_id = $1 FOR UPDATE NOWAIT", [f.project]); // lock is free
  } finally {
    // ROLLBACK even when NOWAIT failed (the transaction is then aborted); destroy the connection if that fails too.
    try { await client.query("ROLLBACK"); } catch { broken = true; }
    client.release(broken);
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND state LIKE 'idle in transaction%'")).rows[0].n, 0);
});

test("adding a member prepares the response inside the transaction; a failed prepare leaves no member", async () => {
  const f = await fixture();
  const before = await memberIds(f.project);
  await assert.rejects(projects.addProjectMember({ project_id: f.project, actor_user_id: f.owner, user_id: f.outsider },
    () => { throw new Error("prepare failed"); }), /prepare failed/);
  assert.deepEqual(await memberIds(f.project), before);
  assert.equal(await projects.findProjectMembership(f.project, f.outsider), null);
  // The same user can still be added afterwards: nothing from the failed attempt remained.
  const seen: string[] = [];
  const added = await projects.addProjectMember({ project_id: f.project, actor_user_id: f.owner, user_id: f.outsider },
    (row) => { seen.push(row.user_id); return { id: row.user_id, role: row.role }; });
  assert.deepEqual(added, { added: true, member: { id: String(f.outsider), role: "Member" } });
  assert.deepEqual(seen, [String(f.outsider)]);
});

test("removal rejects absent membership, last Owner and sole assignees including Done without partial writes", async () => {
  const f = await fixture();
  assert.deepEqual(await removeMember(f.project, f.owner, f.outsider), { removed: false, reason: "NOT_MEMBER" });
  assert.deepEqual(await removeMember(f.project, f.owner, f.owner), { removed: false, reason: "LAST_OWNER" });
  const ids = [];
  for (const status of ["Done", "To Do", "Doing"] as const) ids.push(await task(f, [f.first], status));
  const shared = await task(f, [f.first, f.second]);
  const before = await tasks.listTasksByProject({ project_id: f.project, status_name: null });
  assert.deepEqual(await removeMember(f.project, f.owner, f.first), { removed: false, reason: "SOLE_ASSIGNEE",
    tasks: ids.map((id, index) => ({ task_id: String(id), task_title: "W4 task", status_name: ["Done", "To Do", "Doing"][index] })) });
  assert.deepEqual(await tasks.listTasksByProject({ project_id: f.project, status_name: null }), before);
  assert.equal((await tasks.getTaskById(f.project, shared))?.assignees.length, 2);
  assert.ok(await projects.findProjectMembership(f.project, f.first));
});
async function fixture() {
  const prefix = `w4-${++sequence}`;
  const users: number[] = [];
  for (const [i, name] of ["Zoe", "Alex", "Alex", "Outsider"].entries()) {
    users.push(Number((await pool.query(`INSERT INTO users (user_name, email)
      VALUES ($1, $2) RETURNING user_id`, [name, `${prefix}-${i}@w4.example.test`])).rows[0].user_id));
  }
  const [owner, first, second, outsider] = users as [number, number, number, number];
  const project = Number((await projects.createProjectWithMembers({ project_name: prefix,
    start_date: "2026-01-01", created_by: owner, member_ids: [first, second] })).project_id);
  return { project, owner, first, second, outsider };
}
async function task(f: Awaited<ReturnType<typeof fixture>>, assignees: number[],
  status: tasks.TaskStatusName = "To Do", due = "2026-02-01") {
  const id = Number((await tasks.createTask({ project_id: f.project, created_by: f.owner,
    task_title: "W4 task", due_date: due, priority: 1, assignee_ids: assignees })).task_id);
  if (status !== "To Do") await tasks.updateTask(id, { status_name: status });
  return id;
}

test("successful member removal keeps co-assigned tasks and other projects; failures roll back all tables", async () => {
  const f = await fixture();
  const other = await fixture();
  await addMember(other.project, other.owner, f.first);
  const kept = await task(other, [f.first]);
  const ids = [await task(f, [f.first, f.second]), await task(f, [f.owner, f.first], "Done")];
  const before = await tasks.listTasksByProject({ project_id: f.project, status_name: null });
  await pool.query(`CREATE FUNCTION w4_fail_member_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'W4 rollback test'; END $$;
    CREATE TRIGGER w4_fail_member_delete BEFORE DELETE ON project_members
    FOR EACH ROW EXECUTE FUNCTION w4_fail_member_delete()`);
  try {
    await assert.rejects(removeMember(f.project, f.owner, f.first), { code: "P0001" });
    assert.deepEqual(await tasks.listTasksByProject({ project_id: f.project, status_name: null }), before);
    assert.ok(await projects.findProjectMembership(f.project, f.first));
  } finally {
    await pool.query("DROP TRIGGER w4_fail_member_delete ON project_members; DROP FUNCTION w4_fail_member_delete()");
  }
  assert.deepEqual(await removeMember(f.project, f.owner, f.first), { removed: true });
  assert.equal(await projects.findProjectMembership(f.project, f.first), null);
  assert.deepEqual((await tasks.getTaskById(f.project, ids[0]!))?.assignees.map(a => a.user_id), [String(f.second)]);
  assert.deepEqual((await tasks.getTaskById(f.project, ids[1]!))?.assignees.map(a => a.user_id), [String(f.owner)]);
  assert.ok(await projects.findProjectMembership(other.project, f.first));
  assert.deepEqual((await tasks.getTaskById(other.project, kept))?.assignees.map(a => a.user_id), [String(f.first)]);
});

test("concurrent removals preserve a last Owner and at least one assignee", async () => {
  const f = await fixture();
  const id = await task(f, [f.first, f.second], "Done");
  const results = await Promise.all([removeMember(f.project, f.owner, f.first), removeMember(f.project, f.owner, f.second)]);
  assert.equal(results.filter(r => r.removed).length, 1);
  assert.equal(results.filter(r => !r.removed && r.reason === "SOLE_ASSIGNEE").length, 1);
  assert.equal((await tasks.getTaskById(f.project, id))?.assignees.length, 1);
  const owners = await fixture();
  await pool.query("UPDATE project_members SET role = 'Owner' WHERE project_id = $1", [owners.project]);
  const removed = await Promise.all([owners.owner, owners.first, owners.second].map(user => removeMember(owners.project, user, user)));
  assert.equal(removed.filter(r => r.removed).length, 2);
  assert.equal(removed.filter(r => !r.removed && r.reason === "LAST_OWNER").length, 1);
  assert.equal((await projects.listProjectMembers(owners.project)).filter(m => m.role === "Owner").length, 1);
});

test("task writes reject empty and nonmember assignees inside their transaction and preserve native key errors", async () => {
  const f = await fixture();
  const id = await task(f, [f.first]);
  const original = await tasks.getTaskById(f.project, id);
  for (const assignees of [[], [f.outsider]]) {
    await assert.rejects(task(f, assignees), { name: "InvalidTaskAssigneesError" });
    await assert.rejects(tasks.updateTask(id, { task_title: "Must roll back", assignee_ids: assignees }),
      { name: "InvalidTaskAssigneesError" });
    assert.deepEqual(await tasks.getTaskById(f.project, id), original);
    assert.deepEqual(await tasks.listTasksByProject({ project_id: f.project, status_name: null }), [original]);
  }
  await assert.rejects(task(f, [999999]), { code: "23503" });
  await assert.rejects(task(f, [f.first, f.first]), { code: "23505" });
});

async function waitFor(check: () => Promise<boolean>) {
  for (let i = 0; i < 300; i++) {
    if (await check()) return;
    await delay(10);
  }
  throw new Error("Concurrent operation did not reach its database barrier");
}

test("assignment replacement waits for member removal and rechecks membership before committing", async () => {
  const f = await fixture();
  const id = await task(f, [f.owner]);
  const original = await tasks.getTaskById(f.project, id);
  const gate = await pool.connect();
  await gate.query("SELECT pg_advisory_lock(74001)");
  await pool.query(`CREATE FUNCTION w4_pause_removal() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(74001); RETURN OLD; END $$;
    CREATE TRIGGER w4_pause_removal BEFORE DELETE ON project_members
    FOR EACH ROW EXECUTE FUNCTION w4_pause_removal()`);
  const removal = removeMember(f.project, f.owner, f.first);
  let replacement: Promise<PromiseSettledResult<boolean>[]> | undefined;
  try {
    await waitFor(async () => (await pool.query(`SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event = 'advisory'`)).rowCount! > 0);
    let settled = false;
    replacement = Promise.allSettled([tasks.updateTask(id, { assignee_ids: [f.first] })])
      .then(result => { settled = true; return result; });
    await waitFor(async () => settled || (await pool.query(`SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock' AND wait_event <> 'advisory'`)).rowCount! > 0);
  } finally {
    // Free the advisory lock before returning the connection; if that fails, destroy the connection
    // (which ends its session and its locks) instead of pooling a locked one.
    let broken = false;
    try { await gate.query("SELECT pg_advisory_unlock(74001)"); } catch { broken = true; }
    gate.release(broken);
    await removal;
    if (replacement) await replacement;
    await pool.query("DROP TRIGGER w4_pause_removal ON project_members; DROP FUNCTION w4_pause_removal()");
  }
  assert.deepEqual(await removal, { removed: true });
  const result = (await replacement!)[0]!;
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.equal(result.reason.name, "InvalidTaskAssigneesError");
  assert.deepEqual(await tasks.getTaskById(f.project, id), original);
});

test("concurrent create and removal either retain the sole assignee member or reject the stale assignment", async () => {
  for (let i = 0; i < 8; i++) {
    const f = await fixture();
    const [created, removed] = await Promise.allSettled([
      task(f, [f.first]), removeMember(f.project, f.owner, f.first),
    ]);
    assert.equal(removed.status, "fulfilled");
    if (created.status === "fulfilled") {
      assert.ok(await projects.findProjectMembership(f.project, f.first));
      assert.deepEqual((await tasks.getTaskById(f.project, created.value))?.assignees.map(a => a.user_id), [String(f.first)]);
      assert.ok(removed.status === "fulfilled" && !removed.value.removed && removed.value.reason === "SOLE_ASSIGNEE");
    } else {
      assert.equal(created.reason.name, "InvalidTaskAssigneesError");
      assert.ok(removed.status === "fulfilled" && removed.value.removed);
      assert.equal(await projects.findProjectMembership(f.project, f.first), null);
      assert.deepEqual(await tasks.listTasksByProject({ project_id: f.project, status_name: null }), []);
    }
  }
});

test("concurrent add, remove and task replacement preserve membership and assignments without exhausting the pool", async () => {
  const f = await fixture();
  const id = await task(f, [f.owner]);
  const outcomes = await Promise.allSettled(Array.from({ length: 18 }, (_, index) => {
    if (index % 3 === 0) return addMember(f.project, f.owner, f.first);
    if (index % 3 === 1) return removeMember(f.project, f.owner, f.first);
    return tasks.updateTask(id, { assignee_ids: index % 2 ? [f.first] : [f.owner, f.first] });
  }));
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      assert.ok(outcome.reason.code === "23505" || outcome.reason.name === "InvalidTaskAssigneesError");
    }
  }
  const members = await projects.listProjectMembers(f.project);
  assert.equal(members.filter(m => m.role === "Owner").length, 1);
  const row = await tasks.getTaskById(f.project, id);
  assert.ok(row && row.assignees.length >= 1);
  assert.ok(row.assignees.every(a => members.some(m => m.user_id === a.user_id)));
});

test("My Tasks returns complete unique rows across current memberships only, in stable order", async () => {
  const f = await fixture();
  const other = await fixture();
  assert.deepEqual(await tasks.listTasksForAssignee({ user_id: f.first, status_name: null }), []);
  assert.deepEqual(await tasks.listTasksForAssignee({ user_id: 999999, status_name: null }), []);
  const later = await task(f, [f.first], "To Do", "2026-02-02");
  const earlier = await task(f, [f.owner, f.second, f.first], "Doing");
  const tie = await task(f, [f.first], "Done");
  await task(f, [f.owner]);
  await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Member')",
    [other.project, f.first]);
  const across = await task(other, [f.first], "To Do", "2026-02-03");
  const input = { user_id: f.first, status_name: null };
  const rows = await tasks.listTasksForAssignee(input);
  assert.deepEqual(rows.map(row => row.task_id), [earlier, tie, later, across].map(String));
  assert.deepEqual(rows[0], await tasks.getTaskById(f.project, earlier));
  assert.deepEqual(rows[0]?.assignees.map(user => user.user_id), [f.first, f.second, f.owner].map(String));
  assert.deepEqual((await tasks.listTasksForAssignee({ ...input, status_name: "Done" })).map(row => row.task_id), [String(tie)]);
  // Simulate legacy assignments left after membership deletion, without changing development data.
  await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [other.project, f.first]);
  assert.deepEqual((await tasks.listTasksForAssignee(input)).map(row => row.task_id), [earlier, tie, later].map(String));
  await assert.rejects(tasks.listTasksForAssignee({ user_id: "auth-string" as never, status_name: null }), TypeError);
  await assert.rejects(tasks.listTasksForAssignee({ user_id: f.first, status_name: "In progress" as never }), TypeError);
});
