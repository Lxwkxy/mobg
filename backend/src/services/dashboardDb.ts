import { pool } from "../db.js";
import { assertDomainId } from "./dbHelpers.js";

export interface DashboardSummaryRow {
  project_count: string; task_count: string; todo_count: string; in_progress_count: string;
  done_count: string; overdue_count: string; high_priority_count: string;
}

// All tasks in current member projects, including tasks assigned to other members.
// COUNT stays a pg BIGINT string; Book safely converts it for the API DTO.
export async function getDashboardSummary(userId: number): Promise<DashboardSummaryRow> {
  assertDomainId(userId);
  return (await pool.query<DashboardSummaryRow>(`WITH member_projects AS (
    SELECT project_id FROM project_members WHERE user_id = $1 AND role IN ('Owner', 'Member')
  )
  SELECT (SELECT COUNT(*) FROM member_projects) AS project_count,
    COUNT(*) AS task_count,
    COUNT(*) FILTER (WHERE s.status_name = 'To Do') AS todo_count,
    COUNT(*) FILTER (WHERE s.status_name = 'Doing') AS in_progress_count,
    COUNT(*) FILTER (WHERE s.status_name = 'Done') AS done_count,
    COUNT(*) FILTER (WHERE t.due_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date
      AND s.status_name <> 'Done') AS overdue_count,
    COUNT(*) FILTER (WHERE t.priority = 1 AND s.status_name <> 'Done') AS high_priority_count
  FROM tasks t JOIN task_statuses s USING (status_id)
  JOIN member_projects m USING (project_id)`, [userId])).rows[0]!;
}
