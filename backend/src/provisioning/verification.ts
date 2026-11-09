import { isDeepStrictEqual } from "node:util";
import type { Pool, PoolClient } from "pg";
import { pool } from "../db.js";
import { getDashboardSummary } from "../services/dashboardDb.js";
import { getProjectById } from "../services/projectDb.js";
import { listHighPriorityTasks, listTasksForAssignee } from "../services/taskDb.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import { inspectSchema } from "./schema.js";

type Connection = Pick<Pool | PoolClient, "query">;
export const quoteIdentifier = (name: string) => '"' + name.replaceAll('"', '""') + '"';

export async function auditRelationships(db: Connection) {
  const issues: Record<string, number> = {};
  // Check every actual single-column FK, including auth links. No row contents
  // or credentials leave this function; metadata comes from PostgreSQL itself.
  const fks = (await db.query<{ name: string; child: string; parent: string; child_column: string; parent_column: string }>(`
    SELECT k.conname AS name,c.relname AS child,p.relname AS parent,
      ca.attname AS child_column,pa.attname AS parent_column
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_class p ON p.oid=k.confrelid
    JOIN pg_attribute ca ON ca.attrelid=c.oid AND ca.attnum=k.conkey[1]
    JOIN pg_attribute pa ON pa.attrelid=p.oid AND pa.attnum=k.confkey[1]
    WHERE n.nspname='public' AND k.contype='f' AND cardinality(k.conkey)=1`)).rows;
  for (const fk of fks) {
    const { child, parent, child_column: cc, parent_column: pc } = fk;
    const count = (await db.query(`SELECT count(*)::int AS n FROM public.${quoteIdentifier(child)} c
      LEFT JOIN public.${quoteIdentifier(parent)} p ON c.${quoteIdentifier(cc)}=p.${quoteIdentifier(pc)}
      WHERE c.${quoteIdentifier(cc)} IS NOT NULL AND p.${quoteIdentifier(pc)} IS NULL`)).rows[0].n as number;
    if (count) issues[fk.name] = count;
  }
  const checks: Record<string, string> = {
    duplicate_domain_emails: "SELECT 1 FROM users GROUP BY lower(btrim(email)) HAVING count(*)>1",
    duplicate_auth_emails: "SELECT 1 FROM auth_users GROUP BY lower(btrim(email)) HAVING count(*)>1",
    duplicate_statuses: "SELECT 1 FROM task_statuses GROUP BY lower(btrim(status_name)) HAVING count(*)>1",
    unknown_statuses: "SELECT 1 FROM task_statuses WHERE status_name NOT IN ('To Do','Doing','Done')",
    missing_statuses: "SELECT 1 FROM (VALUES ('To Do'),('Doing'),('Done')) s(name) WHERE NOT EXISTS (SELECT 1 FROM task_statuses t WHERE t.status_name=s.name)",
    unknown_roles: "SELECT 1 FROM project_members WHERE role NOT IN ('Owner','Member')",
    projects_without_owner: "SELECT 1 FROM projects p WHERE NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=p.project_id AND m.role='Owner')",
    tasks_without_assignees: "SELECT 1 FROM tasks t WHERE NOT EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id=t.task_id)",
    assignees_outside_project: `SELECT 1 FROM task_assignees a JOIN tasks t USING(task_id)
      WHERE NOT EXISTS (SELECT 1 FROM project_members m WHERE m.project_id=t.project_id AND m.user_id=a.user_id AND m.role IN ('Owner','Member'))`,
    invalid_task_values: "SELECT 1 FROM tasks WHERE due_date IS NULL OR priority NOT IN (1,2,3)",
    invalid_linked_credentials: `SELECT 1 FROM users u LEFT JOIN auth_users au ON au.id=u.auth_user_id
      WHERE u.auth_user_id IS NOT NULL AND (au.id IS NULL OR au.email<>u.email OR NOT EXISTS (
        SELECT 1 FROM auth_accounts a WHERE a.user_id=au.id AND a.account_id=au.id AND a.provider_id='credential' AND length(a.password)>0))`,
  };
  for (const [name, sql] of Object.entries(checks)) {
    const count = (await db.query(`SELECT count(*)::int AS n FROM (${sql}) violations`)).rows[0].n as number;
    if (count) issues[name] = count;
  }
  const accounts = (await db.query(`SELECT
    (SELECT count(*) FROM users) AS domain_users,
    (SELECT count(*) FROM users WHERE auth_user_id IS NOT NULL) AS linked_users,
    (SELECT count(*) FROM users WHERE auth_user_id IS NULL) AS unlinked_domain_users,
    (SELECT count(*) FROM auth_users a WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.auth_user_id=a.id)) AS unlinked_auth_users,
    (SELECT count(*) FROM auth_accounts WHERE provider_id='credential') AS credential_accounts`)).rows[0];
  return { foreign_keys_checked: fks.length, issues, accounts };
}

