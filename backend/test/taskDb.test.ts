import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { createProjectWithMembers, deleteProject, getProjectById, listProjectsForUser } from "../src/services/projectDb.js";
import { createTask, deleteTask, getTaskById, listTasksByProject, updateTask } from "../src/services/taskDb.js";

before(async () => {
  const expected = process.env.POSTGRES_DB ?? "";
  assert.match(expected, /^mobg_w2_test_[0-9]+_[0-9a-f]{8}$/);
  assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, expected);
});
after(() => pool.end());

let fixtureNumber = 0;
async function fixture() {
  const prefix = `w3-${++fixtureNumber}`;
  const users: number[] = [];
  for (const [index, name] of ["Zoe", "Alex", "Alex"].entries()) {
    const row = (await pool.query(`INSERT INTO users (user_name, email)
      VALUES ($1, $2) RETURNING user_id`, [name, `${prefix}-${index}@tasks.example.test`])).rows[0];
    users.push(Number(row.user_id));
  }
  const [owner, first, second] = users as [number, number, number];
  const projectId = Number((await createProjectWithMembers({ project_name: prefix,
    start_date: "2026-01-01", created_by: owner, member_ids: [first, second] })).project_id);
  return { projectId, owner, first, second, projectName: prefix };
}

async function storedTask(projectId: number, owner: number, dueDate: string, status: string, assignees: number[] = []) {
  const { task_id: id } = (await pool.query(`INSERT INTO tasks
    (task_title, task_description, priority, due_date, project_id, created_by, status_id)
    VALUES ('Read task', NULL, 2, $1, $2, $3,
      (SELECT status_id FROM task_statuses WHERE status_name = $4)) RETURNING task_id`,
  [dueDate, projectId, owner, status])).rows[0];
  await pool.query(`INSERT INTO task_assignees (task_id, user_id)
    SELECT $1, unnest($2::bigint[])`, [id, assignees]);
  return Number(id);
}

test("reads one row per task with complete joins, ordered assignees, filtering and project scope", async () => {
  const { projectId, owner, first, second, projectName } = await fixture();
  const other = await fixture();
  assert.deepEqual(await listTasksByProject({ project_id: projectId, status_name: null }), []);
  assert.deepEqual(await listTasksByProject({ project_id: 999999, status_name: null }), []);
  const later = await storedTask(projectId, owner, "2026-02-02", "To Do", [owner]);
  const earlier = await storedTask(projectId, owner, "2026-02-01", "Doing", [owner, second, first]);
  const tie = await storedTask(projectId, owner, "2026-02-01", "Done", [first]);
  const foreignTask = await storedTask(other.projectId, other.owner, "2026-01-01", "Done", [other.owner]);
  const rows = await listTasksByProject({ project_id: projectId, status_name: null });
  assert.deepEqual(rows.map(row => row.task_id), [String(earlier), String(tie), String(later)]);
  const row = await getTaskById(projectId, earlier);
  assert.deepEqual(row, rows[0]);
  assert.equal(row?.task_title, "Read task");
  assert.equal(row?.task_description, null);
  assert.equal(row?.priority, 2);
  assert.equal(row?.project_id, String(projectId));
  assert.equal(row?.project_name, projectName);
  assert.equal(row?.created_by, String(owner));
  assert.equal(row?.created_by_name, "Zoe");
  assert.equal(row?.status_name, "Doing");
  assert.equal(row?.due_date, "2026-02-01");
  assert.ok(row?.task_create_date instanceof Date);
  assert.equal(typeof row?.is_overdue, "boolean");
  assert.deepEqual(row?.assignees, [
    { user_id: String(first), user_name: "Alex" },
    { user_id: String(second), user_name: "Alex" },
    { user_id: String(owner), user_name: "Zoe" },
  ]);
  for (const [status, id] of [["To Do", later], ["Doing", earlier], ["Done", tie]] as const) {
    assert.deepEqual((await listTasksByProject({ project_id: projectId, status_name: status }))
      .map(task => task.task_id), [String(id)]);
  }
  assert.equal(await getTaskById(projectId, foreignTask), null);
  assert.equal(await getTaskById(projectId, 999999), null);
  assert.equal(await getTaskById(999999, earlier), null);
});

