'use client';

import KeyboardPopup from '@/components/ui/KeyboardPopup';

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
  CreateTaskRequest,
  ProjectMember,
  TaskPriority,
  User,
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

type CreatedTaskReceipt = {
  taskId: number;
  userId: number;
  projectId: string;
  draftId: string;
  token: string;
};

type SubmissionAccountStatus =
  | 'same-user'
  | 'different-user'
  | 'logged-out'
  | 'unavailable'
  | 'stale';

const DRAFT_STORAGE_PREFIX = 'mobg:create-task-draft:';
const ACTIVE_DRAFT_PREFIX = 'mobg:create-task-active-draft:';
const CREATED_TASK_PREFIX = 'mobg:create-task-receipt:';

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

const PRIORITY_OPTIONS: {
  value: TaskPriority;
  label: string;
  badgeClass: string;
  dotClass: string;
}[] = [
  {
    value: 1,
    label: 'High',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
    dotClass: 'bg-red-500',
  },
  {
    value: 2,
    label: 'Medium',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    dotClass: 'bg-amber-500',
  },
  {
    value: 3,
    label: 'Low',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dotClass: 'bg-cyan-500',
  },
];

function getAccountProjectKey(
  userId: number,
  projectId: string,
) {
  return `${encodeURIComponent(String(userId))}:${encodeURIComponent(projectId)}`;
}

function getActiveDraftStorageKey(
  userId: number,
  projectId: string,
) {
  return `${ACTIVE_DRAFT_PREFIX}${getAccountProjectKey(userId, projectId)}`;
}

function getDraftStorageKey(
  userId: number,
  projectId: string,
  draftId: string,
) {
  return `${DRAFT_STORAGE_PREFIX}${getAccountProjectKey(userId, projectId)}:${encodeURIComponent(draftId)}`;
}

function getCreatedTaskStorageKey(
  userId: number,
  projectId: string,
  draftId: string,
) {
  return `${CREATED_TASK_PREFIX}${getAccountProjectKey(userId, projectId)}:${encodeURIComponent(draftId)}`;
}

function safeGetSessionStorage(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetSessionStorage(
  key: string,
  value: string,
): boolean {
  try {
    window.sessionStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveSessionStorage(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Storage may be unavailable.
  }
}

function createId(): string {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isValidDraftId(value: string | null): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200
  );
}

function getOrCreateDraftId(
  activeDraftStorageKey: string,
): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const savedDraftId = safeGetSessionStorage(
    activeDraftStorageKey,
  );

  if (isValidDraftId(savedDraftId)) {
    return savedDraftId;
  }

  const nextDraftId = createId();

  safeSetSessionStorage(
    activeDraftStorageKey,
    nextDraftId,
  );

  return nextDraftId;
}

function createSubmissionToken(): string {
  return createId();
}

function parseCreatedTaskReceipt(
  raw: string | null,
  userId: number,
  projectId: string,
  draftId: string,
): CreatedTaskReceipt | null {
  if (!raw) return null;

  try {
    const value = JSON.parse(raw) as Partial<CreatedTaskReceipt>;

    if (
      typeof value.taskId !== 'number' ||
      !Number.isSafeInteger(value.taskId) ||
      value.taskId <= 0 ||
      value.userId !== userId ||
      value.projectId !== projectId ||
      value.draftId !== draftId ||
      typeof value.token !== 'string' ||
      value.token.length === 0
    ) {
      return null;
    }

    return {
      taskId: value.taskId,
      userId,
      projectId,
      draftId,
      token: value.token,
    };
  } catch {
    return null;
  }
}

