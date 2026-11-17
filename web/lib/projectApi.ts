
import { API_BASE_URL } from '@/lib/auth-client';
import type {
  AddMemberRequest,
  ApiFailure,
  CreateProjectRequest,
  ErrorDetail,
  MemberResponse,
  MembersResponse,
  MessageResponse,
  ProjectItem,
  ProjectListQuery,
  ProjectMember,
  ProjectResponse,
  ProjectsResponse,
  UpdateProjectRequest,
  UserProfile,
  UsersResponse,
} from '@/types';

type Success<T> = Extract<T, { success: true }>;
type ApiErrorBody = ApiFailure['error'];

export type ProjectListResult = Pick<
  Success<ProjectsResponse>,
  'projects' | 'pagination'
>;

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: ApiErrorBody['code'],
    public readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export async function request<T extends { success: true }>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: 'include',
      cache: 'no-store',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(
      'Unable to connect to the server. Please try again.',
      0,
    );
  }

  let body: T | ApiFailure;

  try {
    body = (await response.json()) as T | ApiFailure;
  } catch {
    throw new ApiRequestError(
      `Invalid server response (HTTP ${response.status})`,
      response.status,
    );
  }

  if (!response.ok || body.success !== true) {
    const error = (body as ApiFailure).error;

    throw new ApiRequestError(
      error?.message ?? `Request failed (HTTP ${response.status})`,
      response.status,
      error?.code,
      error?.details,
    );
  }

  return body as T;
}

export const projectApi = {
  async getProjects(
    query: ProjectListQuery = {},
  ): Promise<ProjectListResult> {
    const params = new URLSearchParams();

    if (query.status) params.set('status', query.status);
    if (query.page) params.set('page', String(query.page));
    if (query.pageSize) params.set('pageSize', String(query.pageSize));

    const qs = params.toString();

    const body = await request<Success<ProjectsResponse>>(
      `/api/projects${qs ? `?${qs}` : ''}`,
    );

    if (!Array.isArray(body.projects)) {
      throw new ApiRequestError(
        'The server returned an invalid projects list.',
        200,
      );
    }

    return {
      projects: body.projects,
      pagination: body.pagination,
    };
  },

  async getUsers(): Promise<UserProfile[]> {
    const body = await request<Success<UsersResponse>>('/api/users');

    if (!Array.isArray(body.users)) {
      throw new ApiRequestError(
        'The server returned an invalid users list.',
        200,
      );
    }

    return body.users;
  },

  async createProject(
    input: CreateProjectRequest,
  ): Promise<ProjectItem> {
    const body = await request<Success<ProjectResponse>>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return body.project;
  },

  async getProjectById(projectId: number): Promise<ProjectItem> {
    const body = await request<Success<ProjectResponse>>(
      `/api/projects/${projectId}`,
    );

    return body.project;
  },

  async updateProject(
    projectId: number,
    input: UpdateProjectRequest,
  ): Promise<ProjectItem> {
    const body = await request<Success<ProjectResponse>>(
      `/api/projects/${projectId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    );

    return body.project;
  },

  async deleteProject(projectId: number): Promise<string> {
    const body = await request<Success<MessageResponse>>(
      `/api/projects/${projectId}`,
      {
        method: 'DELETE',
      },
    );

    return body.message;
  },

  // Get all members in a project.
  async getProjectMembers(
    projectId: number,
  ): Promise<ProjectMember[]> {
    const body = await request<Success<MembersResponse>>(
      `/api/projects/${projectId}/members`,
    );

    if (!Array.isArray(body.members)) {
      throw new ApiRequestError(
        'The server returned an invalid members list.',
        200,
      );
    }

    return body.members;
  },

  // Add a user to a project.
  async addProjectMember(
    projectId: number,
    input: AddMemberRequest,
  ): Promise<ProjectMember> {
    const body = await request<Success<MemberResponse>>(
      `/api/projects/${projectId}/members`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );

    return body.member;
  },

  // Remove a member from a project.
  async removeProjectMember(
    projectId: number,
    userId: number,
  ): Promise<string> {
    const body = await request<Success<MessageResponse>>(
      `/api/projects/${projectId}/members/${userId}`,
      {
        method: 'DELETE',
      },
    );

    return body.message;
  },
};