test("overdue uses the Bangkok calendar even when the database session has a different date", async () => {
  const { projectId, owner } = await fixture();
  const now: Date = (await pool.query("SELECT CURRENT_TIMESTAMP AS now")).rows[0].now;
  const calendarDate = (zone: string) => new Intl.DateTimeFormat("en-CA", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const today = calendarDate("Asia/Bangkok");
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  const zone = ["Pacific/Honolulu", "Pacific/Kiritimati"].find(value => calendarDate(value) !== today)!;
  const original = (await pool.query("SHOW TIME ZONE")).rows[0].TimeZone as string;
  // These serial tests reuse the pool's sole connection; no production timezone/parser changes.
  await pool.query("SELECT set_config('TimeZone', $1, false)", [zone]);
  try {
    assert.notEqual((await pool.query("SELECT CURRENT_DATE::text AS today")).rows[0].today, today);
    const overdue = await storedTask(projectId, owner, yesterday, "To Do", [owner]);
    const doing = await storedTask(projectId, owner, yesterday, "Doing", [owner]);
    const dueToday = await storedTask(projectId, owner, today, "Doing", [owner]);
    const future = await storedTask(projectId, owner, tomorrow, "To Do", [owner]);
    const done = await storedTask(projectId, owner, yesterday, "Done", [owner]);
    for (const [id, expected] of [[overdue, true], [doing, true], [dueToday, false], [future, false], [done, false]] as const) {
      assert.equal((await getTaskById(projectId, id))?.is_overdue, expected);
    }
    assert.deepEqual((await listTasksByProject({ project_id: projectId, status_name: null }))
      .map(row => row.is_overdue), [true, true, false, false, false]);
  } finally {
    await pool.query("SELECT set_config('TimeZone', $1, false)", [original]);
  }
});

test("reads legacy tasks without assignees and preserves nested BIGINTs without rounding", async () => {
  const { projectId, owner } = await fixture();
  const id = await storedTask(projectId, owner, "2026-02-01", "To Do");
  assert.deepEqual((await getTaskById(projectId, id))?.assignees, []);
  const largeId = "9007199254740993";
  await pool.query(`INSERT INTO users (user_id, user_name, email) OVERRIDING SYSTEM VALUE
    VALUES ($1, 'Large ID', 'large-id@tasks.example.test')`, [largeId]);
  await pool.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Member')", [projectId, largeId]);
  await pool.query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)", [id, largeId]);
  assert.deepEqual((await getTaskById(projectId, id))?.assignees, [{ user_id: largeId, user_name: "Large ID" }]);
  await assert.rejects(getTaskById(projectId, Number(largeId)), TypeError);
  await assert.rejects(getTaskById(0, id), TypeError);
  await assert.rejects(listTasksByProject({ project_id: projectId, status_name: "Doing' OR true--" as never }), TypeError);
  await assert.rejects(listTasksByProject({ project_id: projectId, status_name: "In progress" as never }), TypeError);
});

test("creates a committed To Do task and all assignees using the verified MobG creator", async () => {
  const { projectId, owner, first, second } = await fixture();
  const result = await createTask({ project_id: projectId, task_title: "Robert'); DROP TABLE users;--",
    task_description: "Task details", priority: 1, due_date: "2026-03-01",
    created_by: owner, assignee_ids: [second, first] });
  assert.equal(typeof result.task_id, "string");
  const row = await getTaskById(projectId, Number(result.task_id));
  assert.equal(row?.task_title, "Robert'); DROP TABLE users;--");
  assert.equal(row?.task_description, "Task details");
  assert.equal(row?.created_by, String(owner));
  assert.equal(row?.status_name, "To Do");
  assert.equal(row?.priority, 1);
  assert.equal(row?.due_date, "2026-03-01");
  assert.deepEqual(row?.assignees.map(user => user.user_id), [String(first), String(second)]);
  const noDescription = await createTask({ project_id: projectId, task_title: "Without description",
    priority: 3, due_date: "2026-03-02", created_by: owner, assignee_ids: [owner] });
  assert.equal((await getTaskById(projectId, Number(noDescription.task_id)))?.task_description, null);
});

test("create failures propagate database errors and roll back task plus assignments", async () => {
  const { projectId, owner, first } = await fixture();
  const input = { project_id: projectId, task_title: "Keep this task", priority: 2 as const,
    due_date: "2026-03-01", created_by: owner, assignee_ids: [first] };
  const kept = await createTask(input);
  const before = await getTaskById(projectId, Number(kept.task_id));
  await assert.rejects(createTask({ ...input, assignee_ids: [first, 999999] }), { code: "23503" });
  await assert.rejects(createTask({ ...input, assignee_ids: [first, first] }), { code: "23505" });
  await assert.rejects(createTask({ ...input, project_id: 999999 }), { code: "23503" });
  await assert.rejects(createTask({ ...input, created_by: 999999 }), { code: "23503" });
  await assert.rejects(createTask({ ...input, priority: 4 as never }), { code: "23514" });
  await assert.rejects(createTask({ ...input, due_date: null as never }), { code: "23502" });
  await assert.rejects(createTask({ ...input, created_by: "better-auth-id" as never }), TypeError);
  assert.deepEqual(await listTasksByProject({ project_id: projectId, status_name: null }), [before]);
  assert.equal((await pool.query(`SELECT COUNT(*) AS count FROM task_assignees a
    JOIN tasks t USING (task_id) WHERE t.project_id = $1`, [projectId])).rows[0].count, "1");
});

