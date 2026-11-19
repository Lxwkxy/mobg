import type { Activity } from "../contracts/api.js";
import type { ActivityRow } from "../services/activityDb.js";
import { domainIdToNumber } from "../services/dbHelpers.js";

export function mapActivity(row: ActivityRow): Activity {
  const sourceId = domainIdToNumber(row.source_id);
  const base = {
    activityId: `${row.activity_type}:${sourceId}`,
    occurredAt: row.occurred_at.toISOString(),
    actorId: domainIdToNumber(row.actor_id),
    actorName: row.actor_name,
    taskId: domainIdToNumber(row.task_id),
    taskTitle: row.task_title,
  };
  if (row.activity_type === "task_created") {
    return { ...base, activityType: row.activity_type, commentId: null, commentText: null };
  }
  return { ...base, activityType: row.activity_type, commentId: sourceId, commentText: row.comment_text };
}
