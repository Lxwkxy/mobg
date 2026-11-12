import type { Task, TaskStatus } from "../contracts/api.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import type { TaskRow, TaskStatusName } from "../services/taskDb.js";

// DB names (To Do / Doing / Done) <-> API labels (To do / In progress / Done).
export const toApiStatus: Record<TaskStatusName, TaskStatus> = {
  "To Do": "To do",
  "Doing": "In progress",
  "Done": "Done",
};
export const toDbStatus: Record<TaskStatus, TaskStatusName> = {
  "To do": "To Do",
  "In progress": "Doing",
  "Done": "Done",
};

// BIGINT ids arrive as strings (also inside assignees); convert only after the safe-integer check.
export function mapTask(row: TaskRow): Task {
  const status = toApiStatus[row.status_name];
  if (!status) throw new TypeError("Unknown stored task status");
  return {
    taskId: domainIdToNumber(row.task_id),
    taskTitle: row.task_title,
    taskDescription: row.task_description,
    priority: row.priority,
    dueDate: row.due_date,
    isOverdue: row.is_overdue,
    createdAt: row.task_create_date.toISOString(),
    projectId: domainIdToNumber(row.project_id),
    projectName: row.project_name,
    status,
    createdById: domainIdToNumber(row.created_by),
    createdByName: row.created_by_name,
    assignees: row.assignees.map((a) => ({ userId: domainIdToNumber(a.user_id), userName: a.user_name })),
  };
}