test("PATCH preserves omitted fields, clears only explicit null and replaces all assignees", async () => {
  const { projectId, owner, first, second } = await fixture();
  const { task_id } = await createTask({ project_id: projectId, task_title: "Original",
    task_description: "Keep description", priority: 2, due_date: "2026-03-01",
    created_by: owner, assignee_ids: [owner, first] });
  const id = Number(task_id);
  const original = await getTaskById(projectId, id);
  assert.equal(await updateTask(id, { priority: 1, task_description: undefined }), true);
  assert.deepEqual(await getTaskById(projectId, id), { ...original, priority: 1 });
  assert.equal(await updateTask(id, { status_name: "Doing" }), true);
  assert.deepEqual(await getTaskById(projectId, id), { ...original, priority: 1, status_name: "Doing" });
  assert.equal(await updateTask(id, { task_description: null }), true);
  assert.equal((await getTaskById(projectId, id))?.task_description, null);
  assert.equal(await updateTask(id, { assignee_ids: [second] }), true);
  assert.deepEqual((await getTaskById(projectId, id))?.assignees, [{ user_id: String(second), user_name: "Alex" }]);
  assert.equal(await updateTask(id, { task_title: "Changed", task_description: "", due_date: "2026-04-01",
    status_name: "Done", priority: 3, assignee_ids: [second, first] }), true);
  const changed = await getTaskById(projectId, id);
  assert.equal(changed?.task_title, "Changed");
  assert.equal(changed?.task_description, "");
  assert.equal(changed?.due_date, "2026-04-01");
  assert.equal(changed?.priority, 3);
  assert.equal(changed?.status_name, "Done");
  assert.equal(changed?.is_overdue, false);
  assert.equal(changed?.created_by, original?.created_by);
  assert.equal(changed?.project_id, original?.project_id);
  assert.deepEqual(changed?.task_create_date, original?.task_create_date);
  assert.deepEqual(changed?.assignees.map(user => user.user_id), [String(first), String(second)]);
  assert.equal(await updateTask(999999, { priority: 1 }), false);
  assert.equal(await updateTask(999999, { assignee_ids: [owner] }), false);
});

test("failed replacements restore all task fields and the old assignees; invalid PATCHes do not write", async () => {
  const { projectId, owner, first } = await fixture();
  const id = await storedTask(projectId, owner, "2026-03-01", "Doing", [owner, first]);
  const before = await getTaskById(projectId, id);
  await assert.rejects(updateTask(id, { task_title: "Must roll back", status_name: "Done",
    priority: 1, assignee_ids: [owner, 999999] }), { code: "23503" });
  assert.deepEqual(await getTaskById(projectId, id), before);
  await assert.rejects(updateTask(id, { assignee_ids: [first, first] }), { code: "23505" });
  await assert.rejects(updateTask(id, { priority: 4 as never }), { code: "23514" });
  await assert.rejects(updateTask(id, { due_date: null as never }), { code: "23502" });
  await assert.rejects(updateTask(id, { task_title: null as never }), { code: "23502" });
  await assert.rejects(updateTask(id, { status_name: "In progress" as never }), TypeError);
  await assert.rejects(updateTask(id, {}), TypeError);
  await assert.rejects(updateTask(id, { task_title: undefined }), TypeError);
  await assert.rejects(updateTask(id, { project_id: 999999 } as never), TypeError);
  await assert.rejects(updateTask(id, { "priority = 1; DELETE FROM tasks;--": 2 } as never), TypeError);
  assert.deepEqual(await getTaskById(projectId, id), before);
});

test("concurrent assignee-only PATCHes each replace a whole set", async () => {
  const { projectId, owner, first, second } = await fixture();
  const id = await storedTask(projectId, owner, "2026-03-01", "To Do", [owner]);
  const results = await Promise.all(Array.from({ length: 12 }, (_, index) =>
    updateTask(id, { assignee_ids: [index % 2 ? first : second] })));
  assert.ok(results.every(Boolean));
  const row = await getTaskById(projectId, id);
  assert.equal(row?.assignees.length, 1);
  assert.ok([String(first), String(second)].includes(row!.assignees[0]!.user_id));
  assert.equal(row?.task_title, "Read task");
  assert.equal(row?.status_name, "To Do");
});

