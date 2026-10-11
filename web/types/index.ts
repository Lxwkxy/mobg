import type { Project, Task, UserProfile } from "../../backend/src/contracts/api";

// Business contracts are owned by the Express API. Type-only imports do not bundle
// backend runtime/dependencies into Next.js. Better Auth keeps its own client types.
export type * from "../../backend/src/contracts/api";
export type User = UserProfile;

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  isNetworkError?: boolean;
}

// W1 screen projections intentionally use only fields currently displayed.
// API DTOs above remain complete for W2 integration.
export type ProjectItem = Pick<Project,
  "projectId" | "projectName" | "projectDescription" | "completedTasks" | "totalTasks" | "dueDate"
>;
export type TaskItem = Pick<Task,
  "taskId" | "taskTitle" | "taskDescription" | "priority" | "status" | "dueDate"
  | "assignees" | "projectName" | "projectId"
>;
