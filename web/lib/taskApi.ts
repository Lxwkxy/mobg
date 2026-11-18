import { ApiRequestError, request } from '@/lib/projectApi';

import type {
  CommentResponse,
  CommentsResponse,
  CreateCommentRequest,
  CreateTaskRequest,
  MembersResponse,
  MessageResponse,
  ProjectMember,
  Task,
  TaskComment,
  TaskListQuery,
  TaskResponse,
  TasksResponse,
  UpdateTaskRequest,
} from '@/types';

export function parseRouteId(
  value: string | undefined,
  label: string,
): number {
  if (!value || !/^[1-9][0-9]*$/.test(value)) {
    throw new ApiRequestError(`Invalid ${label}.`, 400);
  }

  const id = Number(value);

  if (!Number.isSafeInteger(id)) {
    throw new ApiRequestError(`Invalid ${label}.`, 400);
  }

  return id;
}

export function tryParseRouteId(
  value: string | undefined,
  label = 'ID',
): number | null {
  try {
    return parseRouteId(value, label);
  } catch {
    return null;
  }
}

type Success<T> = Extract<T, { success: true }>;

// สร้าง Query Parameter สำหรับกรองสถานะงาน
function buildTaskQuery(query: TaskListQuery = {}): string {
  const params = new URLSearchParams();

  if (query.status) {
    params.set('status', query.status);
  }

  const qs = params.toString();

  return qs ? `?${qs}` : '';
}

// เรียก API รายการงานและตรวจสอบ Response ร่วมกัน
async function fetchTaskList(
  path: string,
  errorMessage: string,
): Promise<Task[]> {
  const body = await request<Success<TasksResponse>>(path);

  if (!Array.isArray(body.tasks)) {
    throw new ApiRequestError(errorMessage, 200);
  }

  return body.tasks;
}

export const taskApi = {
  async getComments(projectId: number, taskId: number): Promise<TaskComment[]> {
    const body = await request<Success<CommentsResponse>>(
      `/api/projects/${projectId}/tasks/${taskId}/comments`,
    );
    if (!Array.isArray(body.comments)) {
      throw new ApiRequestError('The server returned an invalid comments list.', 200);
    }
    return body.comments;
  },

  async addComment(projectId: number, taskId: number, input: CreateCommentRequest): Promise<TaskComment> {
    const body = await request<Success<CommentResponse>>(
      `/api/projects/${projectId}/tasks/${taskId}/comments`,
      { method: 'POST', body: JSON.stringify(input) },
    );
    if (!body.comment) {
      throw new ApiRequestError('The server returned an invalid comment.', 200);
    }
    return body.comment;
  },

  async getProjectMembers(projectId: number): Promise<ProjectMember[]> {
    const body = await request<Success<MembersResponse>>(
      `/api/projects/${projectId}/members`,
    );

    if (!Array.isArray(body.members)) {
      throw new ApiRequestError(
        'The server returned an invalid project members list.',
        200,
      );
    }

    return body.members;
  },

  // ดึงงานที่มอบหมายให้ผู้ใช้จาก session ปัจจุบัน
  async getMyTasks(query: TaskListQuery = {}): Promise<Task[]> {
    return fetchTaskList(
      `/api/tasks/mine${buildTaskQuery(query)}`,
      'The server returned an invalid My Tasks list.',
    );
  },

  // ดึงงานทั้งหมดใน Project ที่ผู้ใช้มีสิทธิ์เข้าถึง
  async getTasks(
    projectId: number,
    query: TaskListQuery = {},
  ): Promise<Task[]> {
    return fetchTaskList(
      `/api/projects/${projectId}/tasks${buildTaskQuery(query)}`,
      'The server returned an invalid tasks list.',
    );
  },

  async getTaskById(
    projectId: number,
    taskId: number,
  ): Promise<Task> {
    const body = await request<Success<TaskResponse>>(
      `/api/projects/${projectId}/tasks/${taskId}`,
    );

    if (!body.task) {
      throw new ApiRequestError(
        'The server returned an invalid task.',
        200,
      );
    }

    return body.task;
  },

  async createTask(
    projectId: number,
    input: CreateTaskRequest,
  ): Promise<Task> {
    const body = await request<Success<TaskResponse>>(
      `/api/projects/${projectId}/tasks`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );

    if (!body.task) {
      throw new ApiRequestError(
        'The server returned an invalid task.',
        200,
      );
    }

    return body.task;
  },

  async updateTask(
    projectId: number,
    taskId: number,
    input: UpdateTaskRequest,
  ): Promise<Task> {
    const body = await request<Success<TaskResponse>>(
      `/api/projects/${projectId}/tasks/${taskId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );

    if (!body.task) {
      throw new ApiRequestError(
        'The server returned an invalid task.',
        200,
      );
    }

    return body.task;
  },

  async deleteTask(
    projectId: number,
    taskId: number,
  ): Promise<string> {
    const body = await request<Success<MessageResponse>>(
      `/api/projects/${projectId}/tasks/${taskId}`,
      {
        method: 'DELETE',
      },
    );

    return body.message;
  },
};
