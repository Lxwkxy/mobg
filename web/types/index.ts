import type {
  Project,
  Task,
  UserProfile,
  UserResponse,
} from "../../backend/src/contracts/api";

export type * from "../../backend/src/contracts/api";

export type User = UserProfile;

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  isNetworkError?: boolean;
}

export type CurrentUserResponse = UserResponse;

/**
 * ใช้ Project type จาก backend โดยตรง
 * เพื่อให้หน้า Projects และ Project Detail
 * เข้าถึงฟิลด์ต่าง ๆ ได้ครบตาม API contract
 */
export type ProjectItem = Project;

export type TaskItem = Pick<
  Task,
  | "taskId"
  | "taskTitle"
  | "taskDescription"
  | "priority"
  | "status"
  | "dueDate"
  | "assignees"
  | "projectName"
  | "projectId"
>;