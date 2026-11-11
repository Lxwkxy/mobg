import type { SearchResults } from "../contracts/api.js";
import { pool } from "../db.js";
import { domainIdToNumber } from "./dbHelpers.js";

type SearchRow = { project_id: string; project_name: string } & (
  | { task_id: null; task_title: null }
  | { task_id: string; task_title: string }
);

export async function searchVisibleProjectsAndTasks(userId: number, query: string): Promise<SearchResults> {
  // Read membership and both result groups from the same database snapshot.
  const { rows } = await pool.query<SearchRow>(`
    WITH visible_projects AS (
      SELECT p.project_id, p.project_name
      FROM project_members m
      JOIN projects p ON p.project_id = m.project_id
      WHERE m.user_id = $1 AND m.role IN ('Owner', 'Member')
    )
    SELECT project_id, project_name, task_id, task_title
    FROM (
      (SELECT p.project_id, p.project_name, NULL::bigint AS task_id, NULL::text AS task_title,
        lower(p.project_name) AS sort_name
        FROM visible_projects p
        WHERE strpos(lower(p.project_name), lower($2)) > 0
        ORDER BY sort_name, p.project_id LIMIT 8)
      UNION ALL
      (SELECT p.project_id, p.project_name, t.task_id, t.task_title, lower(t.task_title) AS sort_name
        FROM visible_projects p
        JOIN tasks t ON t.project_id = p.project_id
        WHERE strpos(lower(t.task_title), lower($2)) > 0
        ORDER BY sort_name, p.project_id, t.task_id LIMIT 8)
    ) matches
    ORDER BY sort_name, project_id, task_id
  `, [userId, query]);

  const results: SearchResults = { projects: [], tasks: [] };
  for (const row of rows) {
    const project = { projectId: domainIdToNumber(row.project_id), projectName: row.project_name };
    if (row.task_id === null) {
      results.projects.push(project);
    } else {
      results.tasks.push({ ...project, taskId: domainIdToNumber(row.task_id), taskTitle: row.task_title });
    }
  }
  return results;
}