test("deletes only the requested task, cascades comments/assignees and refreshes project summaries", async () => {
  const { projectId, owner, first } = await fixture();
  const other = await fixture();
  const preserved = await storedTask(other.projectId, other.owner, "2026-03-01", "Done", [other.owner]);
  const preservedRow = await getTaskById(other.projectId, preserved);
  async function summary(total: string, completed: string, percent: number, status: string) {
    const row = await getProjectById(projectId);
    assert.equal(row?.total_tasks, total);
    assert.equal(row?.completed_tasks, completed);
    assert.equal(row?.progress_percent, percent);
    assert.equal(row?.derived_status, status);
    const listed = await listProjectsForUser({ user_id: owner, status: null, page: 1, page_size: 10 });
    assert.deepEqual(listed.items.map(item => [item.total_tasks, item.completed_tasks, item.progress_percent, item.derived_status]),
      [[total, completed, percent, status]]);
  }
  await summary("0", "0", 0, "To do");
  const input = { project_id: projectId, task_title: "Lifecycle", priority: 2 as const,
    due_date: "2026-03-01", created_by: owner, assignee_ids: [owner, first] };
  const firstId = Number((await createTask(input)).task_id);
  const secondId = Number((await createTask(input)).task_id);
  const thirdId = Number((await createTask(input)).task_id);
  await summary("3", "0", 0, "To do");
  await updateTask(firstId, { status_name: "Doing" });
  await summary("3", "0", 0, "In progress");
  await updateTask(firstId, { status_name: "Done" });
  await updateTask(secondId, { status_name: "Done" });
  await summary("3", "2", 67, "In progress");
  assert.equal(await deleteTask(thirdId), true);
  await summary("2", "2", 100, "Done");
  await pool.query(`INSERT INTO comments (task_id, user_id, comment_text) VALUES
    ($1, $3, 'Remove with task'), ($2, $3, 'Keep sibling comment')`, [firstId, secondId, owner]);
  assert.equal(await deleteTask(firstId), true);
  assert.equal(await getTaskById(projectId, firstId), null);
  assert.equal((await pool.query("SELECT 1 FROM task_assignees WHERE task_id = $1", [firstId])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [firstId])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [secondId])).rowCount, 1);
  assert.equal((await getTaskById(projectId, secondId))?.assignees.length, 2);
  await summary("1", "1", 100, "Done");
  assert.equal(await deleteTask(firstId), false);
  assert.equal(await deleteTask(999999), false);
  assert.equal(await deleteTask(secondId), true);
  await summary("0", "0", 0, "To do");
  assert.deepEqual(await getTaskById(other.projectId, preserved), preservedRow);
});

test("resolves create and update status IDs by name even when their IDs change", async () => {
  const { projectId, owner } = await fixture();
  const names = ["To Do", "Doing", "Done"];
  const originals = (await pool.query("SELECT status_id FROM task_statuses WHERE status_name = ANY($1::text[])", [names])).rows;
  await pool.query("UPDATE task_statuses SET status_name = status_name || ' (W3 saved)' WHERE status_name = ANY($1::text[])", [names]);
  try {
    const replacements = (await pool.query(`INSERT INTO task_statuses (status_name)
      SELECT unnest($1::text[]) RETURNING status_id, status_name`, [names])).rows;
    assert.ok(replacements.every(row => !originals.some(old => old.status_id === row.status_id)));
    const id = Number((await createTask({ project_id: projectId, task_title: "Dynamic status",
      priority: 2, due_date: "2026-03-01", created_by: owner, assignee_ids: [owner] })).task_id);
    for (const status of names) {
      if (status !== "To Do") await updateTask(id, { status_name: status as "Doing" | "Done" });
      assert.equal((await getTaskById(projectId, id))?.status_name, status);
      assert.equal((await pool.query("SELECT status_id FROM tasks WHERE task_id = $1", [id])).rows[0].status_id,
        replacements.find(row => row.status_name === status)!.status_id);
    }
    // Missing lookup data must fail, never silently report a successful create/update.
    await pool.query("DELETE FROM task_statuses WHERE status_name = 'To Do'");
    await assert.rejects(createTask({ project_id: projectId, task_title: "Missing status", priority: 1,
      due_date: "2026-03-01", created_by: owner, assignee_ids: [owner] }), { code: "23502" });
    await assert.rejects(updateTask(id, { status_name: "To Do", task_title: "Must roll back" }), { code: "23502" });
    assert.equal((await getTaskById(projectId, id))?.task_title, "Dynamic status");
  } finally {
    await deleteProject(projectId);
    await pool.query("DELETE FROM task_statuses WHERE status_name = ANY($1::text[])", [names]);
    await pool.query(`UPDATE task_statuses SET status_name = replace(status_name, ' (W3 saved)', '')
      WHERE status_name = ANY($1::text[])`, [names.map(name => `${name} (W3 saved)`)]);
  }
});