function CreateTaskForm({
  projectId,
  userId,
  data,
  isRefreshing,
  onRetry,
}: {
  projectId: string;
  userId: number;
  data: FormData;
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

  const activeDraftStorageKey = getActiveDraftStorageKey(
    userId,
    projectId,
  );

  const [draftId] = useState<string | null>(() =>
    getOrCreateDraftId(activeDraftStorageKey),
  );

  const draftKey = useMemo(
    () =>
      draftId
        ? getDraftStorageKey(userId, projectId, draftId)
        : null,
    [draftId, projectId, userId],
  );

  const createdTaskStorageKey = useMemo(
    () =>
      draftId
        ? getCreatedTaskStorageKey(userId, projectId, draftId)
        : null,
    [draftId, projectId, userId],
  );

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);

  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errors, setErrors] = useState<TaskFormErrors>({});

  const [createdReceipt, setCreatedReceipt] =
    useState<CreatedTaskReceipt | null>(null);

  const isMountedRef = useRef(false);
  const submittingRef = useRef(false);
  const submittedRef = useRef(false);
  const activeSubmissionRef = useRef<object | null>(null);
  const createdReceiptRef = useRef<CreatedTaskReceipt | null>(null);
  const navigationStartedRef = useRef(false);
  const priorityDropdownRef = useRef<HTMLDivElement | null>(null);

  const projectStartDate = data.project.startDate
    ? data.project.startDate.slice(0, 10)
    : undefined;

  const currentMemberIds = useMemo(
    () => new Set(data.members.map((member) => member.userId)),
    [data.members],
  );

  const validAssigneeIds = useMemo(
    () => assigneeIds.filter((id) => currentMemberIds.has(id)),
    [assigneeIds, currentMemberIds],
  );

  const isBusy = isSaving;
  const visiblePriorityOpen = isPriorityOpen && !isBusy && !isSubmitted;

  useEffect(() => {
    if (!visiblePriorityOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        priorityDropdownRef.current &&
        !priorityDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPriorityOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsPriorityOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [visiblePriorityOpen]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeSubmissionRef.current = null;

      if (
        navigationStartedRef.current &&
        draftId &&
        createdTaskStorageKey
      ) {
        if (draftKey) {
          safeRemoveSessionStorage(draftKey);
        }

        safeRemoveSessionStorage(createdTaskStorageKey);

        const activeDraftId = safeGetSessionStorage(
          activeDraftStorageKey,
        );

        if (activeDraftId === draftId) {
          safeRemoveSessionStorage(activeDraftStorageKey);
        }
      }
    };
  }, [
    activeDraftStorageKey,
    createdTaskStorageKey,
    draftId,
    draftKey,
  ]);

  const isCurrentSubmission = useCallback(
    (requestId: object) => {
      return (
        isMountedRef.current &&
        activeSubmissionRef.current === requestId &&
        Number.isFinite(userId) &&
        projectId.length > 0
      );
    },
    [projectId, userId],
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

      if (
        !isCurrentSessionRevision(latestSession.revision)
      ) {
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

          if (!updated) {
            return resolveLatestSession(requestId);
          }

          return 'logged-out';
        }

        if (httpStatus === 403) {
          const updated = replaceSession(
            null,
            'no-profile',
            expectedRevision,
          );

          if (!updated) {
            return resolveLatestSession(requestId);
          }

          return 'unavailable';
        }

        console.error(
          'Failed to verify account during task submission:',
          error,
        );

        const updated = replaceSession(
          null,
          'error',
          expectedRevision,
        );

        if (!updated) {
          return resolveLatestSession(requestId);
        }

        return 'unavailable';
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

  const verifyCreatedTaskReceipt = useCallback(
    async (
      requestId: object,
      receipt: CreatedTaskReceipt,
    ) => {
      if (!isCurrentSubmission(requestId)) {
        return;
      }

      try {
        const latestSession = await refreshSession();

        if (!isCurrentSubmission(requestId)) {
          return;
        }

        if (
          !isCurrentSessionRevision(latestSession.revision)
        ) {
          setErrors({
            general:
              'Unable to confirm your session. Please verify again.',
          });
          return;
        }

        if (
          latestSession.status === 'ready' &&
          latestSession.user?.userId === receipt.userId
        ) {
          navigationStartedRef.current = true;

          router.push(
            `/projects/${receipt.projectId}/tasks/${receipt.taskId}`,
          );

          return;
        }

        if (latestSession.status === 'login-required') {
          router.replace('/login');
          return;
        }

        if (
          latestSession.status === 'ready' &&
          latestSession.user?.userId !== receipt.userId
        ) {
          setErrors({
            general:
              'The task was created under another account. Please sign in with the account that created this task before opening it.',
          });
          return;
        }

        setErrors({
          general:
            'The task was created, but your session could not be verified. Please try verifying again. Do not create the task again.',
        });
      } catch (error) {
        console.error(
          'Failed to verify session after task creation:',
          error,
        );

        if (!isCurrentSubmission(requestId)) {
          return;
        }

        setErrors({
          general:
            'The task was created, but your session could not be verified. Please try verifying again. Do not create the task again.',
        });
      }
    },
    [
      isCurrentSubmission,
      isCurrentSessionRevision,
      refreshSession,
      router,
    ],
  );

  const resumeCreatedTask = useCallback(async () => {
    const receipt = createdReceiptRef.current;

    if (!receipt || submittingRef.current || isSaving) {
      return;
    }

    submittingRef.current = true;

    const requestId = {};
    activeSubmissionRef.current = requestId;

    setErrors({});
    setIsSaving(true);

    try {
      await verifyCreatedTaskReceipt(requestId, receipt);
    } finally {
      if (activeSubmissionRef.current === requestId) {
        activeSubmissionRef.current = null;
        submittingRef.current = false;

        if (isMountedRef.current) {
          setIsSaving(false);
        }
      }
    }
  }, [isSaving, verifyCreatedTaskReceipt]);

  useEffect(() => {
    if (!draftId || !draftKey || !createdTaskStorageKey) {
      return;
    }

    let cancelled = false;

    const frameId = window.requestAnimationFrame(() => {
      try {
        const savedReceipt = parseCreatedTaskReceipt(
          safeGetSessionStorage(createdTaskStorageKey),
          userId,
          projectId,
          draftId,
        );

        if (savedReceipt) {
          submittedRef.current = true;
          createdReceiptRef.current = savedReceipt;

          setIsSubmitted(true);
          setCreatedReceipt(savedReceipt);

          safeRemoveSessionStorage(draftKey);

          return;
        }

        submittedRef.current = false;
        createdReceiptRef.current = null;

        setIsSubmitted(false);
        setCreatedReceipt(null);

        const savedDraft = safeGetSessionStorage(draftKey);

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
        } else {
          setTaskTitle('');
          setTaskDescription('');
          setPriority(2);
          setDueDate('');
          setAssigneeIds([]);
        }
      } catch (error) {
        console.error('Failed to restore task draft:', error);
        safeRemoveSessionStorage(draftKey);
      } finally {
        if (!cancelled && isMountedRef.current) {
          setIsDraftReady(true);
        }
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    createdTaskStorageKey,
    currentMemberIds,
    draftId,
    draftKey,
    projectId,
    userId,
  ]);

  useEffect(() => {
    if (
      !draftKey ||
      !isDraftReady ||
      submittedRef.current ||
      createdReceipt
    ) {
      return;
    }

    const draft: TaskDraft = {
      taskTitle,
      taskDescription,
      priority,
      dueDate,
      assigneeIds: validAssigneeIds,
    };

    safeSetSessionStorage(
      draftKey,
      JSON.stringify(draft),
    );
  }, [
    draftKey,
    isDraftReady,
    createdReceipt,
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
    if (
      submittedRef.current ||
      !currentMemberIds.has(assigneeUserId)
    ) {
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

    if (createdReceiptRef.current || submittedRef.current) {
      await resumeCreatedTask();
      return;
    }

    if (
      submittingRef.current ||
      isSaving ||
      isRefreshing ||
      !isDraftReady ||
      !draftId
    ) {
      return;
    }

    const trimmedTitle = taskTitle.trim();

    const validationErrors = validateTaskForm({
      taskTitle,
      dueDate,
      assigneeIds: validAssigneeIds,
    });

    if (
      !validationErrors.dueDate &&
      projectStartDate &&
      dueDate &&
      dueDate < projectStartDate
    ) {
      validationErrors.dueDate =
        'Due date cannot be earlier than the project start date.';
    }

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    submittingRef.current = true;

    const requestId = {};
    activeSubmissionRef.current = requestId;

    const token = createSubmissionToken();

    setErrors({});
    setIsSaving(true);

    const input: CreateTaskRequest = {
      taskTitle: trimmedTitle,
      taskDescription: taskDescription.trim() || null,
      priority,
      dueDate,
      assigneeIds: validAssigneeIds,
    };

    const isCurrent = () =>
      isCurrentSubmission(requestId);

    const recordCreatedTask = (
      taskId: number,
    ): CreatedTaskReceipt => {
      const receipt: CreatedTaskReceipt = {
        taskId,
        userId,
        projectId,
        draftId,
        token,
      };

      submittedRef.current = true;
      createdReceiptRef.current = receipt;

      setIsSubmitted(true);

      const saved = safeSetSessionStorage(
        createdTaskStorageKey!,
        JSON.stringify(receipt),
      );

      safeRemoveSessionStorage(draftKey!);

      if (isCurrent()) {
        setCreatedReceipt(receipt);
        setIsDraftReady(true);

        if (!saved) {
          setErrors({
            general:
              'The task was created, but the browser could not save its confirmation. Do not submit again. Keep this page open and retry session verification.',
          });
        }
      }

      return receipt;
    };

    const performSubmission = async () => {
      if (!isCurrent()) return;

      const existingReceipt = createdReceiptRef.current;

      if (existingReceipt || submittedRef.current) {
        if (existingReceipt) {
          await verifyCreatedTaskReceipt(
            requestId,
            existingReceipt,
          );
        }

        return;
      }

      const accountBeforeSubmit =
        await verifySubmissionAccount(requestId);

      if (!isCurrent()) return;

      if (accountBeforeSubmit === 'stale') return;
      if (accountBeforeSubmit === 'different-user') return;

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
      if (!isCurrent()) return;

      const storedReceipt = parseCreatedTaskReceipt(
        safeGetSessionStorage(createdTaskStorageKey!),
        userId,
        projectId,
        draftId,
      );

      if (storedReceipt) {
        submittedRef.current = true;
        createdReceiptRef.current = storedReceipt;

        setIsSubmitted(true);
        setCreatedReceipt(storedReceipt);

        safeRemoveSessionStorage(draftKey!);

        await verifyCreatedTaskReceipt(
          requestId,
          storedReceipt,
        );

        return;
      }

      try {
        const id = parseRouteId(projectId, 'project ID');

        const createdTask = await taskApi.createTask(
          id,
          input,
        );

        if (
          !Number.isSafeInteger(createdTask.taskId) ||
          createdTask.taskId <= 0
        ) {
          throw new Error(
            'The server returned an invalid task ID after creation.',
          );
        }

        const receipt = recordCreatedTask(
          createdTask.taskId,
        );

        if (!isCurrent()) return;

        await verifyCreatedTaskReceipt(
          requestId,
          receipt,
        );
      } catch (error) {
        console.error('Failed to create task:', error);

        if (!isCurrent()) return;

        const existingReceipt = createdReceiptRef.current;

        if (existingReceipt || submittedRef.current) {
          if (existingReceipt) {
            await verifyCreatedTaskReceipt(
              requestId,
              existingReceipt,
            );
          }

          return;
        }

        const accountAfterFailure =
          await verifySubmissionAccount(requestId);

        if (!isCurrent()) return;

        if (accountAfterFailure === 'stale') return;
        if (accountAfterFailure === 'different-user') return;

        if (accountAfterFailure === 'logged-out') {
          router.replace('/login');
          return;
        }

        if (accountAfterFailure === 'unavailable') {
          setErrors({
            general:
              'Unable to verify your account after the request failed. Your draft has been kept. Please verify your session before trying again.',
          });
          return;
        }

        if (accountAfterFailure !== 'same-user') return;
        if (!isCurrent()) return;

        if (error instanceof ApiRequestError) {
          const serverErrors = mapTaskServerErrors(
            error.details,
          );

          if (error.status === 401) {
            serverErrors.general =
              'Your request could not be authenticated. Please try again.';
          } else if (error.status === 403) {
            serverErrors.general =
              'You do not have permission to create a task in this project.';
          } else if (
            Object.keys(serverErrors).length > 0
          ) {
            serverErrors.general =
              error.message ||
              'Please check the highlighted fields.';
          } else {
            serverErrors.general =
              error.message ||
              'Unable to create task. Please try again.';
          }

          setErrors(serverErrors);
        } else {
          setErrors({
            general:
              'An unexpected error occurred. Your draft has been kept. Please try again.',
          });
        }
      }
    };

    try {
      await performSubmission();
    } catch (error) {
      console.error('Failed to submit task:', error);

      if (isCurrent()) {
        if (createdReceiptRef.current) {
          setErrors({
            general:
              'The task was created, but your session could not be verified. Please retry verification. Do not create the task again.',
          });
        } else {
          setErrors({
            general:
              'Unable to submit the task. Your draft has been kept. Please try again.',
          });
        }
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

  if (createdReceipt) {
    return (
      <div className="relative min-w-0 pb-8 [overflow-wrap:anywhere]">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage: WORKSPACE_PATTERN_BG,
            backgroundRepeat: 'repeat',
            backgroundSize: '140px 140px',
          }}
        />

        <div className="relative z-[1] mx-auto w-full max-w-2xl rounded-2xl border border-[#cfc9e8] bg-white/95 p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)] sm:p-8">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>

          <h1 className="text-[22px] font-extrabold text-[#1f1f1f]">
            Task created successfully
          </h1>

          <p className="mt-2 text-[13.5px] leading-relaxed text-[#6e6b7b]">
            Your task has already been created. We need to verify your
            session before opening it. Do not create this task again.
          </p>

          {errors.general && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] font-medium text-red-700"
            >
              {errors.general}
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => void resumeCreatedTask()}
              className="min-h-11 rounded-xl bg-[#5B44BA] hover:bg-[#4a35a3] px-6 py-3 text-[13.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.25)] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving
                ? 'Verifying session...'
                : 'Verify session and open task'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (session.status === 'error') {
    return (
      <ProtectedState
        status="error"
        onRetry={onRetry}
      />
    );
  }

  if (isRefreshing || !draftId || !isDraftReady) {
    return (
      <ProtectedState
        status="loading"
        onRetry={onRetry}
      />
    );
  }

  const selectedPriorityOption =
    PRIORITY_OPTIONS.find((opt) => opt.value === priority) ??
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

      <div className="relative z-[1] mx-auto w-full max-w-4xl min-w-0">
        {/* FRAMED PURPLE HEADER BANNER */}
        <div className="relative mb-6 overflow-hidden rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 py-6 sm:px-9 sm:py-7 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
          {/* Soft decorative circles & pattern */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-white/[0.07]" />
            <div className="absolute right-8 -top-12 h-60 w-60 rounded-full bg-white/[0.08]" />
            <div className="absolute right-44 bottom-2 h-36 w-36 rounded-full bg-white/[0.06]" />

            <svg
              viewBox="0 0 900 180"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
              className="h-full w-full"
            >
              <g
                stroke="#FFFFFF"
                strokeOpacity="0.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M642 36L644.6 44.4L653 47L644.6 49.6L642 58L639.4 49.6L631 47L639.4 44.4L642 36Z"
                  strokeWidth="1.7"
                />
                <path d="M532 124V136M526 130H538" strokeWidth="1.9" />
                <path d="M746 32V42M741 37H751" strokeWidth="1.8" />
                <rect
                  x="788"
                  y="108"
                  width="14"
                  height="14"
                  rx="3.8"
                  transform="rotate(45 795 115)"
                  strokeWidth="1.8"
                />
                <g transform="translate(836 52)">
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
                <circle cx="584" cy="68" r="5.5" strokeWidth="1.8" />
              </g>
            </svg>
          </div>

          <div className="relative z-[1]">
            <nav
              aria-label="Breadcrumb"
              className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-white/80"
            >
              <Link
                href="/projects"
                className="font-medium hover:text-white transition-colors"
              >
                Projects
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <Link
                href={`/projects/${projectId}`}
                className="font-medium hover:text-white transition-colors break-words"
              >
                {data.project.projectName}
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <span className="font-bold text-white">Create Task</span>
            </nav>

            <div className="flex min-w-0 items-start gap-4">
              <Link
                href={`/projects/${projectId}`}
                aria-label="Back to Project"
                className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#5B44BA] shadow-[0_4px_14px_rgba(35,25,66,0.16)] hover:bg-[#f4f0ff] hover:text-[#452ea0] transition-all"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
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
                  Create Task
                </h1>
                <p className="mt-1 text-[13.5px] leading-relaxed text-white/85">
                  Add a new task to this project and assign it to your team members.
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
          className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 shadow-[0_4px_18px_rgba(35,25,66,0.05)] sm:p-7 md:p-8"
        >
          <fieldset
            disabled={isSaving || isSubmitted}
            className="contents"
          >
            {errors.general && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] font-medium text-red-700"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{errors.general}</span>
              </div>
            )}

            {/* TASK TITLE */}
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="taskTitle"
                  className="text-[13px] font-bold text-[#1f1f1f]"
                >
                  Task title <span className="text-rose-500">*</span>
                </label>

                <span className="text-[11.5px] font-medium text-[#7c788c] tabular-nums">
                  {taskTitle.length}/200
                </span>
              </div>

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
                className={`w-full rounded-xl border px-4 py-3 text-[13.5px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6] transition-all ${
                  errors.taskTitle
                    ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-2 focus:ring-red-500/15'
                    : 'border-[#cfc9e8] bg-[#f8f6fe] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15'
                }`}
                aria-invalid={Boolean(errors.taskTitle)}
              />

              {errors.taskTitle && (
                <p className="mt-1.5 text-[12px] font-medium text-red-600">
                  {errors.taskTitle}
                </p>
              )}
            </div>

            {/* DESCRIPTION */}
            <div className="mb-6">
              <label
                htmlFor="taskDescription"
                className="mb-2 block text-[13px] font-bold text-[#1f1f1f]"
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
                className="w-full resize-y rounded-xl border border-[#cfc9e8] bg-[#f8f6fe] px-4 py-3 text-[13.5px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15 transition-all"
              />
            </div>

            {/* PRIORITY & DUE DATE */}
            <div className="mb-6 grid gap-5 sm:grid-cols-2">
              {/* CUSTOM PRIORITY DROPDOWN */}
              <div>
                <label
                  htmlFor="priority"
                  className="mb-2 block text-[13px] font-bold text-[#1f1f1f]"
                >
                  Priority <span className="text-rose-500">*</span>
                </label>

                <KeyboardPopup open={visiblePriorityOpen} onClose={() => setIsPriorityOpen(false)} ref={priorityDropdownRef} className="relative">
                  <button
                    id="priority"
                    type="button"
                    disabled={isBusy || isSubmitted}
                    aria-haspopup="listbox"
                    aria-expanded={visiblePriorityOpen}
                    onClick={() => setIsPriorityOpen((prev) => !prev)}
                    className={`flex min-h-[46px] w-full items-center justify-between gap-2.5 rounded-xl border px-4 py-2.5 text-[13.5px] font-medium outline-none transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 ${
                      visiblePriorityOpen
                        ? 'border-[#5B44BA] bg-white text-[#1f1f1f] ring-2 ring-[#5B44BA]/15'
                        : 'border-[#cfc9e8] bg-[#f8f6fe] hover:border-[#9e8ce6] hover:bg-white text-[#1f1f1f]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${selectedPriorityOption.badgeClass}`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${selectedPriorityOption.dotClass}`}
                        />
                        {selectedPriorityOption.label}
                      </span>
                    </span>

                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`shrink-0 transition-transform duration-150 ${
                        visiblePriorityOpen
                          ? 'rotate-180 text-[#5B44BA]'
                          : 'text-[#6e6b7b]'
                      }`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {visiblePriorityOpen && (
                    <div
                      role="listbox"
                      aria-label="Priority options"
                      className="absolute left-0 right-0 top-full z-30 mt-1.5 rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                    >
                      {PRIORITY_OPTIONS.map((option) => {
                        const isSelected = priority === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            tabIndex={-1}
                            aria-selected={isSelected}
                            onClick={() => {
                              setPriority(option.value);
                              clearError('priority');
                              setIsPriorityOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                                : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold ${option.badgeClass}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${option.dotClass}`}
                                />
                                {option.label}
                              </span>
                            </span>

                            {isSelected && (
                              <svg
                                width="14"
                                height="14"
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
                </KeyboardPopup>

                {errors.priority && (
                  <p className="mt-1.5 text-[12px] font-medium text-red-600">
                    {errors.priority}
                  </p>
                )}
              </div>

              {/* DUE DATE */}
              <div>
                <label
                  htmlFor="dueDate"
                  className="mb-2 block text-[13px] font-bold text-[#1f1f1f]"
                >
                  Due date <span className="text-rose-500">*</span>
                </label>

                <input
                  id="dueDate"
                  type="date"
                  min={projectStartDate}
                  value={dueDate}
                  onChange={(event) => {
                    setDueDate(event.target.value);
                    clearError('dueDate');
                  }}
                  className={`min-h-[46px] w-full rounded-xl border px-4 py-2.5 text-[13.5px] text-[#1f1f1f] outline-none transition-all ${
                    errors.dueDate
                      ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-2 focus:ring-red-500/15'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15'
                  }`}
                  aria-invalid={Boolean(errors.dueDate)}
                />

                {errors.dueDate && (
                  <p className="mt-1.5 text-[12px] font-medium text-red-600">
                    {errors.dueDate}
                  </p>
                )}
              </div>
            </div>

            {/* ASSIGNEE SELECTOR */}
            <div
              className={
                errors.assigneeIds
                  ? 'rounded-2xl border-2 border-red-400 bg-red-50/30 p-4 ring-4 ring-red-500/10 transition-all'
                  : 'transition-all'
              }
            >
              <AssigneeSelector
                members={data.members}
                selectedIds={validAssigneeIds}
                error={errors.assigneeIds}
                disabled={isBusy || isSubmitted}
                onToggle={toggleAssignee}
              />
            </div>

            {/* ACTION BUTTONS */}
            <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-[#e5e0f5] pt-5">
              <button
                type="button"
                disabled={isBusy || isSubmitted}
                onClick={() =>
                  router.push(`/projects/${projectId}`)
                }
                className="min-h-11 rounded-xl border border-[#cfc9e8] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#3d3a4b] hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  isBusy ||
                  isSubmitted ||
                  !isDraftReady
                }
                className="min-h-11 inline-flex items-center gap-2 rounded-xl bg-[#5B44BA] hover:bg-[#4a35a3] px-6 py-2.5 text-[13.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.25)] hover:shadow-[0_6px_20px_rgba(91,68,186,0.34)] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>{isSaving ? 'Creating...' : 'Create Task'}</span>
              </button>
            </div>
          </fieldset>
        </form>
      </div>
    </div>
  );
}

function CreateTaskContent({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();

  const {
    session,
    refreshSession,
  } = useSession();

  const isInvalidId =
    tryParseRouteId(projectId, 'project ID') === null;

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
    retained,
    retainedUserId,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: false,
  });

  const isNotFound =
    isInvalidId ||
    (status === 'error' && (httpStatus === 400 || httpStatus === 404));

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
    (
      session.status === 'loading' ||
      session.status === 'error' ||
      (
        session.status === 'ready' &&
        session.user?.userId === retainedUserId &&
        (
          status === 'loading' ||
          isRefreshing
        )
      )
    );

  if (canKeepPreviousForm) {
    return (
      <CreateTaskForm
        key={`${retainedUserId}:${projectId}`}
        projectId={projectId}
        userId={retainedUserId}
        data={retained}
        isRefreshing={
          session.status === 'loading' ||
          (
            session.status === 'ready' &&
            isRefreshing
          )
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

  if (session.status === 'error') {
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

  if (session.status === 'no-profile') {
    return (
      <ProtectedState
        status="error"
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
          Unable to load the task form. Please try again.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white hover:bg-[#f6f3ff] hover:text-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#333333] transition-colors cursor-pointer"
          >
            Back to Projects
          </button>

          <button
            type="button"
            onClick={handleRetry}
            className="min-h-10 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-4 py-2 text-[12.5px] font-bold text-[#452ea0] hover:text-white transition-colors cursor-pointer"
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
    <CreateTaskForm
      key={`${userId}:${projectId}`}
      projectId={projectId}
      userId={userId}
      data={data}
      isRefreshing={isRefreshing}
      onRetry={handleRetry}
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