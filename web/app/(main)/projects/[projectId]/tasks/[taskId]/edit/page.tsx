'use client';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import { ApiRequestError } from '@/lib/projectApi';
import { parseRouteId, taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

import type {
  Task,
  TaskPriority,
  TaskStatus,
  ProjectMember,
  UpdateTaskRequest,
} from '@/types';

type EditTaskData = {
  task: Task;
  members: ProjectMember[];
};

type FormErrors = {
  taskTitle?: string;
  taskDescription?: string;
  priority?: string;
  dueDate?: string;
  status?: string;
  assigneeIds?: string;
  general?: string;
};

const statusOptions: TaskStatus[] = [
  'To do',
  'In progress',
  'Done',
];

function mapServerField(field: string): keyof FormErrors | null {
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

function EditTaskContent({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const router = useRouter();

  const load = useCallback(async (): Promise<EditTaskData> => {
    const parsedProjectId = parseRouteId(projectId, 'project ID');
    const parsedTaskId = parseRouteId(taskId, 'task ID');

    const [task, members] = await Promise.all([
      taskApi.getTaskById(parsedProjectId, parsedTaskId),
      taskApi.getProjectMembers(parsedProjectId),
    ]);

    return { task, members };
  }, [projectId, taskId]);

  const {
    status: loadStatus,
    data,
    httpStatus,
    retry,
  } = useProtectedLoad(load);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [dueDate, setDueDate] = useState('');
  const [taskStatus, setTaskStatus] = useState<TaskStatus>('To do');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  const [initialized, setInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Fill the form once after the original task has loaded.
  if (data && !initialized) {
    setTaskTitle(data.task.taskTitle);
    setTaskDescription(data.task.taskDescription ?? '');
    setPriority(data.task.priority);
    setDueDate(data.task.dueDate);
    setTaskStatus(data.task.status);
    setAssigneeIds(data.task.assignees.map((assignee) => assignee.userId));
    setInitialized(true);
  }

  function clearError(field: keyof FormErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.general;
      return next;
    });
  }

  function toggleAssignee(userId: number) {
    setAssigneeIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );

    clearError('assigneeIds');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving || !data) return;

    const nextErrors: FormErrors = {};
    const trimmedTitle = taskTitle.trim();
    const trimmedDescription = taskDescription.trim();

    if (!trimmedTitle) {
      nextErrors.taskTitle = 'Please enter a task title.';
    } else if (trimmedTitle.length > 200) {
      nextErrors.taskTitle = 'Task title must not exceed 200 characters.';
    }

    if (!dueDate) {
      nextErrors.dueDate = 'Please select a due date.';
    }

    if (assigneeIds.length === 0) {
      nextErrors.assigneeIds = 'Please select at least one assignee.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    const original = data.task;
    const originalAssigneeIds = original.assignees
      .map((assignee) => assignee.userId)
      .sort((a, b) => a - b);

    const updatedAssigneeIds = [...assigneeIds].sort((a, b) => a - b);

    const input: UpdateTaskRequest = {};

    // Send only fields that have changed.
    if (trimmedTitle !== original.taskTitle) {
      input.taskTitle = trimmedTitle;
    }

    const originalDescription = original.taskDescription ?? '';
    if (trimmedDescription !== originalDescription) {
      input.taskDescription = trimmedDescription || null;
    }

    if (priority !== original.priority) {
      input.priority = priority;
    }

    if (dueDate !== original.dueDate) {
      input.dueDate = dueDate;
    }

    if (taskStatus !== original.status) {
      input.status = taskStatus;
    }

    const assigneesChanged =
      originalAssigneeIds.length !== updatedAssigneeIds.length ||
      originalAssigneeIds.some(
        (id, index) => id !== updatedAssigneeIds[index],
      );

    if (assigneesChanged) {
      input.assigneeIds = updatedAssigneeIds;
    }

    if (Object.keys(input).length === 0) {
      setErrors({ general: 'No changes to save.' });
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      const parsedProjectId = parseRouteId(projectId, 'project ID');
      const parsedTaskId = parseRouteId(taskId, 'task ID');

      await taskApi.updateTask(
        parsedProjectId,
        parsedTaskId,
        input,
      );

      router.push(
        `/projects/${parsedProjectId}/tasks/${parsedTaskId}`,
      );
      router.refresh();
    } catch (error) {
      console.error('Failed to update task:', error);

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          router.replace('/login');
          return;
        }

        const serverErrors: FormErrors = {};

        for (const detail of error.details ?? []) {
          if (!detail.field || !detail.message) continue;

          const field = mapServerField(detail.field);

          if (field) {
            serverErrors[field] = detail.message;
          }
        }

        if (error.status === 403) {
          serverErrors.general =
            'You do not have permission to edit this task.';
        } else if (Object.keys(serverErrors).length > 0) {
          serverErrors.general =
            error.message || 'Please check the highlighted fields.';
        } else {
          serverErrors.general =
            error.message || 'Unable to update task. Please try again.';
        }

        setErrors(serverErrors);
      } else {
        setErrors({
          general: 'An unexpected error occurred. Please try again.',
        });
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (loadStatus === 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-5">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          {httpStatus === 400
            ? 'Invalid project or task ID.'
            : httpStatus === 404
              ? 'Task not found in this project.'
              : 'Unable to load task information. Please try again.'}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(`/projects/${projectId}/tasks`)
            }
            className="min-h-11 rounded-lg border border-[#dddddd] px-4 text-[13px]"
          >
            Back to Tasks
          </button>

          {httpStatus !== 400 && httpStatus !== 404 && (
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-lg bg-[#222222] px-4 text-[13px] text-white"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (loadStatus !== 'ready' || !data || !initialized) {
    return (
      <ProtectedState
        status={loadStatus === 'ready' ? 'loading' : loadStatus}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 [overflow-wrap:anywhere]">
      <Link
        href={`/projects/${projectId}/tasks/${taskId}`}
        className="mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black"
      >
        ← Back to Task Detail
      </Link>

      <div className="mb-6">
        <p className="mb-1 text-[13px] text-[#777777]">
          {data.task.projectName}
        </p>

        <h1 className="text-[30px] font-extrabold text-[#1f1f1f]">
          Edit Task
        </h1>

        <p className="mt-2 text-[13px] text-[#777777]">
          Update task information, status, priority, and assignees.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-2xl border border-[#e0e0e0] bg-white p-4 shadow-sm sm:p-6 md:p-8"
      >
        {errors.general && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-300 bg-red-50 p-3.5 text-[13px] text-red-700"
          >
            {errors.general}
          </div>
        )}

        {/* Task title */}
        <div className="mb-5">
          <label
            htmlFor="taskTitle"
            className="mb-2 block text-[13px] font-semibold text-[#333333]"
          >
            Task title <span className="text-red-500">*</span>
          </label>

          <input
            id="taskTitle"
            type="text"
            maxLength={200}
            value={taskTitle}
            onChange={(event) => {
              setTaskTitle(event.target.value);
              clearError('taskTitle');
            }}
            className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none focus:border-[#555555] ${
              errors.taskTitle ? 'border-red-500' : 'border-[#dcdcdc]'
            }`}
            aria-invalid={Boolean(errors.taskTitle)}
          />

          {errors.taskTitle && (
            <p className="mt-1.5 text-[12px] text-red-600">
              {errors.taskTitle}
            </p>
          )}
        </div>

        {/* Description */}
        <div className="mb-5">
          <label
            htmlFor="taskDescription"
            className="mb-2 block text-[13px] font-semibold text-[#333333]"
          >
            Description
          </label>

          <textarea
            id="taskDescription"
            rows={4}
            value={taskDescription}
            onChange={(event) => {
              setTaskDescription(event.target.value);
              clearError('taskDescription');
            }}
            placeholder="Describe what needs to be done..."
            className="w-full resize-y rounded-xl border border-[#dcdcdc] px-4 py-3 text-[13px] outline-none focus:border-[#555555]"
          />
        </div>

        {/* Status and priority */}
        <div className="mb-5 grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="taskStatus"
              className="mb-2 block text-[13px] font-semibold text-[#333333]"
            >
              Status
            </label>

            <select
              id="taskStatus"
              value={taskStatus}
              onChange={(event) => {
                setTaskStatus(event.target.value as TaskStatus);
                clearError('status');
              }}
              className="w-full rounded-xl border border-[#dcdcdc] bg-white px-4 py-3 text-[13px] outline-none focus:border-[#555555]"
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            {errors.status && (
              <p className="mt-1.5 text-[12px] text-red-600">
                {errors.status}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="priority"
              className="mb-2 block text-[13px] font-semibold text-[#333333]"
            >
              Priority
            </label>

            <select
              id="priority"
              value={priority}
              onChange={(event) => {
                setPriority(Number(event.target.value) as TaskPriority);
                clearError('priority');
              }}
              className="w-full rounded-xl border border-[#dcdcdc] bg-white px-4 py-3 text-[13px] outline-none focus:border-[#555555]"
            >
              <option value={1}>High</option>
              <option value={2}>Medium</option>
              <option value={3}>Low</option>
            </select>

            {errors.priority && (
              <p className="mt-1.5 text-[12px] text-red-600">
                {errors.priority}
              </p>
            )}
          </div>
        </div>

        {/* Due date */}
        <div className="mb-6">
          <label
            htmlFor="dueDate"
            className="mb-2 block text-[13px] font-semibold text-[#333333]"
          >
            Due date <span className="text-red-500">*</span>
          </label>

          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => {
              setDueDate(event.target.value);
              clearError('dueDate');
            }}
            className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none focus:border-[#555555] sm:max-w-sm ${
              errors.dueDate ? 'border-red-500' : 'border-[#dcdcdc]'
            }`}
            aria-invalid={Boolean(errors.dueDate)}
          />

          {errors.dueDate && (
            <p className="mt-1.5 text-[12px] text-red-600">
              {errors.dueDate}
            </p>
          )}
        </div>

        {/* Assignees */}
        <div className="mb-8">
          <div className="mb-2">
            <p className="text-[13px] font-semibold text-[#333333]">
              Assign to <span className="text-red-500">*</span>
            </p>

            <p className="mt-1 text-[12px] text-[#777777]">
              Select one or more members of this project.
            </p>
          </div>

          <div className="rounded-xl border border-[#e0e0e0] p-3">
            {data.members.length === 0 ? (
              <p className="p-2 text-[12px] text-[#777777]">
                No project members are available.
              </p>
            ) : (
              <div className="max-h-64 space-y-1 overflow-y-auto">
                {data.members.map((member) => {
                  const checked = assigneeIds.includes(member.userId);

                  return (
                    <label
                      key={member.userId}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-[#f7f7f7]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAssignee(member.userId)}
                        className="h-4 w-4 accent-[#222222]"
                      />

                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eeeeee] text-[11px] font-semibold text-[#555555]">
                        {member.userName
                          .split(' ')
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')
                          .toUpperCase()}
                      </span>

                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium text-[#333333]">
                          {member.userName}
                        </span>
                        <span className="block text-[11px] text-[#888888]">
                          {member.email}
                        </span>
                      </span>

                      <span className="ml-auto text-[10px] text-[#999999]">
                        {member.role}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[11px] text-[#777777]">
              {assigneeIds.length} member(s) selected
            </p>

            {errors.assigneeIds && (
              <p role="alert" className="text-right text-[12px] text-red-600">
                {errors.assigneeIds}
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-5">
          <button
            type="button"
            disabled={isSaving}
            onClick={() =>
              router.push(`/projects/${projectId}/tasks/${taskId}`)
            }
            className="min-h-11 rounded-xl border border-[#dddddd] px-5 text-[13px] font-medium text-[#444444] hover:bg-[#f7f7f7] disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="min-h-11 rounded-xl bg-[#222222] px-6 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EditTaskPage() {
  const params = useParams<{
    projectId: string;
    taskId: string;
  }>();

  const projectId = params.projectId;
  const taskId = params.taskId;

  return (
    <EditTaskContent
      key={`${projectId}-${taskId}`}
      projectId={projectId}
      taskId={taskId}
    />
  );
}