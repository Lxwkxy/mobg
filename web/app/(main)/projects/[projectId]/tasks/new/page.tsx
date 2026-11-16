
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
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

type TaskDraft = {
  taskTitle: string;
  taskDescription: string;
  priority: TaskPriority;
  dueDate: string;
  assigneeIds: number[];
};

const DRAFT_STORAGE_PREFIX = 'mobg:create-task-draft:';

function getDraftStorageKey(
  userId: number,
  projectId: string,
): string {
  return (
    `${DRAFT_STORAGE_PREFIX}` +
    `${encodeURIComponent(String(userId))}:` +
    `${encodeURIComponent(projectId)}`
  );
}

function clearUserDrafts(userId: number) {
  try {
    const userPrefix =
      `${DRAFT_STORAGE_PREFIX}${encodeURIComponent(String(userId))}:`;

    const keysToRemove: string[] = [];

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);

      if (key?.startsWith(userPrefix)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((key) => {
      localStorage.removeItem(key);
    });
  } catch (error) {
    console.error('Failed to clear previous user drafts:', error);
  }
}

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

function CreateTaskForm({
  projectId,
  userId,
  data,
  isRefreshing,
  isSaving,
  setIsSaving,
  onRetry,
}: {
  projectId: string;
  userId: number;
  data: FormData;
  isRefreshing: boolean;
  isSaving: boolean;
  setIsSaving: (value: boolean) => void;
  onRetry: () => void;
}) {
  const router = useRouter();

  const draftKey = getDraftStorageKey(userId, projectId);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  const [isDraftReady, setIsDraftReady] = useState(false);
  const [errors, setErrors] = useState<TaskFormErrors>({});

  // Only allow members who currently belong to this project.
  const currentMemberIds = useMemo(
    () => new Set(data.members.map((member) => member.userId)),
    [data.members],
  );

  const validAssigneeIds = useMemo(
    () => assigneeIds.filter((id) => currentMemberIds.has(id)),
    [assigneeIds, currentMemberIds],
  );

  // Load Draft belonging to this exact user and project.
  // Also remove assignees who are no longer project members.
  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      try {
        const savedDraft = localStorage.getItem(draftKey);

        if (savedDraft) {
          const draft = JSON.parse(savedDraft) as Partial<TaskDraft>;

          setTaskTitle(
            typeof draft.taskTitle === 'string'
              ? draft.taskTitle
              : '',
          );

          setTaskDescription(
            typeof draft.taskDescription === 'string'
              ? draft.taskDescription
              : '',
          );

          setPriority(
            draft.priority === 1 ||
            draft.priority === 2 ||
            draft.priority === 3
              ? draft.priority
              : 2,
          );

          setDueDate(
            typeof draft.dueDate === 'string'
              ? draft.dueDate
              : '',
          );

          setAssigneeIds(
            Array.isArray(draft.assigneeIds)
              ? draft.assigneeIds.filter(
                  (id): id is number =>
                    typeof id === 'number' &&
                    Number.isFinite(id) &&
                    currentMemberIds.has(id),
                )
              : [],
          );
        }
      } catch (error) {
        console.error('Failed to restore task draft:', error);

        try {
          localStorage.removeItem(draftKey);
        } catch (storageError) {
          console.error(
            'Failed to remove invalid task draft:',
            storageError,
          );
        }
      } finally {
        setIsDraftReady(true);
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [draftKey, currentMemberIds]);

  // Persist Draft after it has been restored.
  // Always save only currently valid project members.
  useEffect(() => {
    if (!isDraftReady) return;

    const draft: TaskDraft = {
      taskTitle,
      taskDescription,
      priority,
      dueDate,
      assigneeIds: validAssigneeIds,
    };

    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save task draft:', error);
    }
  }, [
    draftKey,
    isDraftReady,
    taskTitle,
    taskDescription,
    priority,
    dueDate,
    validAssigneeIds,
  ]);

  function clearError(field: keyof TaskFormErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.general;
      return next;
    });
  }

  function toggleAssignee(assigneeUserId: number) {
    if (!currentMemberIds.has(assigneeUserId)) return;

    setAssigneeIds((current) =>
      current.includes(assigneeUserId)
        ? current.filter((id) => id !== assigneeUserId)
        : [...current, assigneeUserId],
    );

    clearError('assigneeIds');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Prevent duplicate POST requests while the first request is pending.
    if (isSaving || isRefreshing || !isDraftReady) return;

    const trimmedTitle = taskTitle.trim();

    const validationErrors = validateTaskForm({
      taskTitle,
      dueDate,
      assigneeIds: validAssigneeIds,
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
        assigneeIds: validAssigneeIds,
      };

      const createdTask = await taskApi.createTask(id, input);

      // Draft cleanup must not prevent navigation after successful creation.
      try {
        localStorage.removeItem(draftKey);
      } catch (storageError) {
        console.error(
          'Task created successfully, but failed to remove its Draft:',
          storageError,
        );
      }

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

  if (!isDraftReady) {
    return (
      <ProtectedState
        status="loading"
        onRetry={onRetry}
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
          selectedIds={validAssigneeIds}
          error={errors.assigneeIds}
          disabled={isSaving || isRefreshing}
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
            disabled={isSaving || isRefreshing || !isDraftReady}
            className="min-h-11 rounded-xl bg-[#222222] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? 'Creating...' : 'Create Task'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateTaskContent({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();

  // Keep the submission state here so it survives CreateTaskForm remounts.
  const [isSaving, setIsSaving] = useState(false);

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
    userId,
    httpStatus,
    isRefreshing,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: true,
  });

  // userId in MobG is a number.
  const lastAuthenticatedUserId = useRef<number | null>(null);

  useEffect(() => {
    if (userId === null || userId === undefined) return;

    const previousUserId = lastAuthenticatedUserId.current;

    if (
      previousUserId !== null &&
      previousUserId !== userId
    ) {
      clearUserDrafts(previousUserId);
    }

    lastAuthenticatedUserId.current = userId;
  }, [userId]);

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

  if (
    status !== 'ready' ||
    !data ||
    userId === null ||
    userId === undefined
  ) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  return (
    <CreateTaskForm
      key={`${userId}:${projectId}`}
      projectId={projectId}
      userId={userId}
      data={data}
      isRefreshing={isRefreshing}
      isSaving={isSaving}
      setIsSaving={setIsSaving}
      onRetry={retry}
    />
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
