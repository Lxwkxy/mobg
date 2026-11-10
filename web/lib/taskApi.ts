import { ApiRequestError, request } from '@/lib/projectApi';
import type {
  CreateTaskRequest,
  MembersResponse,
  MessageResponse,
  ProjectMember,
  Task,
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

type Success<T> = Extract<T, { success: true }>;

export const taskApi = {
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

  async getTasks(
    projectId: number,
    query: TaskListQuery = {},
  ): Promise<Task[]> {
    const params = new URLSearchParams();

    if (query.status) {
      params.set('status', query.status);
    }

    const qs = params.toString();

    const body = await request<Success<TasksResponse>>(
      `/api/projects/${projectId}/tasks${qs ? `?${qs}` : ''}`,
    );

    if (!Array.isArray(body.tasks)) {
      throw new ApiRequestError(
        'The server returned an invalid tasks list.',
        200,
      );
    }

    return body.tasks;
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