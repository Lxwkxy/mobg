export interface User {
  userId: number;       // ID ตัวเลข (1, 2)
  userName: string;     // userName
  email: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  isNetworkError?: boolean;
}

export interface ProjectItem {
  projectId: number;    // ID ตัวเลข
  projectTitle: string;
  description: string;
  completedTasks: number;
  totalTasks: number;
  dueDate: string;
}

export interface TaskItem {
  taskId: number;       // taskId ตัวเลข
  taskTitle: string;    // taskTitle
  description?: string;
  priority: number;     // 1, 2, 3
  status: 'To do' | 'In progress' | 'Done'; // Status ตาม Contract
  dueDate: string;      // YYYY-MM-DD
  assignees: string;    // assignees
  projectName?: string;
}