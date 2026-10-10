import { TaskItem, ProjectItem } from '@/types';

export const MOCK_PROJECTS: ProjectItem[] = [
  { projectId: 1, projectTitle: 'Web Programming 1', description: 'this is description', completedTasks: 3, totalTasks: 10, dueDate: '2026-11-24' },
  { projectId: 2, projectTitle: 'OS Project', description: 'this is description', completedTasks: 3, totalTasks: 10, dueDate: '2026-11-24' },
  { projectId: 3, projectTitle: 'OOP Project', description: 'this is description', completedTasks: 3, totalTasks: 10, dueDate: '2026-11-24' },
  { projectId: 4, projectTitle: 'GEN Project', description: 'this is description', completedTasks: 3, totalTasks: 10, dueDate: '2026-11-24' },
];

export const MOCK_TASKS: TaskItem[] = [
  { taskId: 1, taskTitle: 'Wireframe', description: 'Design UI Wireframe', priority: 1, status: 'In progress', dueDate: '2026-09-27', assignees: 'Chinatip', projectName: 'Web Programming' },
  { taskId: 2, taskTitle: 'Setup Next.js Project', description: 'Initialize App Router', priority: 1, status: 'In progress', dueDate: '2026-09-27', assignees: 'Chinatip', projectName: 'Web Programming' },
  { taskId: 3, taskTitle: 'Authentication API', description: 'Implement mock login service', priority: 2, status: 'To do', dueDate: '2026-09-27', assignees: 'Dev Team', projectName: 'OS Project' },
  { taskId: 4, taskTitle: 'Base UI Components', description: 'Create reusable components', priority: 3, status: 'Done', dueDate: '2026-09-27', assignees: 'Chinatip', projectName: 'OOP Project' },
];

export const projectService = {
  getProjects: async (): Promise<ProjectItem[]> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return MOCK_PROJECTS;
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