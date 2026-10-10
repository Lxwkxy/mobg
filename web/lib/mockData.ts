import { TaskItem, ProjectItem } from '@/types';

export const MOCK_PROJECTS: ProjectItem[] = [
  {
    projectId: 1,
    projectName: 'Web Programming 1',
    projectDescription: 'this is description',
    completedTasks: 3,
    totalTasks: 10,
    dueDate: '2026-11-24',
  },
  {
    projectId: 2,
    projectName: 'OS Project',
    projectDescription: 'this is description',
    completedTasks: 3,
    totalTasks: 10,
    dueDate: '2026-11-24',
  },
  {
    projectId: 3,
    projectName: 'OOP Project',
    projectDescription: 'this is description',
    completedTasks: 3,
    totalTasks: 10,
    dueDate: '2026-11-24',
  },
  {
    projectId: 4,
    projectName: 'GEN Project',
    projectDescription: 'this is description',
    completedTasks: 3,
    totalTasks: 10,
    dueDate: '2026-11-24',
  },
];

export const MOCK_TASKS: TaskItem[] = [
  {
    taskId: 1,
    taskTitle: 'Wireframe',
    taskDescription: 'Design UI Wireframe',
    priority: 1,
    status: 'In progress',
    dueDate: '2026-09-27',
    assignees: [{ userId: 1, userName: 'Chinatip' }],
    projectName: 'Web Programming',
    projectId: 1,
  },
  {
    taskId: 2,
    taskTitle: 'Setup Next.js Project',
    taskDescription: 'Initialize App Router',
    priority: 1,
    status: 'In progress',
    dueDate: '2026-09-27',
    assignees: [{ userId: 1, userName: 'Chinatip' }],
    projectName: 'Web Programming',
    projectId: 1,
  },
  {
    taskId: 3,
    taskTitle: 'Authentication API',
    taskDescription: 'Implement mock login service',
    priority: 2,
    status: 'To do',
    dueDate: '2026-09-27',
    assignees: [{ userId: 2, userName: 'Dev Team' }],
    projectName: 'OS Project',
    projectId: 2,
  },
  {
    taskId: 4,
    taskTitle: 'Base UI Components',
    taskDescription: 'Create reusable components',
    priority: 3,
    status: 'Done',
    dueDate: '2026-09-27',
    assignees: [{ userId: 1, userName: 'Chinatip' }],
    projectName: 'OOP Project',
    projectId: 3,
  },
];

export const projectService = {
  getProjects: async (): Promise<ProjectItem[]> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return MOCK_PROJECTS;
  },
  getProjectById: async (projectId: number): Promise<ProjectItem | undefined> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return MOCK_PROJECTS.find((p) => p.projectId === projectId);
  },
};

export const taskService = {
  getTasks: async (): Promise<TaskItem[]> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return MOCK_TASKS;
  },
  getTaskById: async (taskId: number): Promise<TaskItem | undefined> => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return MOCK_TASKS.find((t) => t.taskId === taskId);
  },
};