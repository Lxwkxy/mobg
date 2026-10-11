import { after, test } from "node:test";
import assert from "node:assert/strict";
import { pool } from "../src/db.js";
import { findProjectMembership, createProjectWithMembers, getProjectById, listProjectsForUser,
  updateProject, deleteProject, listUsers, listProjectMembers } from "../src/services/projectDb.js";

assert.match(process.env.POSTGRES_DB ?? "", /^mobg_w2_test_/);
after(() => pool.end());
test("creator remains Owner when also selected as an initial member", async () => {
  const result = await createProjectWithMembers({ project_name: "W2 first project", start_date: "2026-10-11",
    created_by: 1, member_ids: [1] });
  assert.equal((await findProjectMembership(Number(result.project_id), 1))?.role, "Owner");
  const project = await getProjectById(Number(result.project_id));
  assert.equal(project?.derived_status, "To do");
  assert.equal(project?.progress_percent, 0);
});

async function newUser(name: string): Promise<number> {
  return Number((await pool.query("INSERT INTO users (user_name, email) VALUES ($1,$2) RETURNING user_id",
    [name, `${name.toLowerCase()}@projects.example.test`])).rows[0].user_id);
}
async function project(owner: number, name: string, members: number[] = []): Promise<number> {
  return Number((await createProjectWithMembers({ project_name: name, start_date: "2026-10-11",
    created_by: owner, member_ids: members })).project_id);
}
async function task(projectId: number, owner: number, status: string): Promise<string> {
  return (await pool.query(`INSERT INTO tasks (task_title, priority, due_date, project_id, status_id, created_by)
    SELECT 'Test task', 1, '2026-10-20', $1, status_id, $2 FROM task_statuses
    WHERE status_name = $3 RETURNING task_id`, [projectId, owner, status])).rows[0].task_id;
}

test("lists membership projects, filters before pagination, preserves totals and ordering", async () => {
  const owner = await newUser("ListOwner");
  const member = await newUser("ListMember");
  const outsider = await newUser("ListOutsider");
  const todo = await project(owner, "Todo", [member, member, owner]);
  const doing = await project(owner, "Doing", [member]);
  const done = await project(owner, "Done", [member]);
  await project(outsider, "Invisible");
  await task(todo, owner, "To Do");
  await task(doing, owner, "Done");
  await task(doing, owner, "Doing");
  await task(doing, owner, "To Do");
  await task(done, owner, "Done");
  await pool.query("UPDATE projects SET project_create_date = '2026-10-11 00:00:00+00' WHERE created_by = $1", [owner]);
  const first = await listProjectsForUser({ user_id: member, status: null, page: 1, page_size: 2 });
  assert.deepEqual(first.items.map(p => p.project_id), [String(done), String(doing)]);
  assert.equal(first.total_items, "3");
  assert.equal(first.items[0]?.my_role, "Member");
  assert.equal(first.items[1]?.progress_percent, 33);
  assert.equal(first.items[1]?.total_tasks, "3");
  const filtered = await listProjectsForUser({ user_id: member, status: "To do", page: 1, page_size: 1 });
  assert.deepEqual(filtered.items.map(p => p.project_id), [String(todo)]);
  assert.equal(filtered.total_items, "1");
  const beyond = await listProjectsForUser({ user_id: member, status: null, page: 10, page_size: 2 });
  assert.deepEqual(beyond.items, []);
  assert.equal(beyond.total_items, "3");
  assert.equal((await getProjectById(done))?.derived_status, "Done");
  assert.equal((await getProjectById(todo))?.derived_status, "To do");
  assert.equal((await getProjectById(doing))?.derived_status, "In progress");
  assert.equal(await findProjectMembership(todo, outsider), null);
  const members = await listProjectMembers(todo);
  assert.deepEqual(members.map(m => [m.user_id, m.role]), [[String(owner), "Owner"], [String(member), "Member"]]);
  assert.match(members[0]!.date_join, /^\d{4}-\d{2}-\d{2}$/);
  const users = await listUsers();
  assert.equal(users.some(u => "password_hash" in u || "auth_user_id" in u), false);
  const expected = (await pool.query("SELECT user_id FROM users ORDER BY user_name, user_id")).rows;
  assert.deepEqual(users.map(u => u.user_id), expected.map(u => u.user_id));
});

