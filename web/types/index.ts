// User Contract
export interface User {
  userId: string;
  userName: string;
  email: string;
}

// Login Response Contract
export interface LoginResult {
  success: boolean;
  user?: User;
  error?: string;
  isNetworkError?: boolean;
}

// Data Contract (สำหรับ Tasks/Projects)
export interface TaskItem {
  id: string;               // ID สตริง/ยูไอดี
  title: string;
  description?: string;
  priority: number;         // Priority แบบตัวเลข (1 = High, 2 = Medium, 3 = Low)
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  dueDate: string;          // ฟอร์แมต YYYY-MM-DD
  assignedTo?: string;
}