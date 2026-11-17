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

/*
 * สร้างหรือกู้คืน Draft ID ก่อนเริ่ม Render ฝั่ง Client
 *
 * ใช้ sessionStorage เพื่อแยกข้อมูลของแต่ละ Tab
 * ฝั่ง Server จะคืน null เพราะไม่มี window
 *
 * Render ฝั่ง Server และ Client ยังคงแสดง Loading UI เหมือนกัน
 * จึงไม่ทำให้ HTML ที่แสดงตอน Hydration แตกต่างกัน
 */
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

  const sessionRef = useRef(session);

  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const activeDraftStorageKey = getActiveDraftStorageKey(
    userId,
    projectId,
  );

  /*
   * ใช้ Lazy Initializer แทน useEffect + setDraftId
   * เพื่อไม่ให้เกิด setState synchronously ภายใน Effect
   */
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

  const currentMemberIds = useMemo(
    () => new Set(data.members.map((member) => member.userId)),
    [data.members],
  );

  const validAssigneeIds = useMemo(
    () => assigneeIds.filter((id) => currentMemberIds.has(id)),
    [assigneeIds, currentMemberIds],
  );

  const isBusy = isSaving;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      activeSubmissionRef.current = null;

      /*
       * ลบ Receipt หลังจากเริ่มนำทางไป Task แล้วเท่านั้น
       *
       * ถ้าการนำทางยังไม่เริ่มหรือผู้ใช้ต้อง Retry
       * Receipt จะยังอยู่เพื่อป้องกันการ POST ซ้ำ
       */
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

  /*
   * ตรวจบัญชีก่อนและหลังการส่งคำขอ
   *
   * ใช้ Session revision ป้องกัน Request เก่า
   * เปลี่ยน Session ของบัญชีใหม่
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

        /*
         * /api/me ล้มเหลว:
         * เปลี่ยน Session เป็น error เพื่อให้หน้าหลัก
         * ซ่อนข้อมูลบัญชีเดิมและแสดง Retry
         */
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

  /*
   * ตรวจสอบ Receipt หลัง POST สำเร็จ
   *
   * ไม่มีการเรียก createTask ในฟังก์ชันนี้
   */
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
          /*
           * เก็บ Receipt ไว้จนกว่าจะเริ่มนำทางจริง
           * ป้องกัน POST ซ้ำหาก router.push ยังไม่เปลี่ยนหน้า
           */
          navigationStartedRef.current = true;

          router.push(
            `/projects/${receipt.projectId}/tasks/${receipt.taskId}`,
          );

          return;
        }

        if (latestSession.status === 'login-required') {
          /*
           * ไม่ลบ Receipt เมื่อส่งผู้ใช้ไป Login
           * เพื่อให้กลับมาตรวจ Task เดิมได้
           */
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

  /*
   * Retry หลัง POST สำเร็จ
   *
   * ตรวจ Session และเปิด Task เดิมเท่านั้น
   * ไม่มีการ POST ซ้ำ
   */
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

  /*
   * โหลด Receipt และ Draft ของฟอร์มนี้
   *
   * Receipt มีความสำคัญกว่า Draft เสมอ
   * หากพบ Receipt จะไม่คืนค่าฟอร์มเพื่อป้องกัน POST ซ้ำ
   *
   * ไม่เรียก setIsDraftReady(false) ใน Effect
   * เพราะ State เริ่มต้นเป็น false อยู่แล้ว
   */
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

  /*
   * บันทึก Draft เฉพาะก่อนสร้าง Task สำเร็จ
   *
   * submittedRef ป้องกันการบันทึก Draft กลับมา
   * แม้ navigation จะล่าช้าหรือมีการ render ใหม่
   */
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

    /*
     * หากมี Receipt แล้ว ห้ามสร้าง Task ใหม่
     * ให้ตรวจ Session และเปิด Task เดิมเท่านั้น
     */
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

      /*
       * ล็อกการ Submit ในหน่วยความจำก่อนทำ Storage
       * เพื่อไม่ให้เกิด POST ซ้ำในระหว่าง render
       */
      submittedRef.current = true;
      createdReceiptRef.current = receipt;

      /*
       * ใช้ State ควบคุม UI แทนการอ่าน Ref ระหว่าง Render
       */
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

      /*
       * ตรวจ Receipt ซ้ำก่อน POST
       * ป้องกันกรณีมีการสร้างสำเร็จไปแล้ว
       */
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

      /*
       * ตรวจ Receipt จาก Storage อีกครั้งก่อน POST
       */
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

        /*
         * หลังได้รับ taskId ต้องบันทึก Receipt ทันที
         * ก่อนตรวจ Session หรือเริ่มนำทาง
         */
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

        /*
         * หากมี Receipt แปลว่า POST สำเร็จไปแล้ว
         * ห้ามส่ง POST ใหม่ไม่ว่ากรณีใด
         */
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

  /*
   * แสดง Receipt ก่อน Loading UI
   * ป้องกันการกลับไปกด Submit หลังสร้างสำเร็จ
   */
  if (createdReceipt) {
    return (
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[#e0e0e0] bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-700">
          <span className="text-xl">✓</span>
        </div>

        <h1 className="text-xl font-bold text-[#222222]">
          Task created successfully
        </h1>

        <p className="mt-2 text-[13px] leading-6 text-[#666666]">
          Your task has already been created. We need to verify your
          session before opening it. Do not create this task again.
        </p>

        {errors.general && (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-red-300 bg-red-50 p-3.5 text-[13px] text-red-700"
          >
            {errors.general}
          </div>
        )}

        <div className="mt-6">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => void resumeCreatedTask()}
            className="min-h-11 rounded-xl bg-[#222222] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving
              ? 'Verifying session...'
              : 'Verify session and open task'}
          </button>
        </div>
      </div>
    );
  }

  /*
   * เมื่อ Session ตรวจล้มเหลว:
   * เก็บ CreateTaskForm instance ไว้
   * แต่ซ่อนข้อมูลเดิมและแสดง Error พร้อม Retry
   *
   * ต้องตรวจ error ก่อน loading
   * เพื่อไม่ให้หน้า Error กลับไปค้างที่ Loading
   */
  if (session.status === 'error') {
    return (
      <ProtectedState
        status="error"
        onRetry={onRetry}
      />
    );
  }

  /*
   * ระหว่างตรวจ Session:
   * เก็บ Form instance ไว้ แต่ซ่อนข้อมูลเดิมด้วย Loading UI
   */
  if (isRefreshing || !draftId || !isDraftReady) {
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
        aria-busy={isSaving}
        className="rounded-2xl border border-[#e0e0e0] bg-white p-4 shadow-sm sm:p-6 md:p-8"
      >
        <fieldset
          disabled={isSaving || isSubmitted}
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

          <AssigneeSelector
            members={data.members}
            selectedIds={validAssigneeIds}
            error={errors.assigneeIds}
            disabled={isBusy || isSubmitted}
            onToggle={toggleAssignee}
          />

          <div className="flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-5">
            <button
              type="button"
              disabled={isBusy || isSubmitted}
              onClick={() =>
                router.push(`/projects/${projectId}/tasks`)
              }
              className="min-h-11 rounded-xl border border-[#dddddd] px-5 text-[13px] font-medium text-[#444444] hover:bg-[#f7f7f7] disabled:cursor-not-allowed disabled:opacity-50"
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
              className="min-h-11 rounded-xl bg-[#222222] px-6 py-3 text-[13px] font-semibold text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </fieldset>
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

  const {
    session,
    refreshSession,
  } = useSession();

  const isInvalidId =
    !/^\d+$/.test(projectId) ||
    !Number.isSafeInteger(Number(projectId)) ||
    Number(projectId) <= 0;

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

  /*
   * Retry ต้องตรวจ Session ใหม่ก่อนโหลดข้อมูล Project
   */
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

  /*
   * เก็บ Form เดิมไว้ระหว่างตรวจ Session
   *
   * กรณี loading:
   * Session กำลังตรวจสอบ จึงยังไม่ทราบว่าเป็นบัญชีเดิมหรือไม่
   * เก็บ Form ไว้ใน Memory แต่ซ่อนข้อมูลทั้งหมดด้วย Loading UI
   *
   * กรณี error:
   * การตรวจ Session ล้มเหลว ยังสรุปไม่ได้ว่าบัญชีเปลี่ยนหรือไม่
   * จึงเก็บ Form และสถานะ POST เดิมไว้เพื่อให้ Retry ได้
   *
   * กรณี ready:
   * เก็บ Form ได้เฉพาะเมื่อ Session ยืนยันว่าเป็นบัญชีเดิม
   *
   * ถ้ายืนยันว่าเป็นบัญชีใหม่ หรือ logged out:
   * เงื่อนไขนี้จะไม่ผ่าน ทำให้ Form ของบัญชีเดิมถูก Unmount
   */
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

  /*
   * ถ้า Session กำลังตรวจและไม่มี Form เดิมให้เก็บ
   * แสดง Loading ตามปกติ
   */
  if (session.status === 'loading') {
    return (
      <ProtectedState
        status="loading"
        onRetry={handleRetry}
      />
    );
  }

  /*
   * ถ้า /api/me ล้มเหลว:
   * ซ่อน Project และข้อมูลบัญชีเดิม
   * แสดง Error พร้อม Retry
   *
   * หากมี Form เดิม จะถูกเก็บไว้ในเงื่อนไขด้านบนแล้ว
   */
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
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-5">
        <p
          role="alert"
          className="mb-4 text-[13px] text-red-600"
        >
          Unable to load the task form. Please try again.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="min-h-11 rounded-lg border border-[#dddddd] px-4 text-[13px]"
          >
            Back to Projects
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

  /*
   * ป้องกันการใช้ข้อมูล Project ของบัญชีเก่า
   * หลัง Session เปลี่ยนเป็นบัญชีใหม่แล้ว
   */
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