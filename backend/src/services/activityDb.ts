import { pool } from "../db.js";
import { assertDomainId } from "./dbHelpers.js";

interface ActivityRowBase {
  source_id: string;
  occurred_at: Date;
  actor_id: string;
  actor_name: string;
  task_id: string;
  task_title: string;
}

export type ActivityRow = ActivityRowBase & (
  | { activity_type: "task_created"; comment_text: null }
  | { activity_type: "comment_added"; comment_text: string }
);

export async function listActivity(projectId: number, limit: number, taskId?: number): Promise<ActivityRow[]> {
  assertDomainId(projectId);
  if (taskId !== undefined) assertDomainId(taskId);

  const { rows } = await pool.query<ActivityRow>(`
    WITH scoped_tasks AS (
      SELECT task_id, task_title, task_create_date, created_by
      FROM tasks
      WHERE project_id = $1 AND ($3::bigint IS NULL OR task_id = $3)
    ), events AS (
      SELECT 'task_created' AS activity_type, t.task_id AS source_id,
        t.task_create_date AS occurred_at, t.created_by AS actor_id,
        t.task_id, t.task_title, NULL::text AS comment_text
      FROM scoped_tasks t
      UNION ALL
      SELECT 'comment_added', c.comment_id, c.comment_created_at, c.user_id,
        t.task_id, t.task_title, c.comment_text
      FROM scoped_tasks t JOIN comments c USING (task_id)
    )
    SELECT e.*, u.user_name AS actor_name
    FROM events e JOIN users u ON u.user_id = e.actor_id
    ORDER BY e.occurred_at DESC, e.activity_type, e.source_id DESC
    LIMIT $2
  `, [projectId, limit, taskId ?? null]);
  return rows;
}
