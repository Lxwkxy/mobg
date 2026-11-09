import { isDeepStrictEqual } from "node:util";
import type { PoolClient } from "pg";
import { assertDomainId, withTransaction } from "../services/dbHelpers.js";
import { requireAccountSchema } from "./schema.js";

export interface DemoRoles { owner_id: number; member_id: number; outsider_id: number }
export interface DemoFixture {
  reference_date: string;
  roles: DemoRoles;
  project_ids: Record<"main" | "completed" | "empty" | "delete", string>;
  task_ids: string[];
}
interface StoredFixture extends DemoFixture { snapshot: unknown }
export const demoSeedKey = "mobg-w5-v1";

// Only business data, never auth rows or credentials. Persisted in the dump so a
// renamed/deleted fixture is still detected after restore, even if all names change.
async function snapshot(client: PoolClient, projectIds: string[]): Promise<unknown> {
  const projects = (await client.query(`SELECT project_id, project_name, project_description,
    start_date::text, due_date::text, created_by FROM projects WHERE project_id = ANY($1::bigint[]) ORDER BY project_id`, [projectIds])).rows;
  const members = (await client.query(`SELECT project_id,user_id,role,date_join::text FROM project_members
    WHERE project_id = ANY($1::bigint[]) ORDER BY project_id,user_id`, [projectIds])).rows;
  const tasks = (await client.query(`SELECT task_id,task_title,task_description,priority,due_date::text,
    project_id,status_id,status_name,created_by FROM tasks JOIN task_statuses USING(status_id)
    WHERE project_id = ANY($1::bigint[]) ORDER BY task_id`, [projectIds])).rows;
  const assignees = (await client.query(`SELECT a.task_id,a.user_id FROM task_assignees a JOIN tasks t USING(task_id)
    WHERE t.project_id = ANY($1::bigint[]) ORDER BY a.task_id,a.user_id`, [projectIds])).rows;
  const comments = (await client.query(`SELECT c.comment_id,c.task_id,c.user_id,c.comment_text FROM comments c JOIN tasks t USING(task_id)
    WHERE t.project_id = ANY($1::bigint[]) ORDER BY c.comment_id`, [projectIds])).rows;
  return { projects, members, tasks, assignees, comments };
}

