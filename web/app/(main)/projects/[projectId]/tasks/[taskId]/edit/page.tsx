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

type RawFormValues = {
  taskTitle: string;
  taskDescription: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeIds: number[];
};

type InitialFormSnapshot = {
  taskTitle: string;
  taskDescription: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeIds: number[];
};

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

const STATUS_OPTIONS: {
  value: TaskStatus;
  label: string;
  dotClass: string;
}[] = [
  { value: 'To do', label: 'To do', dotClass: 'bg-slate-600' },
  { value: 'In progress', label: 'In progress', dotClass: 'bg-blue-600' },
  { value: 'Done', label: 'Done', dotClass: 'bg-emerald-500' },
];

const PRIORITY_OPTIONS: {
  value: TaskPriority;
  label: string;
  dotClass: string;
}[] = [
  { value: 1, label: 'High', dotClass: 'bg-red-500' },
  { value: 2, label: 'Medium', dotClass: 'bg-amber-500' },
  { value: 3, label: 'Low', dotClass: 'bg-cyan-500' },
];

function normalizeDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

function haveSameAssigneeSet(
  left: readonly number[],
  right: readonly number[],
): boolean {
  const leftSet = new Set(left);
  const rightSet = new Set(right);

  if (leftSet.size !== rightSet.size) {
    return false;
  }

  for (const id of leftSet) {
    if (!rightSet.has(id)) {
      return false;
    }
  }

  return true;
}

function buildRawFormValues(data: EditTaskData): RawFormValues {
  return {
    taskTitle: data.task.taskTitle,
    taskDescription: data.task.taskDescription ?? '',
    status: data.task.status,
    priority: data.task.priority,
    dueDate: normalizeDateInput(data.task.dueDate),
    assigneeIds: Array.from(
      new Set(
        data.task.assignees
          .map((assignee) => assignee.userId)
          .filter((id) =>
            data.members.some((member) => member.userId === id),
          ),
      ),
    ),
  };
}