// Independent application-side oracle: read individual tasks/memberships without
// reusing aggregate SQL. Run while the demo DB is idle (separate service calls).
export async function verifyDatabase() {
  const schema = await inspectSchema(pool);
  if (schema.migrations.slice(0, 5).some(m => m.state !== "complete")) throw new Error("Core schema incomplete");
  const relationships = await auditRelationships(pool);
  const projects = (await pool.query<{ project_id: string }>("SELECT project_id FROM projects ORDER BY project_id")).rows;
  const members = (await pool.query<{ project_id: string; user_id: string; role: string }>("SELECT project_id,user_id,role FROM project_members")).rows;
  const users = (await pool.query<{ user_id: string }>("SELECT user_id FROM users ORDER BY user_id")).rows;
  const tasks = (await pool.query<{ task_id: string; project_id: string; status_name: string; priority: number; due_date: string }>(
    "SELECT task_id,project_id,status_name,priority,due_date::text FROM tasks JOIN task_statuses USING(status_id)")).rows;
  const assignments = (await pool.query<{ task_id: string; user_id: string }>("SELECT task_id,user_id FROM task_assignees")).rows;
  const clock = (await pool.query<{ now: Date; version: string }>("SELECT CURRENT_TIMESTAMP AS now,current_setting('server_version') AS version")).rows[0]!;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock.now);
  const mismatch: string[] = [];
  const summaries = [];
  const ordered = (items: typeof tasks) => [...items].sort((a,b) => a.due_date.localeCompare(b.due_date)
    || (BigInt(a.task_id) < BigInt(b.task_id) ? -1 : BigInt(a.task_id) > BigInt(b.task_id) ? 1 : 0));
  for (const user of users) {
    const visible = new Set(members.filter(m => m.user_id === user.user_id && ["Owner","Member"].includes(m.role)).map(m => m.project_id));
    const scoped = tasks.filter(t => visible.has(t.project_id));
    const expected = { project_count: String(visible.size), task_count: String(scoped.length),
      todo_count: String(scoped.filter(t => t.status_name === "To Do").length),
      in_progress_count: String(scoped.filter(t => t.status_name === "Doing").length),
      done_count: String(scoped.filter(t => t.status_name === "Done").length),
      overdue_count: String(scoped.filter(t => t.status_name !== "Done" && t.due_date < today).length),
      high_priority_count: String(scoped.filter(t => t.status_name !== "Done" && t.priority === 1).length) };
    const actual = await getDashboardSummary(domainIdToNumber(user.user_id));
    if (!isDeepStrictEqual(actual, expected)) mismatch.push(`dashboard:${user.user_id}`);
    const high = await listHighPriorityTasks(domainIdToNumber(user.user_id));
    if (!isDeepStrictEqual(high.map(t => t.task_id), ordered(scoped.filter(t => t.priority === 1 && t.status_name !== "Done")).slice(0,5).map(t => t.task_id))) mismatch.push(`high:${user.user_id}`);
    const mine = await listTasksForAssignee({ user_id: domainIdToNumber(user.user_id), status_name: null });
    const assigned = new Set(assignments.filter(a => a.user_id === user.user_id).map(a => a.task_id));
    if (!isDeepStrictEqual(mine.map(t => t.task_id), ordered(scoped.filter(t => assigned.has(t.task_id))).map(t => t.task_id))) mismatch.push(`my-tasks:${user.user_id}`);
    summaries.push({ user_id: user.user_id, ...actual });
  }
  for (const p of projects) {
    const scoped = tasks.filter(t => t.project_id === p.project_id);
    const done = scoped.filter(t => t.status_name === "Done").length;
    const actual = await getProjectById(domainIdToNumber(p.project_id));
    const status = scoped.length === 0 || scoped.every(t => t.status_name === "To Do") ? "To do"
      : done === scoped.length ? "Done" : "In progress";
    if (!actual || actual.total_tasks !== String(scoped.length) || actual.completed_tasks !== String(done)
      || actual.progress_percent !== (scoped.length ? Math.round(100 * done / scoped.length) : 0)
      || actual.derived_status !== status) mismatch.push(`project:${p.project_id}`);
  }
  return { database: schema.database, server_version: clock.version, bangkok_date: today, migrations: schema.migrations,
    ...relationships, projects_checked: projects.length, tasks_checked: tasks.length, summaries, mismatches: mismatch,
    passed: Object.keys(relationships.issues).length === 0 && mismatch.length === 0 };
}