export async function seedW5Demo(roles: DemoRoles, referenceDate?: string): Promise<DemoFixture> {
  Object.values(roles).forEach(assertDomainId);
  if (new Set(Object.values(roles)).size !== 3) throw new Error("Three distinct linked demo users are required");
  if (referenceDate && (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
    || new Date(referenceDate + "T00:00:00Z").toISOString().slice(0, 10) !== referenceDate)) {
    throw new Error("Reference date must be a valid YYYY-MM-DD");
  }
  return withTransaction(async client => {
    await requireAccountSchema(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [demoSeedKey]);
    // Maintenance seed only. Hold writes while checking/reusing the whole fixture;
    // the public W4 project-lock protocol remains unchanged.
    await client.query("LOCK TABLE projects,project_members,tasks,task_assignees,comments IN SHARE ROW EXCLUSIVE MODE");
    const credentials = await client.query(`SELECT u.user_id FROM users u JOIN auth_users au ON au.id=u.auth_user_id
      WHERE u.user_id=ANY($1::bigint[]) AND u.email=au.email AND EXISTS (
        SELECT 1 FROM auth_accounts a WHERE a.user_id=au.id AND a.provider_id='credential'
        AND a.account_id=au.id AND length(a.password)>0)`, [Object.values(roles)]);
    if (credentials.rowCount !== 3) throw new Error("Demo users need matching linked Better Auth credentials");
    const statuses = (await client.query<{ status_id: number; status_name: string }>(
      "SELECT status_id,status_name FROM task_statuses ORDER BY status_id")).rows;
    if (statuses.length !== 3 || !["To Do", "Doing", "Done"].every(name => statuses.some(s => s.status_name === name))) {
      throw new Error("Reconcile task statuses before seeding");
    }
    const existing = (await client.query<{ fixture: StoredFixture }>(
      "SELECT fixture FROM demo_seed_runs WHERE seed_key=$1", [demoSeedKey])).rows[0]?.fixture;
    if (existing) {
      if (!isDeepStrictEqual(existing.roles, roles) || (referenceDate && referenceDate !== existing.reference_date)
        || !isDeepStrictEqual(existing.snapshot, await snapshot(client, Object.values(existing.project_ids)))) {
        throw new Error("W5 fixture changed; preserve edits and use a fresh test database, or reconcile explicitly");
      }
      const { snapshot: _snapshot, ...fixture } = existing;
      return fixture;
    }
    const collision = await client.query("SELECT 1 FROM projects WHERE project_name LIKE 'MobG W5 %' LIMIT 1");
    if (collision.rowCount) throw new Error("Unregistered W5 projects exist; reconcile before seeding");
    const date = referenceDate ?? (await client.query<{ today: string }>(
      "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS today")).rows[0]!.today;
    const plus = (days: number) => new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
    const definitions = [
      ["main", "MobG W5 Main Demo", roles.owner_id, [roles.member_id]],
      ["completed", "MobG W5 Completed", roles.owner_id, []],
      ["empty", "MobG W5 Empty", roles.member_id, []],
      ["delete", "MobG W5 DELETE Sandbox", roles.owner_id, [roles.member_id]],
    ] as const;
    const projectIds = {} as DemoFixture["project_ids"];
    for (const [key, name, owner, members] of definitions) {
      const id = (await client.query<{ project_id: string }>(`INSERT INTO projects
        (project_name,project_description,start_date,due_date,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING project_id`,
      [name, key === "delete" ? "Disposable W5 deletion practice only" : "Keep for W5 main demonstration", plus(-14), plus(30), owner])).rows[0]!.project_id;
      projectIds[key] = id;
      await client.query("INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,'Owner')", [id, owner]);
      for (const member of members) await client.query("INSERT INTO project_members(project_id,user_id,role) VALUES ($1,$2,'Member')", [id, member]);
    }
    const tasks = [
      ["main", "Overdue High - shared", "To Do", 1, -2, [roles.owner_id, roles.member_id]],
      ["main", "Today High - member", "Doing", 1, 0, [roles.member_id]],
      ["main", "Done High - excluded from alerts", "Done", 1, -1, [roles.owner_id]],
      ["main", "Future Medium", "To Do", 2, 7, [roles.owner_id]],
      ["main", "Future Low", "Doing", 3, 3, [roles.owner_id, roles.member_id]],
      ["completed", "Completed Medium", "Done", 2, -1, [roles.owner_id]],
      ["completed", "Completed Low", "Done", 3, -1, [roles.owner_id]],
      ["delete", "DELETE ME - sandbox task", "To Do", 1, 14, [roles.owner_id, roles.member_id]],
    ] as const;
    const taskIds: string[] = [];
    for (const [key, title, status, priority, days, assignees] of tasks) {
      const id = (await client.query<{ task_id: string }>(`INSERT INTO tasks
        (task_title,task_description,priority,due_date,project_id,status_id,created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING task_id`,
      [title, "W5 demonstration fixture", priority, plus(days), projectIds[key],
        statuses.find(s => s.status_name === status)!.status_id, roles.owner_id])).rows[0]!.task_id;
      taskIds.push(id);
      for (const user of assignees) await client.query("INSERT INTO task_assignees(task_id,user_id) VALUES ($1,$2)", [id, user]);
      if (key === "delete") await client.query("INSERT INTO comments(task_id,user_id,comment_text) VALUES ($1,$2,$3)",
        [id, roles.member_id, "Disposable comment for cascade verification"]);
    }
    const fixture: DemoFixture = { reference_date: date, roles, project_ids: projectIds, task_ids: taskIds };
    await client.query("INSERT INTO demo_seed_runs(seed_key,reference_date,fixture) VALUES ($1,$2,$3::jsonb)",
      [demoSeedKey, date, JSON.stringify({ ...fixture, snapshot: await snapshot(client, Object.values(projectIds)) })]);
    return fixture;
  });
}
