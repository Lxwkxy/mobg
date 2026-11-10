
'use client';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import AssigneeSelector from '@/components/tasks/AssigneeSelector';

import { ApiRequestError, projectApi } from '@/lib/projectApi';
import { parseRouteId, taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

import {
  mapTaskServerErrors,
  validateTaskForm,
  type TaskFormErrors,
} from '@/lib/taskForm';

import type {
  CreateTaskRequest,
  ProjectMember,
  TaskPriority,
} from '@/types';

type FormData = {
  project: Awaited<ReturnType<typeof projectApi.getProjectById>>;
  members: ProjectMember[];
};

function getPriorityLabel(priority: TaskPriority): string {
  switch (priority) {
    case 1:
      return 'High';
    case 2:
      return 'Medium';
    case 3:
      return 'Low';
  }
}

function CreateTaskContent({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();

  const load = useCallback(async (): Promise<FormData> => {
    const id = parseRouteId(projectId, 'project ID');

    const [project, members] = await Promise.all([
      projectApi.getProjectById(id),
      taskApi.getProjectMembers(id),
    ]);

    return { project, members };
  }, [projectId]);

  const {
    status,
    data,
    httpStatus,
    retry,
  } = useProtectedLoad(load);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSaving) return;

    const trimmedTitle = taskTitle.trim();

    const validationErrors = validateTaskForm({
      taskTitle,
      dueDate,
      assigneeIds,
    });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      const id = parseRouteId(projectId, 'project ID');

      const input: CreateTaskRequest = {
        taskTitle: trimmedTitle,
        taskDescription: taskDescription.trim() || null,
        priority,
        dueDate,
        assigneeIds,
      };

      const createdTask = await taskApi.createTask(id, input);

      router.push(
        `/projects/${id}/tasks/${createdTask.taskId}`,
      );
    } catch (error) {
      console.error('Failed to create task:', error);

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          router.replace('/login');
          return;
        }

        const serverErrors = mapTaskServerErrors(error.details);

        if (error.status === 403) {
          serverErrors.general =
            'You do not have permission to create a task in this project.';
        } else if (Object.keys(serverErrors).length > 0) {
          serverErrors.general =
            error.message || 'Please check the highlighted fields.';
        } else {
          serverErrors.general =
            error.message || 'Unable to create task. Please try again.';
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

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-5">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          {httpStatus === 400
            ? 'Invalid project ID.'
            : httpStatus === 404
              ? 'Project not found or you are not a member.'
              : 'Unable to load the task form. Please try again.'}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="min-h-11 rounded-lg border border-[#dddddd] px-4 text-[13px]"
          >
            Back to Projects
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

  if (status !== 'ready' || !data) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl min-w-0 [overflow-wrap:anywhere]">
      <Link
        href={`/projects/${projectId}/tasks`}
        className="mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black"
      >
        ← Back to Tasks
      </Link>

      <div className="mb-6">
        <p className="mb-1 text-[13px] text-[#777777]">
          {data.project.projectName}
        </p>

        <h1 className="text-[30px] font-extrabold text-[#1f1f1f]">
          Create Task
        </h1>

        <p className="mt-2 text-[13px] text-[#777777]">
          Add a new task to this project and assign it to your team members.
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
            placeholder="e.g. Design login page"
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

          <p className="mt-1.5 text-right text-[11px] text-[#999999]">
            {taskTitle.length}/200
          </p>
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

        {/* Priority and due date */}
        <div className="mb-6 grid gap-5 sm:grid-cols-2">
          <div>
            <label
              htmlFor="priority"
              className="mb-2 block text-[13px] font-semibold text-[#333333]"
            >
              Priority <span className="text-red-500">*</span>
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
              <option value={1}>{getPriorityLabel(1)}</option>
              <option value={2}>{getPriorityLabel(2)}</option>
              <option value={3}>{getPriorityLabel(3)}</option>
            </select>

            {errors.priority && (
              <p className="mt-1.5 text-[12px] text-red-600">
                {errors.priority}
              </p>
            )}
          </div>

          <div>
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
              className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none focus:border-[#555555] ${
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
        </div>

        {/* Assignees */}
        <AssigneeSelector
          members={data.members}
          selectedIds={assigneeIds}
          error={errors.assigneeIds}
          disabled={isSaving}
          onToggle={toggleAssignee}
        />

        {/* Actions */}
        <div className="flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-5">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => router.push(`/projects/${projectId}/tasks`)}
            className="min-h-11 rounded-xl border border-[#dddddd] px-5 text-[13px] font-medium text-[#444444] hover:bg-[#f7f7f7] disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSaving}
            className="min-h-11 rounded-xl bg-[#222222] px-6 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CreateTaskPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  return (
    <CreateTaskContent
      key={projectId}
      projectId={projectId}
    />
  );
}
