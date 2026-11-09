import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { pool } from "../src/db.js";
import { provisionAccount } from "../src/provisioning/accounts.js";
import { seedW5Demo } from "../src/provisioning/demoData.js";
import { getDashboardSummary } from "../src/services/dashboardDb.js";
import { getProjectById } from "../src/services/projectDb.js";
import { verifyDatabase, auditRelationships } from "../src/provisioning/verification.js";
import { updateTask, deleteTask } from "../src/services/taskDb.js";

before(async () => {
  assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_[0-9]+_[0-9a-f]{8}$/);
  assert.equal((await pool.query("SELECT current_database() AS name")).rows[0].name, process.env.POSTGRES_DB);
});
after(() => pool.end());

test("W5 fixtures reuse linked identities, preserve reruns and demonstrate W4 counts without assignee duplication", async () => {
  const ids: number[] = [];
  for (const role of ["owner", "member", "outsider"]) {
    ids.push(Number((await provisionAccount({ name: `W5 ${role}`, email: `w5-${role}@example.test`,
      password: randomBytes(24).toString("hex") })).user_id));
  }
  const input = { owner_id: ids[0]!, member_id: ids[1]!, outsider_id: ids[2]! };
  const first = await seedW5Demo(input);
  assert.deepEqual(await seedW5Demo(input), first);
  assert.deepEqual(await getDashboardSummary(input.owner_id), {
    project_count: "3", task_count: "8", todo_count: "3", in_progress_count: "2",
    done_count: "3", overdue_count: "1", high_priority_count: "3",
  });
  assert.deepEqual(await getDashboardSummary(input.member_id), {
    project_count: "3", task_count: "6", todo_count: "3", in_progress_count: "2",
    done_count: "1", overdue_count: "1", high_priority_count: "3",
  });
  assert.equal((await getDashboardSummary(input.outsider_id)).project_count, "0");
  assert.equal((await getProjectById(Number(first.project_ids.main)))?.progress_percent, 20);
  assert.equal((await getProjectById(Number(first.project_ids.completed)))?.progress_percent, 100);
  const empty = await getProjectById(Number(first.project_ids.empty));
  assert.equal(empty?.progress_percent, 0);
  assert.equal(empty?.derived_status, "To do");
  assert.equal((await verifyDatabase()).passed, true);
  assert.deepEqual(await Promise.all(Array.from({ length: 4 }, () => seedW5Demo(input))), [first, first, first, first]);
  // Seed is not a reset: preserve a task edit, changed dates, and deliberate deletion.
  await updateTask(Number(first.task_ids[0]), { task_title: "Human edit" });
  await assert.rejects(seedW5Demo(input), /fixture changed/);
  assert.equal((await pool.query("SELECT task_title FROM tasks WHERE task_id=$1", [first.task_ids[0]])).rows[0].task_title, "Human edit");
  await updateTask(Number(first.task_ids[0]), { task_title: "Overdue High - shared" });
  await assert.rejects(seedW5Demo(input, "2001-01-01"), /fixture changed/);
  await deleteTask(Number(first.task_ids.at(-1)));
  await assert.rejects(seedW5Demo(input), /fixture changed/);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id=$1", [first.task_ids.at(-1)])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM task_assignees WHERE task_id=$1", [first.task_ids.at(-1)])).rowCount, 0);
  assert.equal((await getProjectById(Number(first.project_ids.main)))?.total_tasks, "5");
  assert.equal((await verifyDatabase()).passed, true);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM task_assignees WHERE task_id=$1", [first.task_ids[0]]);
    assert.equal((await auditRelationships(client)).issues.tasks_without_assignees, 1);
    await client.query("INSERT INTO task_assignees(task_id,user_id) VALUES ($1,$2)", [first.task_ids[0], input.outsider_id]);
    assert.equal((await auditRelationships(client)).issues.assignees_outside_project, 1);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
