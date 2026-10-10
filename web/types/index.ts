export interface User {
  userId: number;
  userName: string;
  email: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  isNetworkError?: boolean;
}

// Assignee Object Type ตาม Contract
export interface Assignee {
  userId: number;
  userName: string;
}

// Project Contract: projectName & projectDescription
export interface ProjectItem {
  projectId: number;
  projectName: string;
  projectDescription: string;
  completedTasks: number;
  totalTasks: number;
  dueDate: string;
}

// Task Contract: taskDescription & assignees เป็น Array Of Objects
export interface TaskItem {
  taskId: number;
  taskTitle: string;
  taskDescription?: string;
  priority: number;
  status: 'To do' | 'In progress' | 'Done';
  dueDate: string;
  assignees: Assignee[];
  projectName?: string;
  projectId?: number;
}