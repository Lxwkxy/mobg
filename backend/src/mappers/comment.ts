import type { TaskComment } from "../contracts/api.js";
import type { CommentRow } from "../services/commentDb.js";
import { domainIdToNumber } from "../services/dbHelpers.js";

export function mapComment(row: CommentRow): TaskComment {
  return {
    commentId: domainIdToNumber(row.comment_id),
    commentText: row.comment_text,
    createdAt: row.comment_created_at.toISOString(),
    userId: domainIdToNumber(row.user_id),
    userName: row.user_name,
  };
}
