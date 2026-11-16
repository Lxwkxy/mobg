
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
import { useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import AssigneeSelector from '@/components/tasks/AssigneeSelector';

import { getCurrentUser } from '@/lib/authService';
import { useSession } from '@/lib/SessionProvider';
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

type SubmissionLock = {
  token: string;
};

type LockQueryResult = {
  held?: Array<{ name: string }>;
  pending?: Array<{ name: string }>;
};

type SubmissionAccountStatus =
  | 'same-user'
  | 'different-user'
  | 'logged-out'
  | 'unavailable'
  | 'stale';

const DRAFT_STORAGE_PREFIX = 'mobg:create-task-draft:';
const SUBMISSION_STORAGE_PREFIX = 'mobg:create-task-submission:';
const SUBMISSION_LOCK_PREFIX = 'mobg:create-task-lock:';

function getDraftStorageKey(userId: number, projectId: string) {
  return `${DRAFT_STORAGE_PREFIX}${encodeURIComponent(String(userId))}:${encodeURIComponent(projectId)}`;
}

function getSubmissionStorageKey(userId: number, projectId: string) {
  return `${SUBMISSION_STORAGE_PREFIX}${encodeURIComponent(String(userId))}:${encodeURIComponent(projectId)}`;
}

function getSubmissionLockName(userId: number, projectId: string) {
  return `${SUBMISSION_LOCK_PREFIX}${encodeURIComponent(String(userId))}:${encodeURIComponent(projectId)}`;
}

function safeGetStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetStorage(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function safeRemoveStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage may be disabled. Submission must still be possible.
  }
}

function clearUserDrafts(userId: number) {
  try {
    const prefix = `${DRAFT_STORAGE_PREFIX}${encodeURIComponent(String(userId))}:`;
    const keys: string[] = [];

    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);

      if (key?.startsWith(prefix)) {
        keys.push(key);
      }
    }

    keys.forEach((key) => safeRemoveStorage(key));
  } catch {
    // Ignore unavailable storage.
  }
}

function createSubmissionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * ตรวจสถานะ Web Lock ข้ามแท็บ
 * ถ้า Browser ไม่รองรับหรือ query ล้มเหลว จะถือว่าไม่ทราบสถานะ
 * และไม่บล็อกการ Submit
 */