function EditTaskForm({
  projectId,
  taskId,
  userId,
  data,
  isRefreshing,
  loadFailed,
  onRetry,
}: {
  projectId: string;
  taskId: string;
  userId: number;
  data: EditTaskData;
  isRefreshing: boolean;
  loadFailed: boolean;
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

  const latestRawValues = useMemo(
    () => buildRawFormValues(data),
    [data],
  );

  // เก็บค่าเริ่มต้นตอนเปิดฟอร์มไว้เปรียบเทียบตอนส่ง PATCH และตอนกด Cancel
  const [rawBaseline, setRawBaseline] = useState<RawFormValues>(
    () => latestRawValues,
  );

  const initialSnapshot = useMemo<InitialFormSnapshot>(
    () => ({
      taskTitle: rawBaseline.taskTitle.trim(),
      taskDescription: rawBaseline.taskDescription.trim() || null,
      status: rawBaseline.status,
      priority: rawBaseline.priority,
      dueDate: rawBaseline.dueDate,
      assigneeIds: rawBaseline.assigneeIds,
    }),
    [rawBaseline],
  );

  const [taskTitle, setTaskTitle] = useState(rawBaseline.taskTitle);
  const [taskDescription, setTaskDescription] = useState(
    rawBaseline.taskDescription,
  );
  const [status, setStatus] = useState<TaskStatus>(rawBaseline.status);
  const [priority, setPriority] = useState<TaskPriority>(
    rawBaseline.priority,
  );
  const [dueDate, setDueDate] = useState(rawBaseline.dueDate);
  const [assigneeIds, setAssigneeIds] = useState<number[]>(
    () => rawBaseline.assigneeIds,
  );

  const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
  const [isPriorityDropdownOpen, setIsPriorityDropdownOpen] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<TaskFormErrors>({});

  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const priorityDropdownRef = useRef<HTMLDivElement | null>(null);

  const isMountedRef = useRef(false);
  const submittingRef = useRef(false);
  const activeSubmissionRef = useRef<object | null>(null);
  const isDiscardedRef = useRef(false);
  const latestRawValuesRef = useRef(latestRawValues);

  useLayoutEffect(() => {
    latestRawValuesRef.current = latestRawValues;
  }, [latestRawValues]);

  const resetFormToInitial = useCallback(() => {
    const baseline = latestRawValuesRef.current;
    isDiscardedRef.current = true;
    setRawBaseline(baseline);
    setTaskTitle(baseline.taskTitle);
    setTaskDescription(baseline.taskDescription);
    setStatus(baseline.status);
    setPriority(baseline.priority);
    setDueDate(baseline.dueDate);
    setAssigneeIds(baseline.assigneeIds);
    setErrors({});
    setIsStatusDropdownOpen(false);
    setIsPriorityDropdownOpen(false);
  }, []);

  const handleCancel = useCallback(() => {
    if (isSaving) return;
    resetFormToInitial();
    router.push(`/projects/${projectId}/tasks/${taskId}`);
    router.refresh();
  }, [isSaving, projectId, resetFormToInitial, router, taskId]);

  // ซิงก์ค่าใหม่จากเซิร์ฟเวอร์เฉพาะช่องที่ผู้ใช้ยังไม่แก้ไข หรือหลังกดยกเลิก
  useEffect(() => {
    setRawBaseline((prevBaseline) => {
      if (isDiscardedRef.current) {
        setTaskTitle(latestRawValues.taskTitle);
        setTaskDescription(latestRawValues.taskDescription);
        setStatus(latestRawValues.status);
        setPriority(latestRawValues.priority);
        setDueDate(latestRawValues.dueDate);
        setAssigneeIds(latestRawValues.assigneeIds);
        return latestRawValues;
      }

      setTaskTitle((cur) =>
        cur.trim() === prevBaseline.taskTitle.trim()
          ? latestRawValues.taskTitle
          : cur,
      );
      setTaskDescription((cur) =>
        cur.trim() === prevBaseline.taskDescription.trim()
          ? latestRawValues.taskDescription
          : cur,
      );
      setStatus((cur) =>
        cur === prevBaseline.status ? latestRawValues.status : cur,
      );
      setPriority((cur) =>
        cur === prevBaseline.priority ? latestRawValues.priority : cur,
      );
      setDueDate((cur) =>
        cur === prevBaseline.dueDate ? latestRawValues.dueDate : cur,
      );
      setAssigneeIds((cur) =>
        haveSameAssigneeSet(cur, prevBaseline.assigneeIds)
          ? latestRawValues.assigneeIds
          : cur,
      );

      return latestRawValues;
    });
  }, [latestRawValues]);

  const validAssigneeIds = useMemo(
    () =>
      Array.from(
        new Set(assigneeIds.filter((id) => currentMemberIds.has(id))),
      ),
    [assigneeIds, currentMemberIds],
  );

  useEffect(() => {
    isMountedRef.current = true;
    isDiscardedRef.current = false;

    return () => {
      isMountedRef.current = false;
      activeSubmissionRef.current = null;
      resetFormToInitial();
    };
  }, [resetFormToInitial]);

  useEffect(() => {
    if (!isStatusDropdownOpen && !isPriorityDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(target)
      ) {
        setIsStatusDropdownOpen(false);
      }
      if (
        priorityDropdownRef.current &&
        !priorityDropdownRef.current.contains(target)
      ) {
        setIsPriorityDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsStatusDropdownOpen(false);
        setIsPriorityDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStatusDropdownOpen, isPriorityDropdownOpen]);

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

    isDiscardedRef.current = false;

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

    if (
      submittingRef.current ||
      isSaving ||
      isRefreshing ||
      loadFailed
    ) {
      return;
    }

    setIsStatusDropdownOpen(false);
    setIsPriorityDropdownOpen(false);

    const trimmedTitle = taskTitle.trim();
    const normalizedDescription = taskDescription.trim() || null;

    const validationErrors = validateTaskForm({
      taskTitle,
      dueDate,
      assigneeIds: validAssigneeIds,
    });

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    // สร้าง payload เฉพาะช่องที่เปลี่ยนจากค่าเริ่มต้น
    const patchInput: UpdateTaskRequest = {};

    if (trimmedTitle !== initialSnapshot.taskTitle) {
      patchInput.taskTitle = trimmedTitle;
    }

    if (normalizedDescription !== initialSnapshot.taskDescription) {
      patchInput.taskDescription = normalizedDescription;
    }

    if (status !== initialSnapshot.status) {
      patchInput.status = status;
    }

    if (priority !== initialSnapshot.priority) {
      patchInput.priority = priority;
    }

    if (dueDate !== initialSnapshot.dueDate) {
      patchInput.dueDate = dueDate;
    }

    if (
      !haveSameAssigneeSet(
        validAssigneeIds,
        initialSnapshot.assigneeIds,
      )
    ) {
      patchInput.assigneeIds = validAssigneeIds;
    }

    // ถ้าไม่มีฟิลด์ไหนเปลี่ยนเลย ไม่ต้องยิง PATCH
    if (Object.keys(patchInput).length === 0) {
      resetFormToInitial();
      router.push(`/projects/${projectId}/tasks/${taskId}`);
      return;
    }

    submittingRef.current = true;

    const requestId = {};
    activeSubmissionRef.current = requestId;

    setErrors({});
    setIsSaving(true);

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
        patchInput,
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

  // เก็บ instance และค่าที่พิมพ์ไว้ใน Memory แต่ซ่อนไว้ระหว่าง error/refresh
  if (session.status === 'error' || loadFailed) {
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

  const activeStatusOption =
    STATUS_OPTIONS.find((option) => option.value === status) ??
    STATUS_OPTIONS[0];

  const activePriorityOption =
    PRIORITY_OPTIONS.find((option) => option.value === priority) ??
    PRIORITY_OPTIONS[1];

  return (
    <div className="relative min-w-0 pb-10 [overflow-wrap:anywhere]">
      {/* FULL-SCREEN WORKSPACE PATTERN BACKGROUND */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: WORKSPACE_PATTERN_BG,
          backgroundRepeat: 'repeat',
          backgroundSize: '140px 140px',
        }}
      />

      <div className="relative z-[1] mx-auto w-full max-w-4xl space-y-6">
        {/* PURPLE HEADER BANNER */}
        <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 py-6 sm:px-9 sm:py-7 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
          {/* Decorative soft circles */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-white/[0.07]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-8 -top-12 h-60 w-60 rounded-full bg-white/[0.08]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-44 bottom-2 h-36 w-36 rounded-full bg-white/[0.06]"
          />

          {/* Decorative vector doodles */}
          <svg
            aria-hidden="true"
            viewBox="0 0 896 180"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <g
              stroke="#FFFFFF"
              strokeOpacity="0.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M540 34L542.4 41.6L550 44L542.4 46.4L540 54L537.6 46.4L530 44L537.6 41.6L540 34Z"
                strokeWidth="1.7"
              />
              <path d="M448 124V136M442 130H454" strokeWidth="1.9" />
              <path d="M642 30V40M637 35H647" strokeWidth="1.8" />
              <rect
                x="690"
                y="108"
                width="13"
                height="13"
                rx="3.5"
                transform="rotate(45 696.5 114.5)"
                strokeWidth="1.8"
              />
              <g transform="translate(778 52)">
                <rect
                  x="0"
                  y="0"
                  width="17"
                  height="17"
                  rx="4.5"
                  strokeWidth="1.8"
                />
                <path d="M5 8.5L7.6 11.1L12.2 6.2" strokeWidth="1.8" />
              </g>
              <circle cx="496" cy="64" r="5" strokeWidth="1.8" />
            </g>
          </svg>

          <div className="relative z-[1]">
            {/* BREADCRUMB */}
            <nav
              aria-label="Breadcrumb"
              className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-white/80"
            >
              <Link
                href="/projects"
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                    return;
                  }
                  resetFormToInitial();
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`font-medium hover:text-white transition-colors ${
                  isSaving ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                Projects
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <Link
                href={`/projects/${projectId}`}
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                    return;
                  }
                  resetFormToInitial();
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`font-medium hover:text-white transition-colors break-words ${
                  isSaving ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                {data.project.projectName}
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <Link
                href={`/projects/${projectId}/tasks/${taskId}`}
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                    return;
                  }
                  resetFormToInitial();
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`font-medium hover:text-white transition-colors break-words ${
                  isSaving ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                {data.task.taskTitle}
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <span className="font-bold text-white">Edit Task</span>
            </nav>

            {/* BACK BUTTON + TITLE */}
            <div className="flex min-w-0 items-start gap-4">
              <Link
                href={`/projects/${projectId}/tasks/${taskId}`}
                aria-label="Back to Task Detail"
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                    return;
                  }
                  resetFormToInitial();
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 hover:border-white/40 transition-colors ${
                  isSaving ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </Link>

              <div className="min-w-0">
                <h1 className="text-[26px] sm:text-[32px] font-extrabold leading-tight tracking-tight text-white">
                  Edit Task
                </h1>

                <p className="mt-1 text-[13.5px] sm:text-[14px] text-white/85">
                  Update task details, status, priority, due date, or assignees.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* FORM CARD */}
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isSaving}
          className="min-w-0 rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 shadow-[0_6px_24px_rgba(35,25,66,0.06)] sm:p-7 md:p-8"
        >
          <fieldset disabled={isSaving} className="contents">
            {errors.general && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="min-w-0">{errors.general}</p>
              </div>
            )}

            {/* SECTION HEADER */}
            <div className="mb-6 flex items-center gap-3 border-b border-[#ece8f8] pb-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </span>

              <div>
                <h2 className="text-[17px] font-extrabold text-[#1f1f1f]">
                  Task details
                </h2>
                <p className="text-[12.5px] text-[#6e6b7b]">
                  Modify the task information below.
                </p>
              </div>
            </div>

            {/* TASK TITLE */}
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="taskTitle"
                  className="block text-[13px] font-bold text-[#2b2838]"
                >
                  Task title <span className="text-rose-500">*</span>
                </label>

                <span className="shrink-0 text-[11.5px] font-medium text-[#8f89a6] tabular-nums">
                  {taskTitle.length}/200
                </span>
              </div>

              <input
                id="taskTitle"
                type="text"
                maxLength={200}
                required
                value={taskTitle}
                onChange={(event) => {
                  isDiscardedRef.current = false;
                  setTaskTitle(event.target.value);
                  clearError('taskTitle');
                }}
                placeholder="e.g. Design login page"
                className={`min-h-11 w-full rounded-xl border px-4 py-2.5 text-[13.5px] text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                  errors.taskTitle
                    ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                    : 'border-[#cfc9e8] bg-[#f8f6fe] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15'
                }`}
                aria-invalid={Boolean(errors.taskTitle)}
              />

              {errors.taskTitle && (
                <p
                  role="alert"
                  className="mt-1.5 text-[12px] font-medium text-rose-600"
                >
                  {errors.taskTitle}
                </p>
              )}
            </div>

            {/* DESCRIPTION */}
            <div className="mb-5">
              <label
                htmlFor="taskDescription"
                className="mb-2 block text-[13px] font-bold text-[#2b2838]"
              >
                Description
              </label>

              <textarea
                id="taskDescription"
                rows={4}
                value={taskDescription}
                onChange={(event) => {
                  isDiscardedRef.current = false;
                  setTaskDescription(event.target.value);
                  clearError('taskDescription');
                }}
                placeholder="Describe what needs to be done..."
                className="w-full resize-y rounded-xl border border-[#cfc9e8] bg-[#f8f6fe] px-4 py-3 text-[13.5px] leading-relaxed text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15 disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c]"
              />
            </div>

            {/* STATUS, PRIORITY & DUE DATE SECTION */}
            <div className="mb-6 rounded-xl border border-[#e2dcf5] bg-[#f7f5fd]/80 p-4 sm:p-5">
              <div className="mb-3.5 flex items-center gap-2 text-[12.5px] font-bold text-[#4c35ab]">
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Status, Priority &amp; Schedule</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 sm:gap-5 [&>div]:min-w-0">
                {/* STATUS CUSTOM ROUNDED DROPDOWN */}
                <div ref={statusDropdownRef} className="relative">
                  <label
                    id="status-label"
                    className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                  >
                    Status <span className="text-rose-500">*</span>
                  </label>

                  <button
                    type="button"
                    aria-labelledby="status-label"
                    aria-haspopup="listbox"
                    aria-expanded={isStatusDropdownOpen}
                    disabled={isSaving}
                    onClick={() => {
                      setIsStatusDropdownOpen((prev) => !prev);
                      setIsPriorityDropdownOpen(false);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-left text-[13.5px] font-semibold outline-none transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                      isStatusDropdownOpen
                        ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                        : 'border-[#cfc9e8] bg-white text-[#1f1f1f] hover:border-[#9e8ce6]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${activeStatusOption.dotClass}`}
                      />
                      <span className="truncate">
                        {activeStatusOption.label}
                      </span>
                    </span>

                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`shrink-0 transition-transform duration-150 ${
                        isStatusDropdownOpen
                          ? 'rotate-180 text-[#5B44BA]'
                          : 'text-[#6e6b7b]'
                      }`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isStatusDropdownOpen && !isSaving && (
                    <div
                      role="listbox"
                      aria-labelledby="status-label"
                      className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[160px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                    >
                      {STATUS_OPTIONS.map((option) => {
                        const isSelected = status === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              isDiscardedRef.current = false;
                              setStatus(option.value);
                              clearError('status');
                              setIsStatusDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                                : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${option.dotClass}`}
                              />
                              <span>{option.label}</span>
                            </span>

                            {isSelected && (
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* PRIORITY CUSTOM ROUNDED DROPDOWN */}
                <div ref={priorityDropdownRef} className="relative">
                  <label
                    id="priority-label"
                    className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                  >
                    Priority <span className="text-rose-500">*</span>
                  </label>

                  <button
                    type="button"
                    aria-labelledby="priority-label"
                    aria-haspopup="listbox"
                    aria-expanded={isPriorityDropdownOpen}
                    disabled={isSaving}
                    onClick={() => {
                      setIsPriorityDropdownOpen((prev) => !prev);
                      setIsStatusDropdownOpen(false);
                    }}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 rounded-xl border px-3.5 py-2 text-left text-[13.5px] font-semibold outline-none transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                      isPriorityDropdownOpen
                        ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                        : 'border-[#cfc9e8] bg-white text-[#1f1f1f] hover:border-[#9e8ce6]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2 w-2 shrink-0 rounded-full ${activePriorityOption.dotClass}`}
                      />
                      <span className="truncate">
                        {activePriorityOption.label}
                      </span>
                    </span>

                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`shrink-0 transition-transform duration-150 ${
                        isPriorityDropdownOpen
                          ? 'rotate-180 text-[#5B44BA]'
                          : 'text-[#6e6b7b]'
                      }`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isPriorityDropdownOpen && !isSaving && (
                    <div
                      role="listbox"
                      aria-labelledby="priority-label"
                      className="absolute left-0 top-full z-30 mt-1.5 w-full min-w-[160px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                    >
                      {PRIORITY_OPTIONS.map((option) => {
                        const isSelected = priority === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              isDiscardedRef.current = false;
                              setPriority(option.value);
                              clearError('priority');
                              setIsPriorityDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                                : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${option.dotClass}`}
                              />
                              <span>{option.label}</span>
                            </span>

                            {isSelected && (
                              <svg
                                width="13"
                                height="13"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {errors.priority && (
                    <p
                      role="alert"
                      className="mt-1.5 text-[12px] font-medium text-rose-600"
                    >
                      {errors.priority}
                    </p>
                  )}
                </div>

                {/* DUE DATE */}
                <div>
                  <label
                    htmlFor="dueDate"
                    className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                  >
                    Due date <span className="text-rose-500">*</span>
                  </label>

                  <input
                    id="dueDate"
                    type="date"
                    required
                    value={dueDate}
                    onChange={(event) => {
                      isDiscardedRef.current = false;
                      setDueDate(event.target.value);
                      clearError('dueDate');
                    }}
                    className={`min-h-11 min-w-0 max-w-full w-full rounded-xl border px-3.5 py-2 text-base sm:text-[13.5px] text-[#1f1f1f] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                      errors.dueDate
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                        : 'border-[#cfc9e8] bg-white focus:border-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/15'
                    }`}
                    aria-invalid={Boolean(errors.dueDate)}
                  />

                  {errors.dueDate && (
                    <p
                      role="alert"
                      className="mt-1.5 text-[12px] font-medium text-rose-600"
                    >
                      {errors.dueDate}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ASSIGNEE SELECTOR */}
            <div className="mb-7">
              <AssigneeSelector
                members={data.members}
                selectedIds={validAssigneeIds}
                error={errors.assigneeIds}
                disabled={isSaving}
                onToggle={toggleAssignee}
              />
            </div>

            {/* FORM ACTIONS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 border-t border-[#ece8f8] pt-6">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleCancel}
                className="min-h-11 rounded-xl border border-[#cfc9e8] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#5B44BA] px-6 py-2.5 text-[13.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.28)] transition-all hover:bg-[#4934a3] hover:shadow-[0_6px_20px_rgba(91,68,186,0.36)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="animate-spin"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </fieldset>
        </form>
      </div>
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

  // เก็บ EditTaskForm instance เดิมไว้เมื่อบัญชีเดิมกำลังโหลดเบื้องหลังหรือโหลดพลาด (เช่น 500)
  // แต่จะไม่ผ่านเงื่อนไขนี้ทันทีหากเปลี่ยนบัญชีหรือออกจากระบบ (ฟอร์มเก่าจะถูก unmount และล้างค่า)
  const canKeepPreviousForm =
    retained !== null &&
    retainedUserId !== null &&
    (session.status === 'loading' ||
      session.status === 'error' ||
      (session.status === 'ready' &&
        session.user?.userId === retainedUserId &&
        (status === 'loading' ||
          status === 'error' ||
          isRefreshing)));

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
        loadFailed={
          session.status === 'ready' && status === 'error'
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
      <div className="mx-auto max-w-3xl rounded-2xl border border-[#cfc9e8] bg-white p-5 sm:p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)]">
        <p
          role="alert"
          className="mb-4 text-[13.5px] font-medium text-red-600"
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
            className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#333333] hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] transition-colors cursor-pointer"
          >
            Back to Task Detail
          </button>

          <button
            type="button"
            onClick={handleRetry}
            className="min-h-10 rounded-xl bg-[#5B44BA] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#4934a3] transition-colors cursor-pointer"
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
      loadFailed={false}
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