test("task counts are unaffected by multiple assignees", async () => {
  const owner = await newUser("CountOwner");
  const member = await newUser("CountMember");
  const id = await project(owner, "Counts", [member]);
  const taskId = await task(id, owner, "Done");
  await pool.query("INSERT INTO task_assignees (task_id, user_id) SELECT $1, unnest($2::bigint[])", [taskId, [owner, member]]);
  const row = await getProjectById(id);
  assert.equal(row?.total_tasks, "1");
  assert.equal(row?.completed_tasks, "1");
  assert.equal(row?.progress_percent, 100);
});

test("creation rolls back both project and Owner on an unknown member FK", async () => {
  const before = (await pool.query("SELECT count(*) AS count FROM projects")).rows[0].count;
  await assert.rejects(createProjectWithMembers({ project_name: "Must roll back", start_date: "2026-10-11",
    created_by: 1, member_ids: [999999] }), { code: "23503" });
  assert.equal((await pool.query("SELECT count(*) AS count FROM projects")).rows[0].count, before);
  assert.equal((await pool.query("SELECT 1 FROM projects WHERE project_name = 'Must roll back'")).rowCount, 0);
});

test("updates clear nullable fields, preserve date strings and propagate CHECK failures", async () => {
  const id = await project(1, "Update test");
  assert.equal(await updateProject(id, { project_name: "Robert'); DROP TABLE users;--",
    project_description: "Description", due_date: "2026-10-20" }), true);
  assert.equal((await getProjectById(id))?.start_date, "2026-10-11");
  await assert.rejects(updateProject(id, { start_date: "2026-10-20" }), { code: "23514" });
  assert.equal((await getProjectById(id))?.start_date, "2026-10-11");
  assert.equal(await updateProject(id, { project_description: null, due_date: null }), true);
  const cleared = await getProjectById(id);
  assert.equal(cleared?.project_description, null);
  assert.equal(cleared?.due_date, null);
  assert.equal(cleared?.project_name, "Robert'); DROP TABLE users;--");
  assert.equal(await updateProject(999999, { project_name: "Absent" }), false);
  assert.equal(await getProjectById(999999), null);
  await assert.rejects(updateProject(id, {}), TypeError);
  await assert.rejects(updateProject(id, { created_by: 2 } as never), TypeError);
  await assert.rejects(getProjectById(Number.MAX_SAFE_INTEGER + 1), TypeError);
  await assert.rejects(listProjectsForUser({ user_id: 1, status: null, page: 1, page_size: 51 }), TypeError);
});

test("deletion cascades and a downstream failure rolls the entire deletion back", async () => {
  const id = await project(1, "Delete test");
  const taskId = await task(id, 1, "To Do");
  await pool.query("INSERT INTO task_assignees (task_id,user_id) VALUES ($1,1)", [taskId]);
  await pool.query("INSERT INTO comments (task_id,user_id,comment_text) VALUES ($1,1,'Keep until commit')", [taskId]);
  await pool.query(`CREATE FUNCTION w2_block_delete() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'intentional deletion failure'; END $$`);
  await pool.query("CREATE TRIGGER w2_block_delete BEFORE DELETE ON comments FOR EACH ROW EXECUTE FUNCTION w2_block_delete()");
  try {
    await assert.rejects(deleteProject(id), { code: "P0001" });
    assert.ok(await getProjectById(id));
    assert.equal((await pool.query("SELECT 1 FROM tasks WHERE task_id = $1", [taskId])).rowCount, 1);
    assert.equal((await listProjectMembers(id)).length, 1);
  } finally {
    await pool.query("DROP TRIGGER w2_block_delete ON comments");
    await pool.query("DROP FUNCTION w2_block_delete()");
  }
  assert.equal(await deleteProject(id), true);
  assert.equal(await getProjectById(id), null);
  assert.equal((await pool.query("SELECT 1 FROM tasks WHERE task_id = $1", [taskId])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM comments WHERE task_id = $1", [taskId])).rowCount, 0);
  assert.equal((await pool.query("SELECT 1 FROM task_assignees WHERE task_id = $1", [taskId])).rowCount, 0);
  assert.deepEqual(await listProjectMembers(id), []);
  assert.ok(await getProjectById(1));
  assert.equal(await deleteProject(id), false);
});