async function hasActiveSubmission(
  lockName: string,
): Promise<boolean> {
  try {
    if (
      typeof navigator === 'undefined' ||
      !navigator.locks ||
      typeof navigator.locks.query !== 'function'
    ) {
      return false;
    }

    const lockManager = navigator.locks as LockManager & {
      query: () => Promise<LockQueryResult>;
    };

    const state = await lockManager.query();

    return [
      ...(state.held ?? []),
      ...(state.pending ?? []),
    ].some((lock) => lock.name === lockName);
  } catch {
    return false;
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

  // อ่าน Session ล่าสุดโดยไม่แก้ Ref ระหว่าง Render
  const sessionRef = useRef(session);

  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const draftKey = getDraftStorageKey(userId, projectId);
  const submissionStorageKey = getSubmissionStorageKey(userId, projectId);
  const submissionLockName = getSubmissionLockName(userId, projectId);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>(2);
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<number[]>([]);

  const [isDraftReady, setIsDraftReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOtherTabSaving, setIsOtherTabSaving] = useState(false);
  const [errors, setErrors] = useState<TaskFormErrors>({});

  const isMountedRef = useRef(false);
  const submittingRef = useRef(false);
  const activeSubmissionRef = useRef<object | null>(null);

  const isBusy = isSaving || isOtherTabSaving;

  const currentMemberIds = useMemo(
    () => new Set(data.members.map((member) => member.userId)),
    [data.members],
  );

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
        projectId.length > 0
      );
    },
    [projectId, userId],
  );

  /**
   * ใช้ Session ล่าสุดเป็นตัวตัดสิน เมื่อ Revision เปลี่ยน
   *
   * ห้ามใช้ผล getCurrentUser() ของ Request เก่าโดยตรง
   * เพราะอาจเป็นผลของบัญชีก่อนเปลี่ยนบัญชี
   *
   * ถ้า Session ยัง loading จะรอ refreshSession()
   * เพื่อให้ได้ผลตรวจสอบจาก Request ปัจจุบันก่อน
   */
  const resolveLatestSession = useCallback(
    async (
      requestId: object,
    ): Promise<SubmissionAccountStatus> => {
      if (!isCurrentSubmission(requestId)) {
        return 'stale';
      }

      let latestSession = sessionRef.current;

      // ถ้า Ref ยังเป็น Revision เก่า หรือ Session กำลัง Loading
      // ให้รอ Session Refresh ล่าสุดจาก Provider
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

      // ระหว่างรออาจมี Session ใหม่กว่าเข้ามาอีก
      // ห้ามนำผลของ Revision ที่ไม่ใช่ปัจจุบันมาใช้
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

  /**
   * ตรวจสอบบัญชีปัจจุบันจาก Backend
   *
   * หาก Session Revision เปลี่ยนระหว่างรอ Request
   * จะใช้ Session ล่าสุดจาก Provider แทนผล Request เก่า
   */
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

        // ถ้า Revision เปลี่ยนแล้ว ต้องเชื่อ Session ล่าสุด
        // ไม่ใช้ 401/403 จาก Request เก่ามาตัดสิน
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

        return 'unavailable';
      }

      if (!isCurrentSubmission(requestId)) {
        return 'stale';
      }

      // ระหว่างรอ getCurrentUser อาจมีการเปลี่ยนบัญชี
      // จึงต้องตรวจ Revision ก่อนใช้ผลที่ได้รับ
      if (!isCurrentSessionRevision(expectedRevision)) {
        return resolveLatestSession(requestId);
      }

      // ตรวจสอบว่าผลจาก Backend ตรงกับบัญชีของ Form หรือไม่
      if (currentUser?.userId === userId) {
        return 'same-user';
      }

      // ถ้าเป็นบัญชีอื่นหรือไม่ได้ Login
      // อัปเดต Session โดยมี expectedRevision ป้องกัน Request แข่งกัน
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

  // ตรวจสถานะ Submission ข้ามแท็บ
  useEffect(() => {
    let cancelled = false;

    async function refreshSubmissionState() {
      const active = await hasActiveSubmission(submissionLockName);

      if (!cancelled && isMountedRef.current) {
        setIsOtherTabSaving(active);
      }
    }

    void refreshSubmissionState();

    function handleStorage(event: StorageEvent) {
      if (
        event.key === submissionStorageKey ||
        event.key === null
      ) {
        void refreshSubmissionState();
      }
    }

    window.addEventListener('storage', handleStorage);

    return () => {
      cancelled = true;
      window.removeEventListener('storage', handleStorage);
    };
  }, [submissionStorageKey, submissionLockName]);

  // โหลด Draft ของบัญชีและ Project นี้
  useEffect(() => {
    let cancelled = false;

    const frameId = window.requestAnimationFrame(() => {
      try {
        const savedDraft = safeGetStorage(draftKey);

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
        safeRemoveStorage(draftKey);
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
  }, [draftKey, currentMemberIds]);

  // บันทึก Draft หลังโหลดเสร็จ
  useEffect(() => {
    if (!isDraftReady) return;

    const draft: TaskDraft = {
      taskTitle,
      taskDescription,
      priority,
      dueDate,
      assigneeIds: validAssigneeIds,
    };

    safeSetStorage(draftKey, JSON.stringify(draft));
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

    if (
      submittingRef.current ||
      isSaving ||
      isOtherTabSaving ||
      isRefreshing ||
      !isDraftReady
    ) {
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

    const isCurrent = () => isCurrentSubmission(requestId);

    const publishSubmissionMarker = () => {
      safeSetStorage(
        submissionStorageKey,
        JSON.stringify({ token } satisfies SubmissionLock),
      );
    };

    const removeSubmissionMarker = () => {
      const raw = safeGetStorage(submissionStorageKey);

      if (!raw) return;

      try {
        const marker = JSON.parse(raw) as Partial<SubmissionLock>;

        if (marker.token === token) {
          safeRemoveStorage(submissionStorageKey);
        }
      } catch {
        safeRemoveStorage(submissionStorageKey);
      }
    };

    const performSubmission = async () => {
      if (!isCurrent()) return;

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
          general: 'Unable to verify your account. Please try again.',
        });
        return;
      }

      if (accountBeforeSubmit !== 'same-user') return;

      if (!isCurrent()) return;

      publishSubmissionMarker();

      try {
        const id = parseRouteId(projectId, 'project ID');

        const createdTask = await taskApi.createTask(id, input);

        if (!isCurrent()) return;

        const accountAfterSubmit =
          await verifySubmissionAccount(requestId);

        if (!isCurrent()) return;

        if (accountAfterSubmit === 'stale') return;
        if (accountAfterSubmit === 'different-user') return;

        if (accountAfterSubmit === 'logged-out') {
          router.replace('/login');
          return;
        }

        if (accountAfterSubmit === 'unavailable') {
          setErrors({
            general:
              'The task may have been created, but your account could not be verified. Please refresh the page before trying again.',
          });
          return;
        }

        if (accountAfterSubmit !== 'same-user') return;

        if (!isCurrent()) return;

        safeRemoveStorage(draftKey);

        router.push(`/projects/${id}/tasks/${createdTask.taskId}`);
      } catch (error) {
        console.error('Failed to create task:', error);

        if (!isCurrent()) return;

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
              'Unable to verify your account after the request failed. Please refresh the page before trying again.',
          });
          return;
        }

        if (accountAfterFailure !== 'same-user') return;

        if (!isCurrent()) return;

        if (error instanceof ApiRequestError) {
          const serverErrors = mapTaskServerErrors(error.details);

          if (error.status === 401) {
            serverErrors.general =
              'Your request could not be authenticated. Please try again.';
          } else if (error.status === 403) {
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
        removeSubmissionMarker();

        if (isCurrent()) {
          setIsOtherTabSaving(false);
        }
      }
    };

    try {
      const lockManager =
        typeof navigator !== 'undefined'
          ? navigator.locks
          : undefined;

      if (lockManager && typeof lockManager.request === 'function') {
        let callbackStarted = false;

        try {
          await lockManager.request(
            submissionLockName,
            {
              mode: 'exclusive',
              ifAvailable: true,
            },
            async (lock) => {
              callbackStarted = true;

              if (!isCurrent()) return;

              if (!lock) {
                setErrors({
                  general:
                    'A task submission is already in progress in another tab. Please wait until it finishes.',
                });
                return;
              }

              await performSubmission();
            },
          );
        } catch (lockError) {
          console.error('Web Locks unavailable:', lockError);

          if (!callbackStarted && isCurrent()) {
            await performSubmission();
          }
        }
      } else {
        await performSubmission();
      }
    } catch (error) {
      console.error('Failed to submit task:', error);

      if (isCurrent()) {
        setErrors({
          general: 'Unable to submit the task. Please try again.',
        });
      }
    } finally {
      removeSubmissionMarker();

      if (activeSubmissionRef.current === requestId) {
        activeSubmissionRef.current = null;
        submittingRef.current = false;

        if (isMountedRef.current) {
          setIsSaving(false);
          setIsOtherTabSaving(false);
        }
      }
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

      <div className="relative">
        <form
          onSubmit={handleSubmit}
          noValidate
          aria-busy={isRefreshing || isSaving}
          className="rounded-2xl border border-[#e0e0e0] bg-white p-4 shadow-sm sm:p-6 md:p-8"
        >
          <fieldset
            disabled={isRefreshing || isSaving || isOtherTabSaving}
            className="contents"
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

            <AssigneeSelector
              members={data.members}
              selectedIds={validAssigneeIds}
              error={errors.assigneeIds}
              disabled={isBusy || isRefreshing}
              onToggle={toggleAssignee}
            />

            <div className="flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-5">
              <button
                type="button"
                disabled={isBusy || isRefreshing}
                onClick={() => router.push(`/projects/${projectId}/tasks`)}
                className="min-h-11 rounded-xl border border-[#dddddd] px-5 text-[13px] font-medium text-[#444444] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isBusy || isRefreshing || !isDraftReady}
                className="min-h-11 rounded-xl bg-[#222222] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving
                  ? 'Creating...'
                  : isOtherTabSaving
                    ? 'Creating in another tab...'
                    : 'Create Task'}
              </button>
            </div>
          </fieldset>
        </form>

        {isRefreshing && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl border border-[#e0e0e0] bg-white/95"
          >
            <div className="text-center">
              <div className="mx-auto mb-3 h-7 w-7 animate-spin rounded-full border-2 border-[#dddddd] border-t-[#222222]" />
              <p className="text-[13px] font-medium text-[#333333]">
                Verifying your session...
              </p>
              <p className="mt-1 text-[12px] text-[#777777]">
                Your form and draft are being kept safe.
              </p>
            </div>
          </div>
        )}
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
        <p
          role="alert"
          className="mb-4 text-[13px] text-red-600"
        >
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
    status === 'loading' &&
    retained &&
    retainedUserId !== null
  ) {
    return (
      <CreateTaskForm
        key={`${retainedUserId}:${projectId}`}
        projectId={projectId}
        userId={retainedUserId}
        data={retained}
        isRefreshing={true}
        onRetry={retry}
      />
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
