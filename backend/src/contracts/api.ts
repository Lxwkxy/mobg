// Canonical MobG business API types. Frontend re-exports these using type-only imports.
// DateString is YYYY-MM-DD; TimestampString is an ISO 8601 UTC timestamp.
// Validate unknown request values at runtime; these aliases do not validate strings.
export type DateString = string;
export type TimestampString = string;
export type TaskStatus = "To do" | "In progress" | "Done";
export type TaskPriority = 1 | 2 | 3;
export type ProjectRole = "Owner" | "Member";

export interface UserProfile { userId: number; userName: string; email: string }
export interface Assignee { userId: number; userName: string }
export interface Project {
  projectId: number;
  projectName: string;
  projectDescription: string | null;
  startDate: DateString;
  dueDate: DateString | null;
  createdAt: TimestampString;
  creatorId: number;
  creatorName: string;
  myRole?: ProjectRole; // Included in the user's project list and creation response.
  derivedStatus: TaskStatus;
  progressPercent: number;
  totalTasks: number;
  completedTasks: number;
}
export interface Task {
  taskId: number;
  taskTitle: string;
  taskDescription: string | null;
  priority: TaskPriority;
  dueDate: DateString;
  isOverdue: boolean;
  createdAt: TimestampString;
  projectId: number;
  projectName: string;
  status: TaskStatus;
  createdById: number;
  createdByName: string;
  assignees: Assignee[];
}
export interface ProjectMember extends UserProfile {
  role: ProjectRole;
  joinDate: DateString;
}
export interface TaskComment {
  commentId: number;
  commentText: string;
  createdAt: TimestampString;
  userId: number;
  userName: string;
}
interface ActivityBase {
  activityId: string;
  occurredAt: TimestampString;
  actorId: number;
  actorName: string;
  taskId: number;
  taskTitle: string;
}
export type Activity = ActivityBase & (
  | { activityType: "task_created"; commentId: null; commentText: null }
  | { activityType: "comment_added"; commentId: number; commentText: string }
);
export interface DashboardSummary {
  projectCount: number;
  taskCount: number;
  statusCounts: { todo: number; inProgress: number; done: number };
  overdueCount: number;
  highPriorityCount: number; // Calculation and dashboard scope are pending W2 agreement.
}
export interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface CreateProjectRequest {
  projectName: string;
  startDate: DateString;
  projectDescription?: string | null;
  dueDate?: DateString | null;
  memberIds?: number[];
}
export type UpdateProjectRequest = Partial<Omit<CreateProjectRequest, "memberIds">>;
export interface CreateTaskRequest {
  taskTitle: string;
  taskDescription?: string | null;
  priority: TaskPriority;
  dueDate: DateString;
  assigneeIds: number[];
}
export type UpdateTaskRequest = Partial<CreateTaskRequest> & { status?: TaskStatus };
export interface AddMemberRequest { userId: number }
export interface CreateCommentRequest { commentText: string }
export interface ProjectListQuery { status?: TaskStatus; page?: number; pageSize?: number }
export interface TaskListQuery { status?: TaskStatus }
export interface ActivityQuery { limit?: number }

export type BusinessErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN"
  | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";
export interface ErrorDetail {
  field?: string;
  message?: string;
  reason?: "SOLE_ASSIGNEE" | "LAST_OWNER" | "ALREADY_MEMBER";
  taskId?: number;
  taskTitle?: string;
  status?: TaskStatus;
}
export interface ApiFailure {
  success: false;
  error: { code: BusinessErrorCode; message: string; details?: ErrorDetail[] };
}
export type ApiResponse<T extends object> = ({ success: true } & T) | ApiFailure;
export type UserResponse = ApiResponse<{ user: UserProfile }>;
export type UsersResponse = ApiResponse<{ users: UserProfile[] }>;
export type ProjectsResponse = ApiResponse<{ projects: Project[]; pagination: Pagination }>;
export type ProjectResponse = ApiResponse<{ project: Project }>;
export type MembersResponse = ApiResponse<{ members: ProjectMember[] }>;
export type MemberResponse = ApiResponse<{ member: ProjectMember }>;
export type TasksResponse = ApiResponse<{ tasks: Task[] }>;
export type TaskResponse = ApiResponse<{ task: Task }>;
export type CommentsResponse = ApiResponse<{ comments: TaskComment[] }>;
export type CommentResponse = ApiResponse<{ comment: TaskComment }>;
export type ActivitiesResponse = ApiResponse<{ activities: Activity[] }>;
export type DashboardResponse = ApiResponse<{ summary: DashboardSummary }>;
export type MessageResponse = ApiResponse<{ message: string }>;
