import { pool } from "../db.js";
import { assertDomainId, lockProject, withTransaction } from "./dbHelpers.js";
import type { TaskPriority } from "../contracts/api.js";
import type { PoolClient } from "pg";

export type TaskStatusName = "To Do" | "Doing" | "Done";
export interface TaskAssigneeRow { user_id: string; user_name: string }
export interface TaskRow {
  task_id: string; task_title: string; task_description: string | null;
  priority: TaskPriority; due_date: string; task_create_date: Date;
  project_id: string; project_name: string; status_name: TaskStatusName;
  is_overdue: boolean; created_by: string; created_by_name: string;
  assignees: TaskAssigneeRow[];
}
export interface CreateTaskInput {
  project_id: number; task_title: string; task_description?: string | null;
  priority: TaskPriority; due_date: string; created_by: number; assignee_ids: number[];
}
export interface TaskChanges {
  task_title?: string; task_description?: string | null; priority?: TaskPriority;
  due_date?: string; status_name?: TaskStatusName; assignee_ids?: number[];
}

export class InvalidTaskAssigneesError extends Error {
  constructor(public readonly userIds: number[]) {
    super("At least one assignee is required and all assignees must be current project members");
    this.name = "InvalidTaskAssigneesError";
  }
}

async function assertCurrentAssignees(client: PoolClient, projectId: string | number, ids: number[]): Promise<void> {
  if (!ids.length) throw new InvalidTaskAssigneesError([]);
  const members = (await client.query<{ user_id: string }>(`SELECT user_id FROM project_members
    WHERE project_id = $1 AND user_id = ANY($2::bigint[])`, [projectId, ids])).rows;
  const present = new Set(members.map(member => member.user_id));
  const missing = ids.filter(id => !present.has(String(id)));
  if (missing.length) throw new InvalidTaskAssigneesError(missing);
}

function assertStatusName(value: TaskStatusName): void {
  if (!["To Do", "Doing", "Done"].includes(value)) throw new TypeError("Unknown task status");
}

// Aggregate only the assignees so the outer query always returns one row per task.
// Cast nested BIGINTs before JSON encoding, which would otherwise turn them into JS numbers.
const taskData = `
SELECT t.task_id, t.task_title, t.task_description, t.priority, t.due_date::text,
  t.task_create_date, t.project_id, p.project_name, s.status_name,
  (t.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
    AND s.status_name <> 'Done') AS is_overdue,
  t.created_by, creator.user_name AS created_by_name,
  COALESCE(assigned.assignees, '[]'::json) AS assignees
FROM tasks t
JOIN projects p ON p.project_id = t.project_id
JOIN task_statuses s ON s.status_id = t.status_id
JOIN users creator ON creator.user_id = t.created_by
LEFT JOIN LATERAL (
  SELECT json_agg(json_build_object('user_id', u.user_id::text, 'user_name', u.user_name)
    ORDER BY u.user_name, u.user_id) AS assignees
  FROM task_assignees a JOIN users u ON u.user_id = a.user_id
  WHERE a.task_id = t.task_id
) assigned ON true`;

// Book validates the session and current project membership before these reads.
export async function listTasksByProject(input: {
  project_id: number; status_name: TaskStatusName | null;
}): Promise<TaskRow[]> {
  assertDomainId(input.project_id);
  if (input.status_name !== null) assertStatusName(input.status_name);
  return (await pool.query<TaskRow>(`${taskData}
    WHERE t.project_id = $1 AND ($2::text IS NULL OR s.status_name = $2)
    ORDER BY t.due_date, t.task_id`, [input.project_id, input.status_name])).rows;
}

export async function getTaskById(projectId: number, taskId: number): Promise<TaskRow | null> {
  assertDomainId(projectId); assertDomainId(taskId);
  const result = await pool.query<TaskRow>(`${taskData} WHERE t.project_id = $1 AND t.task_id = $2`,
    [projectId, taskId]);
  return result.rows[0] ?? null;
}

export async function listTasksForAssignee(input: {
  user_id: number; status_name: TaskStatusName | null;
}): Promise<TaskRow[]> {
  assertDomainId(input.user_id);
  if (input.status_name !== null) assertStatusName(input.status_name);
  return (await pool.query<TaskRow>(`${taskData}
    WHERE EXISTS (SELECT 1 FROM task_assignees a WHERE a.task_id = t.task_id AND a.user_id = $1)
      AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = t.project_id AND m.user_id = $1
        AND m.role IN ('Owner', 'Member'))
      AND ($2::text IS NULL OR s.status_name = $2)
    ORDER BY t.due_date, t.task_id`, [input.user_id, input.status_name])).rows;
}