test("a failure at COMMIT is rethrown and leaves no created task or assignees", async () => {
  const { projectId, owner } = await fixture();
  await pool.query(`CREATE FUNCTION w3_reject_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM tasks WHERE task_id = NEW.task_id AND task_title = 'W3 deferred failure') THEN
        RAISE EXCEPTION 'W3 deferred failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE CONSTRAINT TRIGGER w3_commit_failure AFTER INSERT ON task_assignees
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION w3_reject_commit()`);
  try {
    await assert.rejects(createTask({ project_id: projectId, task_title: "W3 deferred failure",
      priority: 2, due_date: "2026-03-01", created_by: owner, assignee_ids: [owner] }), { code: "P0001" });
    assert.deepEqual(await listTasksByProject({ project_id: projectId, status_name: null }), []);
  } finally {
    await pool.query("DROP TRIGGER w3_commit_failure ON task_assignees; DROP FUNCTION w3_reject_commit()");
  }
});

test("downstream delete failure restores task, comments and assignees", async () => {
  const { projectId, owner } = await fixture();
  const id = await storedTask(projectId, owner, "2026-03-01", "To Do", [owner]);
  const before = await getTaskById(projectId, id);
  await pool.query("INSERT INTO comments (task_id, user_id, comment_text) VALUES ($1, $2, 'Block W3 deletion')", [id, owner]);
  await pool.query(`CREATE FUNCTION w3_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.comment_text = 'Block W3 deletion' THEN RAISE EXCEPTION 'W3 delete failure'; END IF;
      RETURN OLD;
    END $$;
    CREATE TRIGGER w3_delete_failure BEFORE DELETE ON comments
      FOR EACH ROW EXECUTE FUNCTION w3_reject_delete()`);
  try {
    await assert.rejects(deleteTask(id), { code: "P0001" });
    assert.deepEqual(await getTaskById(projectId, id), before);
    assert.equal((await pool.query("SELECT comment_text FROM comments WHERE task_id = $1", [id])).rows[0].comment_text,
      "Block W3 deletion");
  } finally {
    await pool.query("DROP TRIGGER w3_delete_failure ON comments; DROP FUNCTION w3_reject_delete()");
  }
  assert.equal(await deleteTask(id), true);
});

test("schema restricts referenced creators/statuses but does not enforce assignee membership or minimum", async () => {
  const { projectId, owner } = await fixture();
  const outsider = await fixture();
  // Raw fixtures deliberately bypass Book validation to prove the database's limits.
  const id = await storedTask(projectId, owner, "2026-03-01", "Done", [outsider.owner]);
  assert.equal((await pool.query("SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, outsider.owner])).rowCount, 0);
  assert.equal((await getTaskById(projectId, id))?.assignees[0]?.user_id, String(outsider.owner));
  await pool.query("DELETE FROM task_assignees WHERE task_id = $1", [id]);
  assert.deepEqual((await getTaskById(projectId, id))?.assignees, []);
  await assert.rejects(pool.query("DELETE FROM users WHERE user_id = $1", [owner]), { code: "23503" });
  await assert.rejects(pool.query("DELETE FROM task_statuses WHERE status_name = 'Done'"), { code: "23503" });
  await assert.rejects(pool.query("UPDATE tasks SET status_id = 32767 WHERE task_id = $1", [id]), { code: "23503" });
  await assert.rejects(pool.query("INSERT INTO task_assignees (task_id, user_id) VALUES (999999, $1)", [owner]), { code: "23503" });
  const nullability = (await pool.query(`SELECT column_name, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tasks' ORDER BY column_name`)).rows;
  assert.deepEqual(nullability.filter(row => row.is_nullable === "YES").map(row => row.column_name), ["task_description"]);
  // Removing a project membership alone does not remove assignments. W4 needs its agreed policy.
  await pool.query("INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)", [id, owner]);
  await pool.query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [projectId, owner]);
  assert.equal((await getTaskById(projectId, id))?.assignees.length, 1);
  assert.equal(await deleteProject(projectId), true);
  assert.equal(await getTaskById(projectId, id), null);
  assert.equal((await pool.query("SELECT 1 FROM task_assignees WHERE task_id = $1", [id])).rowCount, 0);
  assert.ok(await getProjectById(outsider.projectId));
});
