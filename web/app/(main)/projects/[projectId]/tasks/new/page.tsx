
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
  | 'unavailable';

const DRAFT_STORAGE_PREFIX = 'mobg:create-task-draft:';
const SUBMISSION_STORAGE_PREFIX = 'mobg:create-task-submission:';
const SUBMISSION_LOCK_PREFIX = 'mobg:create-task-lock:';

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

function getSubmissionStorageKey(
  userId: number,
  projectId: string,
): string {
  return (
    `${SUBMISSION_STORAGE_PREFIX}` +
    `${encodeURIComponent(String(userId))}:` +
    `${encodeURIComponent(projectId)}`
  );
}

function getSubmissionLockName(
  userId: number,
  projectId: string,
): string {
  return (
    `${SUBMISSION_LOCK_PREFIX}` +
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

function createSubmissionToken(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * ตรวจสอบสถานะ Submission จาก Web Locks และ localStorage
 *
 * Web Locks เป็นตัวตัดสินว่ามี Submission ทำงานอยู่จริงหรือไม่
 * Marker มีไว้แจ้งสถานะให้แท็บอื่นทราบเท่านั้น
 *
 * ตรวจ Web Lock ก่อนเสมอ เพื่อป้องกันช่วงเวลาที่ Lock ถูกถือแล้ว
 * แต่ Marker ยังเขียนลง localStorage ไม่เสร็จ
 *
 * หากพบ Marker แต่ไม่มี Lock แล้ว จะลบ Marker ที่ค้างอยู่
 * เช่น กรณีแท็บเดิมถูกปิดระหว่าง Submit
 */
async function hasActiveSubmission(
  storageKey: string,
  lockName: string,
): Promise<boolean> {
  try {
    const lockManager = navigator.locks as LockManager & {
      query?: () => Promise<LockQueryResult>;
    };

    // ถ้าตรวจสอบ Lock ไม่ได้ ให้ถือว่ายัง Busy ไว้ก่อน
    if (!lockManager.query) {
      return true;
    }

    const lockState = await lockManager.query();

    const isLocked = [
      ...(lockState.held ?? []),
      ...(lockState.pending ?? []),
    ].some((lock) => lock.name === lockName);

    // มี Lock อยู่จริง ไม่ว่าจะมี Marker แล้วหรือไม่
    if (isLocked) {
      return true;
    }

    // ไม่มี Lock แล้ว จึงค่อยตรวจ Marker ที่อาจค้างอยู่
    const raw = localStorage.getItem(storageKey);

    if (!raw) {
      return false;
    }

    const marker = JSON.parse(raw) as Partial<SubmissionLock>;

    if (typeof marker.token !== 'string') {
      localStorage.removeItem(storageKey);
      return false;
    }

    // ตรวจ Token อีกครั้งก่อนลบ ป้องกันลบ Marker ใหม่
    const latestRaw = localStorage.getItem(storageKey);

    if (latestRaw === raw) {
      localStorage.removeItem(storageKey);
    }

    return false;
  } catch (error) {
    console.error(
      'Failed to check task submission state:',
      error,
    );

    // Fail closed: หากตรวจสถานะไม่ได้ ไม่อนุญาตให้ Submit
    return true;
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

  const { replaceSession } = useSession();

  const draftKey = getDraftStorageKey(userId, projectId);

  const submissionStorageKey = getSubmissionStorageKey(
    userId,
    projectId,
  );

  const submissionLockName = getSubmissionLockName(
    userId,
    projectId,
  );

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
    };
  }, []);

  /**
   * ตรวจสอบว่าบัญชีที่กำลังใช้งานยังเป็นบัญชีเจ้าของ Form หรือไม่
   *
   * ไม่ใช้แค่ Session ใน React เพราะ Session ของแต่ละแท็บ
   * ไม่ได้เปลี่ยนพร้อมกันทันทีเมื่อ Login/Logout อีกแท็บ
   *
   * จึงตรวจ /api/me จาก Backend โดยตรง
   */
  const verifySubmissionAccount =
    useCallback(async (): Promise<SubmissionAccountStatus> => {
      let currentUser;

      try {
        currentUser = await getCurrentUser();
      } catch (error) {
        console.error(
          'Failed to verify account during task submission:',
          error,
        );

        return 'unavailable';
      }

      if (currentUser?.userId === userId) {
        return 'same-user';
      }

      // พบว่าเป็นบัญชีอื่น หรือไม่มี Session แล้ว
      // อัปเดต Session ปัจจุบันเพื่อให้หน้าเปลี่ยนตามบัญชีจริง
      const updated = replaceSession(
        currentUser,
        currentUser ? 'ready' : 'login-required',
      );

      if (!updated) {
        return 'unavailable';
      }

      return currentUser
        ? 'different-user'
        : 'logged-out';
    }, [replaceSession, userId]);

  // ตรวจสอบสถานะ Submission จากแท็บอื่น
  useEffect(() => {
    let cancelled = false;

    async function refreshSubmissionState() {
      const active = await hasActiveSubmission(
        submissionStorageKey,
        submissionLockName,
      );

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

  // โหลด Draft ของบัญชีและโปรเจกต์นี้เท่านั้น
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
        if (isMountedRef.current) {
          setIsDraftReady(true);
        }
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [draftKey, currentMemberIds]);

  // บันทึก Draft หลังจากโหลด Draft เดิมเสร็จแล้ว
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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    // ป้องกันการกดซ้ำในแท็บเดียวกัน
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

    if (!navigator.locks) {
      setErrors({
        general:
          'Your browser does not support safe task submission across tabs. Please use an updated browser.',
      });
      return;
    }

    submittingRef.current = true;

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

    try {
      const id = parseRouteId(projectId, 'project ID');

      await navigator.locks.request(
        submissionLockName,
        {
          mode: 'exclusive',
          ifAvailable: true,
        },
        async (lock) => {
          if (!lock) {
            if (isMountedRef.current) {
              setErrors({
                general:
                  'A task submission is already in progress in another tab. Please wait until it finishes.',
              });
            }

            return;
          }

          // ตรวจบัญชีก่อนส่ง POST ป้องกัน Form เก่าที่ค้างอยู่
          // ส่ง Request ในนามบัญชีเดิมหลังเปลี่ยนบัญชีแล้ว
          const accountBeforeSubmit =
            await verifySubmissionAccount();

          if (accountBeforeSubmit !== 'same-user') {
            if (
              accountBeforeSubmit === 'logged-out' &&
              isMountedRef.current
            ) {
              router.replace('/login');
            } else if (
              accountBeforeSubmit === 'unavailable' &&
              isMountedRef.current
            ) {
              setErrors({
                general:
                  'Unable to verify your account. Please try again.',
              });
            }

            return;
          }

          // ประกาศสถานะให้แท็บอื่นทราบ หลังจากได้ Web Lock แล้ว
          const marker: SubmissionLock = {
            token,
          };

          try {
            localStorage.setItem(
              submissionStorageKey,
              JSON.stringify(marker),
            );

            if (isMountedRef.current) {
              setIsOtherTabSaving(true);
            }
          } catch (storageError) {
            console.error(
              'Failed to publish submission state:',
              storageError,
            );

            if (isMountedRef.current) {
              setErrors({
                general:
                  'Unable to coordinate task submission across tabs. Please check browser storage settings.',
              });
            }

            return;
          }

          try {
            const createdTask = await taskApi.createTask(id, input);

            if (!isMountedRef.current) {
              return;
            }

            // ตรวจบัญชีอีกครั้งก่อนทำ Side Effect จาก POST
            // เช่น ลบ Draft หรือเปลี่ยนหน้า
            const accountAfterSubmit =
              await verifySubmissionAccount();

            if (accountAfterSubmit === 'different-user') {
              return;
            }

            if (accountAfterSubmit === 'logged-out') {
              if (isMountedRef.current) {
                router.replace('/login');
              }

              return;
            }

            if (accountAfterSubmit === 'unavailable') {
              if (isMountedRef.current) {
                setErrors({
                  general:
                    'The task may have been created, but your account could not be verified. Please refresh the page before trying again.',
                });
              }

              return;
            }

            // ลบ Draft เฉพาะเมื่อยืนยันแล้วว่ายังเป็นบัญชีเดิม
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

            if (!isMountedRef.current) {
              return;
            }

            // แม้ POST จะตอบ 401 ก็ต้องตรวจบัญชีปัจจุบันก่อน
            // ห้าม Redirect จาก Response ของบัญชีเก่าโดยตรง
            const accountAfterFailure =
              await verifySubmissionAccount();

            if (accountAfterFailure === 'different-user') {
              return;
            }

            if (accountAfterFailure === 'logged-out') {
              if (isMountedRef.current) {
                router.replace('/login');
              }

              return;
            }

            if (accountAfterFailure === 'unavailable') {
              if (isMountedRef.current) {
                setErrors({
                  general:
                    'Unable to verify your account after the request failed. Please refresh the page before trying again.',
                });
              }

              return;
            }

            // ยืนยันแล้วว่ายังเป็นบัญชีเดิม จึงแสดง Error ได้
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
                  'An unexpected error occurred. Please try again.',
              });
            }
          } finally {
            // ลบเฉพาะ Marker ของ Submission นี้
            try {
              const raw = localStorage.getItem(
                submissionStorageKey,
              );

              if (raw) {
                const currentMarker =
                  JSON.parse(raw) as Partial<SubmissionLock>;

                if (currentMarker.token === token) {
                  localStorage.removeItem(submissionStorageKey);
                }
              }
            } catch (storageError) {
              console.error(
                'Failed to clear submission marker:',
                storageError,
              );
            }

            if (isMountedRef.current) {
              setIsOtherTabSaving(false);
            }
          }
        },
      );
    } catch (error) {
      console.error(
        'Failed to acquire task submission lock:',
        error,
      );

      if (isMountedRef.current) {
        setErrors({
          general:
            'Unable to submit the task safely. Please try again.',
        });
      }
    } finally {
      submittingRef.current = false;

      if (isMountedRef.current) {
        setIsSaving(false);
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

        {/* Assignees */}
        <AssigneeSelector
          members={data.members}
          selectedIds={validAssigneeIds}
          error={errors.assigneeIds}
          disabled={isBusy || isRefreshing}
          onToggle={toggleAssignee}
        />

        {/* Actions */}
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
            disabled={
              isBusy ||
              isRefreshing ||
              !isDraftReady
            }
            className="min-h-11 rounded-xl bg-[#222222] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? 'Creating...'
              : isOtherTabSaving
                ? 'Creating in another tab...'
                : 'Create Task'}
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

    // เก็บ Form เดิมไว้ระหว่างตรวจ Session
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

  // ระหว่าง Session กำลัง Refresh:
  // คง Form เดิมไว้ด้วย retained เพื่อไม่ให้ Form ถูก Unmount
  // และทำให้ Error จาก POST ที่ยังทำงานอยู่หายไป
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