export async function listHighPriorityTasks(userId: number, limit = 5): Promise<TaskRow[]> {
  assertDomainId(userId);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError("limit must be between 1 and 100");
  return (await pool.query<TaskRow>(`${taskData}
    WHERE t.priority = 1 AND s.status_name <> 'Done'
      AND EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = t.project_id AND m.user_id = $1
        AND m.role IN ('Owner', 'Member'))
    ORDER BY t.due_date, t.task_id LIMIT $2`, [userId, limit])).rows;
}

// Book validates input/permissions first; membership and minimum count are rechecked under the project lock.
// created_by is the linked MobG user_id from the verified session, never an Auth string ID.
export async function createTask(input: CreateTaskInput): Promise<{ task_id: string }> {
  assertDomainId(input.project_id); assertDomainId(input.created_by);
  input.assignee_ids.forEach(assertDomainId);
  return withTransaction(async (client) => {
    await lockProject(client, input.project_id);
    const result = await client.query<{ task_id: string }>(`INSERT INTO tasks
      (project_id, task_title, task_description, priority, due_date, created_by, status_id)
      VALUES ($1, $2, $3, $4, $5::date, $6,
        (SELECT status_id FROM task_statuses WHERE status_name = 'To Do')) RETURNING task_id`,
    [input.project_id, input.task_title, input.task_description ?? null,
      input.priority, input.due_date, input.created_by]);
    const task = result.rows[0]!;
    await client.query(`INSERT INTO task_assignees (task_id, user_id)
      SELECT $1, unnest($2::bigint[])`, [task.task_id, input.assignee_ids]);
    await assertCurrentAssignees(client, input.project_id, input.assignee_ids);
    return task;
  });
}

// Book must first authorize and resolve the task with getTaskById(projectId, taskId).
export async function updateTask(taskId: number, changes: TaskChanges): Promise<boolean> {
  assertDomainId(taskId);
  const fields = new Set(["task_title", "task_description", "priority", "due_date", "status_name", "assignee_ids"]);
  const entries = Object.entries(changes);
  if (entries.some(([key]) => !fields.has(key))) throw new TypeError("Unsupported task field");
  const supplied = entries.filter(([, value]) => value !== undefined);
  if (supplied.length === 0) throw new TypeError("At least one task field is required");
  if (changes.status_name !== undefined) assertStatusName(changes.status_name);
  if (changes.assignee_ids !== undefined) changes.assignee_ids.forEach(assertDomainId);
  const columns = supplied.filter(([key]) => key !== "assignee_ids");
  // Only allowed identifiers enter SQL; even the status lookup uses a parameter.
  const assignments = columns.map(([key], index) => key === "status_name"
    ? `status_id = (SELECT status_id FROM task_statuses WHERE status_name = $${index + 2})`
    : `${key} = $${index + 2}`);
  return withTransaction(async (client) => {
    // Discover the immutable project ID without taking a task lock first.
    const project = (await client.query<{ project_id: string }>(
      "SELECT project_id FROM tasks WHERE task_id = $1", [taskId])).rows[0];
    if (!project) return false;
    await lockProject(client, project.project_id);
    // Serialize whole-set replacements, including assignee-only concurrent PATCHes.
    const found = await client.query<{ project_id: string }>("SELECT project_id FROM tasks WHERE task_id = $1 FOR UPDATE", [taskId]);
    if (found.rowCount === 0) return false;
    if (assignments.length) {
      await client.query(`UPDATE tasks SET ${assignments.join(", ")} WHERE task_id = $1`,
        [taskId, ...columns.map(([, value]) => value)]);
    }
    if (changes.assignee_ids !== undefined) {
      await client.query("DELETE FROM task_assignees WHERE task_id = $1", [taskId]);
      await client.query(`INSERT INTO task_assignees (task_id, user_id)
        SELECT $1, unnest($2::bigint[])`, [taskId, changes.assignee_ids]);
      await assertCurrentAssignees(client, found.rows[0]!.project_id, changes.assignee_ids);
    }
    return true;
  });
}

// Book checks Owner permission and project-scoped task existence before calling.
export async function deleteTask(taskId: number): Promise<boolean> {
  assertDomainId(taskId);
  return withTransaction(async (client) => {
    // Both task_assignees.task_id and comments.task_id have ON DELETE CASCADE.
    const result = await client.query("DELETE FROM tasks WHERE task_id = $1", [taskId]);
    return result.rowCount === 1;
  });
}
