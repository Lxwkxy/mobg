
'use client';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import AssigneeSelector from '@/components/tasks/AssigneeSelector';

import { ApiRequestError } from '@/lib/projectApi';
import { parseRouteId, taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

import {
  mapTaskServerErrors,
  normalizeAssigneeIds,
  validateTaskForm,
  type TaskFormErrors,
} from '@/lib/taskForm';

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

const statusOptions: TaskStatus[] = [
  'To do',
  'In progress',
  'Done',
];

function EditTaskContent({
  projectId,
  taskId,
  data,
}: {
  projectId: string;
  taskId: string;
  data: EditTaskData;
}) {
  const router = useRouter();

  // Snapshot of the task when this editing session starts.
  const baseline = data.task;

  const [taskTitle, setTaskTitle] = useState(baseline.taskTitle);
  const [taskDescription, setTaskDescription] = useState(
    baseline.taskDescription ?? '',
  );
  const [priority, setPriority] = useState<TaskPriority>(
    baseline.priority,
  );
  const [dueDate, setDueDate] = useState(baseline.dueDate);
  const [taskStatus, setTaskStatus] = useState<TaskStatus>(
    baseline.status,
  );
  const [assigneeIds, setAssigneeIds] = useState<number[]>(
    baseline.assignees.map((assignee) => assignee.userId),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<TaskFormErrors>({});

  function clearError(field: keyof TaskFormErrors) {
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

  function handleCancel() {
    if (isSaving) return;

    // Discard all unsaved changes and restore the original values.
    setTaskTitle(baseline.taskTitle);
    setTaskDescription(baseline.taskDescription ?? '');
    setPriority(baseline.priority);
    setDueDate(baseline.dueDate);
    setTaskStatus(baseline.status);
    setAssigneeIds(
      normalizeAssigneeIds(
        baseline.assignees.map((assignee) => assignee.userId),
      ),
    );
    setErrors({});

    // Navigate back without a full page reload.
    router.push(`/projects/${projectId}/tasks/${taskId}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    const trimmedTitle = taskTitle.trim();
    const trimmedDescription = taskDescription.trim();

    const validationErrors = validateTaskForm({
      taskTitle,
      dueDate,
      assigneeIds,
    });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    const originalAssigneeIds = normalizeAssigneeIds(
      baseline.assignees.map((assignee) => assignee.userId),
    );

    const updatedAssigneeIds = normalizeAssigneeIds(assigneeIds);

    const input: UpdateTaskRequest = {};

    // Only send fields that changed during this editing session.
    if (trimmedTitle !== baseline.taskTitle) {
      input.taskTitle = trimmedTitle;
    }

    if (trimmedDescription !== (baseline.taskDescription ?? '')) {
      input.taskDescription = trimmedDescription || null;
    }

    if (priority !== baseline.priority) {
      input.priority = priority;
    }

    if (dueDate !== baseline.dueDate) {
      input.dueDate = dueDate;
    }

    if (taskStatus !== baseline.status) {
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

        const serverErrors = mapTaskServerErrors(error.details);

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

        <AssigneeSelector
          members={data.members}
          selectedIds={assigneeIds}
          error={errors.assigneeIds}
          disabled={isSaving}
          onToggle={toggleAssignee}
        />

        <div className="flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-5">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleCancel}
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

  const router = useRouter();
  const projectId = params.projectId;
  const taskId = params.taskId;

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
            onClick={() => router.push(`/projects/${projectId}/tasks`)}
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

  if (loadStatus !== 'ready' || !data) {
    return (
      <ProtectedState
        status={loadStatus === 'ready' ? 'loading' : loadStatus}
        onRetry={retry}
      />
    );
  }

  return (
    <EditTaskContent
      key={`${projectId}-${taskId}`}
      projectId={projectId}
      taskId={taskId}
      data={data}
    />
  );
}
