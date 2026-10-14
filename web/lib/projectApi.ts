
import { API_BASE_URL } from '@/lib/auth-client';
import type { ProjectItem, User } from '@/types';

type ApiErrorBody = {
  success: false;
  error?: {
    code?: string;
    message?: string;
    details?: Array<{
      field?: string;
      message?: string;
    }>;
  };
};

type ProjectsResponse = {
  success: true;
  projects: ProjectItem[];
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
};

type UsersResponse = {
  success: true;
  users: User[];
};

type CreateProjectInput = {
  projectName: string;
  projectDescription: string | null;
  startDate: string;
  dueDate: string | null;
  memberIds: number[];
};

type CreateProjectResponse = {
  success: true;
  project: ProjectItem;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: Array<{ field?: string; message?: string }>;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: Array<{ field?: string; message?: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
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

  let body: unknown;

  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError(
      `Invalid server response (HTTP ${response.status})`,
      response.status,
    );
  }

  const data = body as {
    success?: boolean;
    error?: {
      code?: string;
      message?: string;
      details?: Array<{ field?: string; message?: string }>;
    };
  };

  if (!response.ok || data.success !== true) {
    throw new ApiRequestError(
      data.error?.message ??
        `Request failed (HTTP ${response.status})`,
      response.status,
      data.error?.code,
      data.error?.details,
    );
  }

  return body as T;
}

export const projectApi = {
  async getProjects(): Promise<ProjectItem[]> {
    const body = await request<ProjectsResponse>('/api/projects');

    // คืนค่า Array เสมอ เพื่อให้หน้าเว็บเรียก .map() ได้
    if (!Array.isArray(body.projects)) {
      throw new ApiRequestError(
        'The server returned an invalid projects list.',
        200,
      );
    }

    return body.projects;
  },

  async getUsers(): Promise<User[]> {
    const body = await request<UsersResponse>('/api/users');

    if (!Array.isArray(body.users)) {
      throw new ApiRequestError(
        'The server returned an invalid users list.',
        200,
      );
    }

    return body.users;
  },

  async createProject(
    input: CreateProjectInput,
  ): Promise<ProjectItem> {
    const body = await request<CreateProjectResponse>(
      '/api/projects',
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    );

    return body.project;
  },

  async getProjectById(
    projectId: number,
  ): Promise<ProjectItem> {
    const body = await request<{ success: true; project: ProjectItem }>(
      `/api/projects/${projectId}`,
    );

    return body.project;
  },
};
