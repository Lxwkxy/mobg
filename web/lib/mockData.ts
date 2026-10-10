import { TaskItem } from '@/types';

// Mock Data ตรงตาม API Contract (ID, Priority ตัวเลข, วันที่ YYYY-MM-DD)
export const MOCK_TASKS: TaskItem[] = [
  {
    id: 'tsk_001',
    title: 'Migrate Frontend to Next.js',
    description: 'Convert legacy static HTML/CSS/JS to App Router',
    priority: 1, // 1 = High
    status: 'IN_PROGRESS',
    dueDate: '2026-10-15',
    assignedTo: 'Chinatip',
  },
  {
    id: 'tsk_002',
    title: 'Implement Authentication API',
    description: 'Connect login form with backend authentication service',
    priority: 2, // 2 = Medium
    status: 'TODO',
    dueDate: '2026-10-20',
    assignedTo: 'Dev Team',
  },
  {
    id: 'tsk_003',
    title: 'Design Base UI Components',
    description: 'Build reusable Button, Input, Card, and Badges',
    priority: 3, // 3 = Low
    status: 'DONE',
    dueDate: '2026-10-10',
    assignedTo: 'Chinatip',
  },
];

// Data Service แยกส่วนอ่านข้อมูลจาก UI
export const taskService = {
  getTasks: async (): Promise<TaskItem[]> => {
    // จำลองการดึงข้อมูลจาก API
    await new Promise((resolve) => setTimeout(resolve, 300));
    return MOCK_TASKS;
  },

  getTaskById: async (id: string): Promise<TaskItem | undefined> => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return MOCK_TASKS.find((task) => task.id === id);
  },
};