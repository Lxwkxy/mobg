'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import AssigneeSelector from '@/components/tasks/AssigneeSelector';

import { getCurrentUser } from '@/lib/authService';
import { useSession } from '@/lib/SessionProvider';
import { ApiRequestError, projectApi } from '@/lib/projectApi';
import {
  parseRouteId,
  taskApi,
  tryParseRouteId,
} from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

import {
  mapTaskServerErrors,
  validateTaskForm,
  type TaskFormErrors,
} from '@/lib/taskForm';

import type {
  Project,
  ProjectMember,
  Task,
  TaskPriority,
  TaskStatus,
  UpdateTaskRequest,
  User,
} from '@/types';

type EditTaskData = {
  task: Task;
  project: Project;
  members: ProjectMember[];
};

type SubmissionAccountStatus =
  | 'same-user'
  | 'different-user'
  | 'logged-out'
  | 'unavailable'
  | 'stale';

const STATUS_OPTIONS: TaskStatus[] = [
  'To do',
  'In progress',
  'Done',
];

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

function normalizeDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function EditTaskForm({
  projectId,
  taskId,
  userId,
  data,
  isRefreshing,
  onRetry,
}: {
  projectId: string;
  taskId: string;
  userId: number;
  data: EditTaskData;
  isRefreshing: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();

  const {
    session,
    refreshSession,
    replaceSession,
    isCurrentSessionRevision,
  } = useSession();

  const sessionRef = useRef(session);

  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const currentMemberIds = useMemo(
    () => new Set(data.members.map((member) => member.userId)),
    [data.members],
  );

  const [taskTitle, setTaskTitle] = useState(data.task.taskTitle);
  const [taskDescription, setTaskDescription] = useState(
    data.task.taskDescription ?? '',
  );
  const [status, setStatus] = useState<TaskStatus>(data.task.status);
  const [priority, setPriority] = useState<TaskPriority>(
    data.task.priority,
  );
  const [dueDate, setDueDate] = useState(
    normalizeDateInput(data.task.dueDate),
  );
  const [assigneeIds, setAssigneeIds] = useState<number[]>(() =>
    data.task.assignees
      .map((assignee) => assignee.userId)
      .filter((id) => currentMemberIds.has(id)),
  );

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<TaskFormErrors>({});

  const isMountedRef = useRef(false);
  const submittingRef = useRef(false);
  const activeSubmissionRef = useRef<object | null>(null);

  const validAssigneeIds = useMemo(
    () => assigneeIds.filter((id) => currentMemberIds.has(id)),
    [assigneeIds, currentMemberIds],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeSubmissionRef.current = null;
    };
  }, []);

  const isCurrentSubmission = useCallback(
    (requestId: object) => {
      return (
        isMountedRef.current &&
        activeSubmissionRef.current === requestId &&
        Number.isFinite(userId) &&
        projectId.length > 0 &&
        taskId.length > 0
      );
    },
    [projectId, taskId, userId],
  );

  const resolveLatestSession = useCallback(
    async (
      requestId: object,
    ): Promise<SubmissionAccountStatus> => {
      if (!isCurrentSubmission(requestId)) {
        return 'stale';
      }

      let latestSession = sessionRef.current;

      if (
        !isCurrentSessionRevision(latestSession.revision) ||
        latestSession.status === 'loading'
      ) {
        try {
          latestSession = await refreshSession();
        } catch {
          return isCurrentSubmission(requestId)
            ? 'unavailable'
            : 'stale';
        }
      }

      if (!isCurrentSubmission(requestId)) {
        return 'stale';
      }

      if (!isCurrentSessionRevision(latestSession.revision)) {
        return 'stale';
      }

      if (latestSession.status === 'ready') {
        if (!latestSession.user) {
          return 'unavailable';
        }

        return latestSession.user.userId === userId
          ? 'same-user'
          : 'different-user';
      }

      if (latestSession.status === 'login-required') {
        return 'logged-out';
      }

      return 'unavailable';
    },
    [
      isCurrentSubmission,
      isCurrentSessionRevision,
      refreshSession,
      userId,
    ],
  );

  const verifySubmissionAccount = useCallback(
    async (
      requestId: object,
    ): Promise<SubmissionAccountStatus> => {
      if (!isCurrentSubmission(requestId)) {
        return 'stale';
      }

      const expectedRevision = sessionRef.current.revision;

      let currentUser: User | null;

      try {
        currentUser = await getCurrentUser();
      } catch (error) {
        if (!isCurrentSubmission(requestId)) {
          return 'stale';
        }

        if (!isCurrentSessionRevision(expectedRevision)) {
          return resolveLatestSession(requestId);
        }

        const httpStatus = (
          error as { status?: number }
        ).status;

        if (httpStatus === 401) {
          const updated = replaceSession(
            null,
            'login-required',
            expectedRevision,
          );

          return updated
            ? 'logged-out'
            : resolveLatestSession(requestId);
        }

        if (httpStatus === 403) {
          const updated = replaceSession(
            null,
            'no-profile',
            expectedRevision,
          );

          return updated
            ? 'unavailable'
            : resolveLatestSession(requestId);
        }

        console.error(
          'Failed to verify account during task update:',
          error,
        );

        const updated = replaceSession(
          null,
          'error',
          expectedRevision,
        );

        return updated
          ? 'unavailable'
          : resolveLatestSession(requestId);
      }

      if (!isCurrentSubmission(requestId)) {
        return 'stale';
      }

      if (!isCurrentSessionRevision(expectedRevision)) {
        return resolveLatestSession(requestId);
      }

      if (currentUser?.userId === userId) {
        return 'same-user';
      }

      const updated = replaceSession(
        currentUser,
        currentUser ? 'ready' : 'login-required',
        expectedRevision,
      );

      if (!updated) {
        return resolveLatestSession(requestId);
      }

      return currentUser ? 'different-user' : 'logged-out';
    },
    [
      isCurrentSubmission,
      isCurrentSessionRevision,
      replaceSession,
      resolveLatestSession,
      userId,
    ],
  );

  function clearError(field: keyof TaskFormErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.general;
      return next;
    });
  }

  function toggleAssignee(assigneeUserId: number) {
    if (isSaving || !currentMemberIds.has(assigneeUserId)) {
      return;
    }

    setAssigneeIds((current) =>
      current.includes(assigneeUserId)
        ? current.filter((id) => id !== assigneeUserId)
        : [...current, assigneeUserId],
    );

    clearError('assigneeIds');
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submittingRef.current || isSaving || isRefreshing) {
      return;
    }

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

    submittingRef.current = true;

    const requestId = {};
    activeSubmissionRef.current = requestId;

    setErrors({});
    setIsSaving(true);

    const input: UpdateTaskRequest = {
      taskTitle: trimmedTitle,
      taskDescription: taskDescription.trim() || null,
      status,
      priority,
      dueDate,
      assigneeIds: validAssigneeIds,
    };

    const isCurrent = () => isCurrentSubmission(requestId);

    try {
      const accountBeforeSubmit =
        await verifySubmissionAccount(requestId);

      if (!isCurrent()) return;

      if (
        accountBeforeSubmit === 'stale' ||
        accountBeforeSubmit === 'different-user'
      ) {
        return;
      }

      if (accountBeforeSubmit === 'logged-out') {
        router.replace('/login');
        return;
      }

      if (accountBeforeSubmit === 'unavailable') {
        setErrors({
          general:
            'Unable to verify your account. Please try again.',
        });
        return;
      }

      if (accountBeforeSubmit !== 'same-user') return;

      const numericProjectId = parseRouteId(
        projectId,
        'project ID',
      );
      const numericTaskId = parseRouteId(taskId, 'task ID');

      await taskApi.updateTask(
        numericProjectId,
        numericTaskId,
        input,
      );

      if (!isCurrent()) return;

      router.push(
        `/projects/${numericProjectId}/tasks/${numericTaskId}`,
      );
      router.refresh();
    } catch (error) {
      console.error('Failed to update task:', error);

      if (!isCurrent()) return;

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          router.replace('/login');
          return;
        }

        const serverErrors = mapTaskServerErrors(
          error.details,
        );

        if (error.status === 403) {
          serverErrors.general =
            'You do not have permission to edit this task.';
        } else if (error.status === 404) {
          serverErrors.general =
            'This task could not be found. It may have been deleted.';
        } else if (Object.keys(serverErrors).length > 0) {
          serverErrors.general =
            error.message ||
            'Please check the highlighted fields.';
        } else {
          serverErrors.general =
            error.message ||
            'Unable to update task. Please try again.';
        }

        setErrors(serverErrors);
      } else {
        setErrors({
          general:
            'An unexpected error occurred. Please try again.',
        });
      }
    } finally {
      if (activeSubmissionRef.current === requestId) {
        activeSubmissionRef.current = null;
        submittingRef.current = false;

        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    }
  }

  if (session.status === 'error') {
    return (
      <ProtectedState
        status="error"
        onRetry={onRetry}
      />
    );
  }

  if (isRefreshing) {
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
        href={`/projects/${projectId}/tasks/${taskId}`}
        className="mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black"
      >
        ← Back to Task Detail
      </Link>

      <div className="mb-6">
        <p className="mb-1 text-[13px] text-[#777777]">
          {data.project.projectName}
        </p>

        <h1 className="text-[30px] font-extrabold text-[#1f1f1f]">
          Edit Task
        </h1>

        <p className="mt-2 text-[13px] text-[#777777]">
          Update task details, status, priority, due date, or assignees.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        noValidate
        aria-busy={isSaving}
        className="rounded-2xl border border-[#e0e0e0] bg-white p-4 shadow-sm sm:p-6 md:p-8"
      >
        <fieldset disabled={isSaving} className="contents">
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
              placeholder="e.g. Design login page"
              className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none focus:border-[#555555] ${
                errors.taskTitle
                  ? 'border-red-500'
                  : 'border-[#dcdcdc]'
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

          <div className="mb-6 grid gap-5 sm:grid-cols-3">
            <div>
              <label
                htmlFor="status"
                className="mb-2 block text-[13px] font-semibold text-[#333333]"
              >
                Status <span className="text-red-500">*</span>
              </label>

              <select
                id="status"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as TaskStatus);
                  clearError('status');
                }}
                className="w-full rounded-xl border border-[#dcdcdc] bg-white px-4 py-3 text-[13px] outline-none focus:border-[#555555]"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

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
                  setPriority(
                    Number(event.target.value) as TaskPriority,
                  );
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
                  errors.dueDate
                    ? 'border-red-500'
                    : 'border-[#dcdcdc]'
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

          <AssigneeSelector
            members={data.members}
            selectedIds={validAssigneeIds}
            error={errors.assigneeIds}
            disabled={isSaving}
            onToggle={toggleAssignee}
          />

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-5">
            <button
              type="button"
              disabled={isSaving}
              onClick={() =>
                router.push(
                  `/projects/${projectId}/tasks/${taskId}`,
                )
              }
              className="min-h-11 rounded-xl border border-[#dddddd] px-5 text-[13px] font-medium text-[#444444] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="min-h-11 rounded-xl bg-[#222222] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}

function EditTaskContent({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const router = useRouter();
  const { session, refreshSession } = useSession();

  const isInvalidId =
    tryParseRouteId(projectId, 'project ID') === null ||
    tryParseRouteId(taskId, 'task ID') === null;

  const load = useCallback(async (): Promise<EditTaskData> => {
    const numericProjectId = parseRouteId(
      projectId,
      'project ID',
    );
    const numericTaskId = parseRouteId(taskId, 'task ID');

    const [task, project, members] = await Promise.all([
      taskApi.getTaskById(numericProjectId, numericTaskId),
      projectApi.getProjectById(numericProjectId),
      taskApi.getProjectMembers(numericProjectId),
    ]);

    return { task, project, members };
  }, [projectId, taskId]);

  const {
    status,
    data,
    userId,
    httpStatus,
    isRefreshing,
    retained,
    retainedUserId,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: false,
  });

  const isNotFound =
    isInvalidId ||
    (status === 'error' &&
      (httpStatus === 400 || httpStatus === 404));

  useEffect(() => {
    if (isNotFound) {
      notFound();
    }
  }, [isNotFound]);

  const handleRetry = useCallback(async () => {
    try {
      await refreshSession();
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }

    await retry();
  }, [refreshSession, retry]);

  if (isNotFound) {
    return null;
  }

  const canKeepPreviousForm =
    retained !== null &&
    retainedUserId !== null &&
    (session.status === 'loading' ||
      session.status === 'error' ||
      (session.status === 'ready' &&
        session.user?.userId === retainedUserId &&
        (status === 'loading' || isRefreshing)));

  if (canKeepPreviousForm) {
    return (
      <EditTaskForm
        key={`${retainedUserId}:${projectId}:${taskId}`}
        projectId={projectId}
        taskId={taskId}
        userId={retainedUserId}
        data={retained}
        isRefreshing={
          session.status === 'loading' ||
          (session.status === 'ready' && isRefreshing)
        }
        onRetry={handleRetry}
      />
    );
  }

  if (session.status === 'loading') {
    return (
      <ProtectedState
        status="loading"
        onRetry={handleRetry}
      />
    );
  }

  if (
    session.status === 'error' ||
    session.status === 'no-profile'
  ) {
    return (
      <ProtectedState
        status="error"
        onRetry={handleRetry}
      />
    );
  }

  if (session.status === 'login-required') {
    return (
      <ProtectedState
        status="login-required"
        onRetry={handleRetry}
      />
    );
  }

  if (status === 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-5">
        <p
          role="alert"
          className="mb-4 text-[13px] text-red-600"
        >
          Unable to load the task edit form. Please try again.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() =>
              router.push(
                `/projects/${projectId}/tasks/${taskId}`,
              )
            }
            className="min-h-11 rounded-lg border border-[#dddddd] px-4 text-[13px]"
          >
            Back to Task Detail
          </button>

          <button
            type="button"
            onClick={handleRetry}
            className="min-h-11 rounded-lg bg-[#222222] px-4 text-[13px] text-white"
          >
            Try again
          </button>
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
        onRetry={handleRetry}
      />
    );
  }

  if (
    session.status !== 'ready' ||
    !session.user ||
    session.user.userId !== userId
  ) {
    return (
      <ProtectedState
        status="loading"
        onRetry={handleRetry}
      />
    );
  }

  return (
    <EditTaskForm
      key={`${userId}:${projectId}:${taskId}`}
      projectId={projectId}
      taskId={taskId}
      userId={userId}
      data={data}
      isRefreshing={isRefreshing}
      onRetry={handleRetry}
    />
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