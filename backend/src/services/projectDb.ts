import { pool } from "../db.js";
import { assertDomainId, withTransaction } from "./dbHelpers.js";
import type { TaskStatus } from "../contracts/api.js";

export interface ProjectMembershipRow { project_id: string; user_id: string; role: string }
export type FindProjectMembership = (projectId: number, userId: number) => Promise<ProjectMembershipRow | null>;
export interface UserRow { user_id: string; user_name: string; email: string }
export interface ProjectMemberRow extends UserRow { role: string; date_join: string }
export interface ProjectRow {
  project_id: string; project_name: string; project_description: string | null;
  start_date: string; due_date: string | null; project_create_date: Date;
  created_by: string; creator_name: string; total_tasks: string; completed_tasks: string;
  progress_percent: number; derived_status: TaskStatus;
}
export interface UserProjectRow extends ProjectRow { my_role: string }
export interface CreateProjectInput {
  project_name: string; project_description?: string | null; start_date: string;
  due_date?: string | null; created_by: number; member_ids: number[];
}
export interface ProjectChanges {
  project_name?: string; project_description?: string | null;
  start_date?: string; due_date?: string | null;
}

export const findProjectMembership: FindProjectMembership = async (projectId, userId) => {
  assertDomainId(projectId); assertDomainId(userId);
  const result = await pool.query<ProjectMembershipRow>(
    "SELECT project_id, user_id, role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId],
  );
  return result.rows[0] ?? null;
};

// Aggregate tasks before any membership/assignee joins so each task counts once.
const projectData = `
WITH task_counts AS (
  SELECT t.project_id, COUNT(*) AS total_tasks,
    COUNT(*) FILTER (WHERE s.status_name = 'Done') AS completed_tasks,
    COUNT(*) FILTER (WHERE s.status_name = 'To Do') AS todo_tasks
  FROM tasks t JOIN task_statuses s ON s.status_id = t.status_id GROUP BY t.project_id
), project_data AS (
  SELECT p.project_id, p.project_name, p.project_description,
    p.start_date::text, p.due_date::text, p.project_create_date, p.created_by,
    u.user_name AS creator_name,
    COALESCE(c.total_tasks, 0::bigint) AS total_tasks,
    COALESCE(c.completed_tasks, 0::bigint) AS completed_tasks,
    CASE WHEN COALESCE(c.total_tasks, 0) = 0 THEN 0
      ELSE ROUND(100.0 * c.completed_tasks / c.total_tasks)::integer END AS progress_percent,
    CASE WHEN COALESCE(c.total_tasks, 0) = 0 OR c.todo_tasks = c.total_tasks THEN 'To do'
      WHEN c.completed_tasks = c.total_tasks THEN 'Done' ELSE 'In progress' END AS derived_status
  FROM projects p JOIN users u ON u.user_id = p.created_by
  LEFT JOIN task_counts c ON c.project_id = p.project_id
)`;

export async function listProjectsForUser(input: {
  user_id: number; status: TaskStatus | null; page: number; page_size: number;
}): Promise<{ items: UserProjectRow[]; total_items: string }> {
  assertDomainId(input.user_id); assertDomainId(input.page);
  if (!Number.isInteger(input.page_size) || input.page_size < 1 || input.page_size > 50) {
    throw new TypeError("page_size must be between 1 and 50");
  }
  if (input.status !== null && !["To do", "In progress", "Done"].includes(input.status)) {
    throw new TypeError("Unknown project status");
  }
  const offset = (BigInt(input.page - 1) * BigInt(input.page_size)).toString();
  const result = await pool.query<UserProjectRow & { total_items: string }>(`${projectData}, filtered AS (
    SELECT p.*, m.role AS my_role FROM project_data p
    JOIN project_members m ON m.project_id = p.project_id
    WHERE m.user_id = $1 AND ($2::text IS NULL OR p.derived_status = $2)
  )
  SELECT page.*, totals.total_items FROM (SELECT COUNT(*) AS total_items FROM filtered) totals
  LEFT JOIN LATERAL (
    SELECT * FROM filtered ORDER BY project_create_date DESC, project_id DESC LIMIT $3 OFFSET $4
  ) page ON true ORDER BY page.project_create_date DESC, page.project_id DESC`,
  [input.user_id, input.status, input.page_size, offset]);
  return {
    items: result.rows.filter((row) => row.project_id !== null)
      .map(({ total_items: _total, ...row }) => row),
    total_items: result.rows[0]?.total_items ?? "0",
  };
}

// Book checks membership before using this unscoped detail lookup.
export async function getProjectById(projectId: number): Promise<ProjectRow | null> {
  assertDomainId(projectId);
  const result = await pool.query<ProjectRow>(`${projectData} SELECT * FROM project_data WHERE project_id = $1`, [projectId]);
  return result.rows[0] ?? null;
}

export async function createProjectWithMembers(input: CreateProjectInput): Promise<{ project_id: string }> {
  assertDomainId(input.created_by);
  input.member_ids.forEach(assertDomainId);
  const members = [...new Set(input.member_ids)].filter((id) => id !== input.created_by);
  return withTransaction(async (client) => {
    const result = await client.query<{ project_id: string }>(`
      INSERT INTO projects (project_name, project_description, start_date, due_date, created_by)
      VALUES ($1, $2, $3::date, $4::date, $5) RETURNING project_id`,
    [input.project_name, input.project_description ?? null, input.start_date, input.due_date ?? null, input.created_by]);
    const project = result.rows[0]!;
    await client.query("INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Owner')",
      [project.project_id, input.created_by]);
    await client.query(`INSERT INTO project_members (project_id, user_id, role)
      SELECT $1, id, 'Member' FROM unnest($2::bigint[]) AS id`, [project.project_id, members]);
    return project;
  });
}

export async function updateProject(projectId: number, changes: ProjectChanges): Promise<boolean> {
  assertDomainId(projectId);
  const columns = new Set(["project_name", "project_description", "start_date", "due_date"]);
  const entries = Object.entries(changes);
  if (entries.some(([key]) => !columns.has(key))) throw new TypeError("Unsupported project field");
  const supplied = entries.filter(([, value]) => value !== undefined);
  if (supplied.length === 0) throw new TypeError("At least one project field is required");
  // Identifiers come only from the whitelist; values always use placeholders.
  const assignments = supplied.map(([key], index) => `${key} = $${index + 2}`);
  const result = await pool.query(`UPDATE projects SET ${assignments.join(", ")} WHERE project_id = $1`,
    [projectId, ...supplied.map(([, value]) => value)]);
  return result.rowCount === 1;
}

export async function deleteProject(projectId: number): Promise<boolean> {
  assertDomainId(projectId);
  return withTransaction(async (client) => {
    // The existing FK cascade removes tasks, comments, assignees and memberships.
    const result = await client.query("DELETE FROM projects WHERE project_id = $1", [projectId]);
    return result.rowCount === 1;
  });
}

export async function listUsers(): Promise<UserRow[]> {
  return (await pool.query<UserRow>("SELECT user_id, user_name, email FROM users ORDER BY user_name, user_id")).rows;
}

export async function listProjectMembers(projectId: number): Promise<ProjectMemberRow[]> {
  assertDomainId(projectId);
  return (await pool.query<ProjectMemberRow>(`SELECT u.user_id, u.user_name, u.email, m.role, m.date_join::text
    FROM project_members m JOIN users u ON u.user_id = m.user_id WHERE m.project_id = $1
    ORDER BY CASE WHEN m.role = 'Owner' THEN 0 ELSE 1 END, u.user_name, u.user_id`, [projectId])).rows;
}
