
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
  pagination: {
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const body = await response.json();

  if (!response.ok || body.success !== true) {
    const errorBody = body as ApiErrorBody;

    throw Object.assign(
      new Error(
        errorBody.error?.message ??
          `Request failed (HTTP ${response.status})`,
      ),
      {
        status: response.status,
        code: errorBody.error?.code,
        details: errorBody.error?.details,
      },
    );
  }

  return body as T;
}

export const projectApi = {
  async getProjects(): Promise<ProjectItem[]> {
    const body = await request<ProjectsResponse>('/api/projects');
    return body.projects;
  },

  async getUsers(): Promise<User[]> {
    const body = await request<UsersResponse>('/api/users');
    return body.users;
  },

  async createProject(input: CreateProjectInput): Promise<ProjectItem> {
    const body = await request<CreateProjectResponse>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    return body.project;
  },

  async getProjectById(projectId: number): Promise<ProjectItem> {
    return request<{ success: true; project: ProjectItem }>(
      `/api/projects/${projectId}`,
    ).then((body) => body.project);
  },
};
