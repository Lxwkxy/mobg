import { pool } from "../db.js";
import { assertDomainId, lockProject, withTransaction } from "./dbHelpers.js";

export interface CommentRow {
  comment_id: string;
  comment_text: string;
  comment_created_at: Date;
  user_id: string;
  user_name: string;
}

export async function listCommentsByTask(taskId: number): Promise<CommentRow[]> {
  assertDomainId(taskId);
  return (await pool.query<CommentRow>(`SELECT c.comment_id, c.comment_text, c.comment_created_at,
    c.user_id, u.user_name FROM comments c JOIN users u USING (user_id)
    WHERE c.task_id = $1 ORDER BY c.comment_created_at, c.comment_id`, [taskId])).rows;
}

// Recheck membership and task scope under the same project lock used by member removal.
export async function createComment(input: {
  project_id: number; task_id: number; user_id: number; comment_text: string;
}): Promise<CommentRow | null> {
  assertDomainId(input.project_id); assertDomainId(input.task_id); assertDomainId(input.user_id);
  return withTransaction(async (client) => {
    await lockProject(client, input.project_id);
    const row = (await client.query<CommentRow>(`WITH inserted AS (
      INSERT INTO comments (task_id, user_id, comment_text)
      SELECT t.task_id, m.user_id, $4 FROM tasks t
      JOIN project_members m ON m.project_id = t.project_id
      WHERE t.project_id = $1 AND t.task_id = $2 AND m.user_id = $3
        AND m.role IN ('Owner', 'Member')
      RETURNING comment_id, comment_text, comment_created_at, user_id
    ) SELECT inserted.*, u.user_name FROM inserted JOIN users u USING (user_id)`,
    [input.project_id, input.task_id, input.user_id, input.comment_text])).rows[0];
    return row ?? null;
  });
}
