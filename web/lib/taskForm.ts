import type { ProjectMember } from '@/types';

export type TaskFormErrors = {
  taskTitle?: string;
  taskDescription?: string;
  priority?: string;
  dueDate?: string;
  status?: string;
  assigneeIds?: string;
  general?: string;
};

export type TaskFormValues = {
  taskTitle: string;
  dueDate: string;
  assigneeIds: number[];
};

export function validateTaskForm(
  values: TaskFormValues,
): TaskFormErrors {
  const errors: TaskFormErrors = {};
  const title = values.taskTitle.trim();

  if (!title) {
    errors.taskTitle = 'Please enter a task title.';
  } else if (title.length > 200) {
    errors.taskTitle = 'Task title must not exceed 200 characters.';
  }

  if (!values.dueDate) {
    errors.dueDate = 'Please select a due date.';
  }

  if (values.assigneeIds.length === 0) {
    errors.assigneeIds = 'Please select at least one assignee.';
  }

  return errors;
}

export function mapTaskServerField(
  field: string,
): keyof TaskFormErrors | null {
  const normalized = field
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  switch (normalized) {
    case 'tasktitle':
    case 'title':
      return 'taskTitle';

    case 'taskdescription':
    case 'description':
      return 'taskDescription';

    case 'priority':
      return 'priority';

    case 'duedate':
      return 'dueDate';

    case 'status':
      return 'status';

    case 'assigneeids':
    case 'assignees':
      return 'assigneeIds';

    default:
      return null;
  }
}

export function mapTaskServerErrors(
  details: Array<{ field?: string; message?: string }> | undefined,
): TaskFormErrors {
  const errors: TaskFormErrors = {};

  for (const detail of details ?? []) {
    if (!detail.field || !detail.message) continue;

    const field = mapTaskServerField(detail.field);

    if (field) {
      errors[field] = detail.message;
    }
  }

  return errors;
}

export function normalizeAssigneeIds(ids: number[]): number[] {
  return [...new Set(ids)].sort((a, b) => a - b);
}

export function getAssigneeInitials(member: ProjectMember): string {
  return member.userName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}