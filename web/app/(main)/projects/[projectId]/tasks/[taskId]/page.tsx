'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import TaskComments from '@/components/tasks/TaskComments';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import {
  ApiRequestError,
  projectApi,
} from '@/lib/projectApi';
import { useSession } from '@/lib/SessionProvider';
import {
  parseRouteId,
  taskApi,
  tryParseRouteId,
} from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import type {
  Project,
  Task,
  TaskStatus,
} from '@/types';

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return 'No due date';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getPriorityConfig(priority: Task['priority']) {
  if (priority === 1) {
    return {
      label: 'High',
      badgeClass: 'bg-red-50 text-red-600 border-red-200',
      dotClass: 'bg-red-500',
    };
  }
  if (priority === 2) {
    return {
      label: 'Medium',
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500',
    };
  }
  return {
    label: 'Low',
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    dotClass: 'bg-cyan-500',
  };
}

function getStatusConfig(status: TaskStatus) {
  if (status === 'Done') {
    return {
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      dotClass: 'bg-emerald-500',
    };
  }
  if (status === 'In progress') {
    return {
      badgeClass: 'bg-[#f1edff] text-[#5B44BA] border-[#d6ccfa]',
      dotClass: 'bg-[#5B44BA]',
    };
  }
  return {
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
    dotClass: 'bg-slate-400',
  };
}

type TaskDetailData = {
  task: Task;
  project: Project;
};

type DeleteContext = {
  revision: number;
  userId: number | string;
  projectId: number;
  taskId: number;
};

function TaskDetailContent({
  projectId,
  taskId,
}: {
  projectId: string;
  taskId: string;
}) {
  const router = useRouter();
  const { session, isCurrentSessionRevision } = useSession();

  const sessionRef = useRef(session);
  useLayoutEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Keep draft and in-flight comment state across tab focus revalidation for the same account,
  // while resetting them immediately on logout or switching to a different account.
  const [commentDraft, setCommentDraft] = useState<{
    userId: number | string;
    generation: number;
    text: string;
  } | null>(null);
  const [commentPost, setCommentPost] = useState<{
    userId: number | string;
    generation: number;
    status: 'posting' | 'saved' | 'error';
    message: string;
  } | null>(null);

  const authGenerationRef = useRef(0);
  const lastAuthenticatedUserIdRef = useRef<number | string | null>(null);
  const commentRequestSequenceRef = useRef(0);
  const activeCommentRequestRef = useRef<{
    token: number;
    userId: number | string;
    generation: number;
  } | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const deleteContextRef = useRef<DeleteContext | null>(null);

  const isInvalidId =
    tryParseRouteId(projectId, 'project ID') === null ||
    tryParseRouteId(taskId, 'task ID') === null;

  const load = useCallback(async (): Promise<TaskDetailData> => {
    const numericProjectId = parseRouteId(projectId, 'project ID');
    const numericTaskId = parseRouteId(taskId, 'task ID');

    const [task, project] = await Promise.all([
      taskApi.getTaskById(numericProjectId, numericTaskId),
      projectApi.getProjectById(numericProjectId),
    ]);

    return { task, project };
  }, [projectId, taskId]);

  const {
    status,
    data,
    httpStatus,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: true,
  });

  // Track account switches and logouts without resetting on same-account focus revalidation.
  useEffect(() => {
    if (session.status === 'login-required' || session.status === 'no-profile') {
      if (lastAuthenticatedUserIdRef.current !== null) {
        lastAuthenticatedUserIdRef.current = null;
        authGenerationRef.current += 1;
      }
      const nextGeneration = authGenerationRef.current;
      commentRequestSequenceRef.current += 1;
      activeCommentRequestRef.current = null;
      Promise.resolve().then(() => {
        if (!mountedRef.current) return;
        setCommentDraft((current) =>
          current && current.generation !== nextGeneration ? null : current,
        );
        setCommentPost((current) =>
          current && current.generation !== nextGeneration ? null : current,
        );
      });
      return;
    }

    if (session.status === 'ready' && session.user) {
      const currentUserId = session.user.userId;
      if (
        lastAuthenticatedUserIdRef.current !== null &&
        lastAuthenticatedUserIdRef.current !== currentUserId
      ) {
        authGenerationRef.current += 1;
        commentRequestSequenceRef.current += 1;
        activeCommentRequestRef.current = null;
      }
      lastAuthenticatedUserIdRef.current = currentUserId;
      const activeGeneration = authGenerationRef.current;
      Promise.resolve().then(() => {
        if (!mountedRef.current) return;
        setCommentDraft((current) =>
          current &&
          (current.userId !== currentUserId ||
            current.generation !== activeGeneration)
            ? null
            : current,
        );
        setCommentPost((current) =>
          current &&
          (current.userId !== currentUserId ||
            current.generation !== activeGeneration)
            ? null
            : current,
        );
      });
    }
  }, [session.status, session.user]);

  // Posting belongs to the route, which survives focus/session verification.
  // Wait for the original request of the same account even across tab focus revalidation.
  const handleCommentSubmit = async () => {
    const submittedDraft = commentDraft;
    if (
      !data ||
      session.status !== 'ready' ||
      !session.user ||
      !submittedDraft?.text.trim() ||
      submittedDraft.userId !== session.user.userId ||
      submittedDraft.generation !== authGenerationRef.current
    ) {
      return;
    }

    const userId = session.user.userId;
    const requestGeneration = authGenerationRef.current;

    const currentActive = activeCommentRequestRef.current;
    if (
      currentActive &&
      currentActive.userId === userId &&
      currentActive.generation === requestGeneration
    ) {
      return;
    }

    const requestToken = ++commentRequestSequenceRef.current;
    activeCommentRequestRef.current = {
      token: requestToken,
      userId,
      generation: requestGeneration,
    };

    const isCommentRequestCurrent = () => {
      const latestSession = sessionRef.current;
      return (
        mountedRef.current &&
        commentRequestSequenceRef.current === requestToken &&
        authGenerationRef.current === requestGeneration &&
        latestSession.status !== 'login-required' &&
        latestSession.status !== 'no-profile' &&
        (latestSession.status !== 'ready' ||
          latestSession.user?.userId === userId)
      );
    };

    setCommentPost({
      userId,
      generation: requestGeneration,
      status: 'posting',
      message: '',
    });

    try {
      await taskApi.addComment(data.project.projectId, data.task.taskId, {
        commentText: submittedDraft.text.trim(),
      });
      if (!isCommentRequestCurrent()) return;
      setCommentDraft((current) => (current === submittedDraft ? null : current));
      setCommentPost({
        userId,
        generation: requestGeneration,
        status: 'saved',
        message: 'Comment posted.',
      });
      retry();
    } catch (cause) {
      if (!isCommentRequestCurrent()) return;
      setCommentPost({
        userId,
        generation: requestGeneration,
        status: 'error',
        message:
          cause instanceof Error
            ? cause.message
            : 'Unable to post your comment. Please try again.',
      });
      if (
        cause instanceof ApiRequestError &&
        [401, 403, 404].includes(cause.status)
      ) {
        retry();
      }
    } finally {
      if (activeCommentRequestRef.current?.token === requestToken) {
        activeCommentRequestRef.current = null;
      }
    }
  };

  const isNotFound =
    isInvalidId ||
    (status === 'error' && (httpStatus === 400 || httpStatus === 404));

  useEffect(() => {
    if (isNotFound) {
      notFound();
    }
  }, [isNotFound]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      commentRequestSequenceRef.current += 1;
      activeCommentRequestRef.current = null;
      deleteContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const context = deleteContextRef.current;

    if (!context) return;

    const isSameSession =
      session.status === 'ready' &&
      session.user?.userId === context.userId &&
      isCurrentSessionRevision(context.revision);

    if (!isSameSession) {
      requestSequenceRef.current += 1;
      deleteContextRef.current = null;
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
      setDeleteError('');
    }
  }, [
    session.revision,
    session.status,
    session.user?.userId,
    isCurrentSessionRevision,
  ]);

  useEffect(() => {
    if (!isDeleteDialogOpen || !deleteContextRef.current || !data) {
      return;
    }

    const context = deleteContextRef.current;

    const isSameItem =
      data.project.projectId === context.projectId &&
      data.task.taskId === context.taskId;

    const stillOwner = data.project.myRole?.toLowerCase() === 'owner';

    if (!isSameItem || !stillOwner) {
      requestSequenceRef.current += 1;
      deleteContextRef.current = null;
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
      setDeleteError('');
    }
  }, [data, isDeleteDialogOpen]);

  const openDeleteDialog = () => {
    if (
      !data ||
      data.project.myRole?.toLowerCase() !== 'owner' ||
      session.status !== 'ready' ||
      !session.user
    ) {
      return;
    }

    const numericProjectId = parseRouteId(projectId, 'project ID');
    const numericTaskId = parseRouteId(taskId, 'task ID');

    deleteContextRef.current = {
      revision: session.revision,
      userId: session.user.userId,
      projectId: numericProjectId,
      taskId: numericTaskId,
    };

    setDeleteError('');
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;

    requestSequenceRef.current += 1;
    deleteContextRef.current = null;
    setIsDeleteDialogOpen(false);
    setDeleteError('');
  };

  const handleDelete = async () => {
    const context = deleteContextRef.current;

    if (
      !data ||
      !context ||
      isDeleting ||
      !isDeleteDialogOpen ||
      session.status !== 'ready' ||
      !session.user ||
      data.project.myRole?.toLowerCase() !== 'owner'
    ) {
      return;
    }

    const numericProjectId = parseRouteId(projectId, 'project ID');
    const numericTaskId = parseRouteId(taskId, 'task ID');

    const canDelete =
      context.revision === session.revision &&
      context.userId === session.user.userId &&
      context.projectId === numericProjectId &&
      context.taskId === numericTaskId &&
      data.project.projectId === numericProjectId &&
      data.task.taskId === numericTaskId &&
      data.project.myRole?.toLowerCase() === 'owner' &&
      isCurrentSessionRevision(context.revision);

    if (!canDelete) {
      deleteContextRef.current = null;
      setIsDeleteDialogOpen(false);
      setDeleteError('');
      return;
    }

    const requestRevision = context.revision;
    const requestUserId = context.userId;
    const requestProjectId = context.projectId;
    const requestTaskId = context.taskId;
    const requestToken = ++requestSequenceRef.current;

    const isRequestCurrent = () => {
      return (
        mountedRef.current &&
        requestSequenceRef.current === requestToken &&
        deleteContextRef.current === context &&
        session.user?.userId === requestUserId &&
        isCurrentSessionRevision(requestRevision)
      );
    };

    setIsDeleting(true);
    setDeleteError('');

    try {
      await taskApi.deleteTask(requestProjectId, requestTaskId);

      if (!isRequestCurrent()) return;

      deleteContextRef.current = null;
      setIsDeleteDialogOpen(false);

      router.push(`/projects/${requestProjectId}`);
      router.refresh();
    } catch (error) {
      if (!isRequestCurrent()) return;

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          deleteContextRef.current = null;
          setIsDeleteDialogOpen(false);
          router.replace('/login');
          return;
        }

        if (error.status === 403) {
          setDeleteError(
            'You do not have permission to delete this task.',
          );
          return;
        }

        if (error.status === 404) {
          setDeleteError(
            'This task could not be found. It may have already been deleted.',
          );
          return;
        }

        setDeleteError(error.message);
        return;
      }

      setDeleteError('Unable to delete this task. Please try again.');
    } finally {
      if (isRequestCurrent()) {
        setIsDeleting(false);
      }
    }
  };

  if (isNotFound) {
    return null;
  }

  if (status === 'error') {
    return (
      <div className="mx-auto min-w-0 max-w-3xl rounded-2xl border border-[#cfc9e8] bg-white p-5 sm:p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)] [overflow-wrap:anywhere]">
        <p role="alert" className="mb-4 text-[13.5px] font-medium text-red-600">
          Unable to load the task. Please try again.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#333333] hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] transition-colors cursor-pointer"
          >
            Back to Project
          </button>

          <button
            type="button"
            onClick={retry}
            className="min-h-10 rounded-xl bg-[#5B44BA] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#4934a3] transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const { project, task } = data;
  const resolvedProjectId = project.projectId;
  const resolvedTaskId = task.taskId;
  const assignees = task.assignees ?? [];

  const currentUserId = session.user?.userId;
  const isProjectOwner = project.myRole?.toLowerCase() === 'owner';
  const isTaskAssignee =
    currentUserId !== undefined &&
    assignees.some(
      (assignee) => String(assignee.userId) === String(currentUserId),
    );
  const canEditTask = isProjectOwner || isTaskAssignee;
  const canDeleteTask = isProjectOwner;

  const validSessionUser =
    session.status === 'ready' && session.user ? session.user : null;

  const activeDraft =
    validSessionUser &&
    commentDraft &&
    commentDraft.userId === validSessionUser.userId
      ? commentDraft.text
      : '';

  const activeCommentPost =
    validSessionUser &&
    commentPost &&
    commentPost.userId === validSessionUser.userId
      ? commentPost
      : null;

  const statusConfig = getStatusConfig(task.status);
  const priorityConfig = getPriorityConfig(task.priority);

  return (
    <>
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

        <div className="relative z-[1] mx-auto w-full max-w-5xl space-y-6">
          {/* FRAMED PURPLE HEADER BANNER */}
          <div className="relative rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 py-6 sm:px-9 sm:py-7 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
            {/* Clipped decorative circles & vector doodles */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]"
            >
              <div className="absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-white/[0.07]" />
              <div className="absolute right-8 -top-12 h-60 w-60 rounded-full bg-white/[0.08]" />
              <div className="absolute right-44 bottom-2 h-36 w-36 rounded-full bg-white/[0.06]" />

              <svg
                viewBox="0 0 1024 180"
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
                  <g transform="translate(866 52)">
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
              {/* BREADCRUMB */}
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
                  href={`/projects/${resolvedProjectId}`}
                  className="font-medium hover:text-white transition-colors break-words"
                >
                  {project.projectName}
                </Link>
                <span aria-hidden="true" className="text-white/55">
                  &gt;
                </span>
                <Link
                  href={`/projects/${resolvedProjectId}`}
                  className="font-medium hover:text-white transition-colors"
                >
                  Task
                </Link>
                <span aria-hidden="true" className="text-white/55">
                  &gt;
                </span>
                <span className="font-bold text-white break-words">
                  {task.taskTitle}
                </span>
              </nav>

              {/* HEADER ROW */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <Link
                    href={`/projects/${resolvedProjectId}`}
                    aria-label="Back to Project"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#5B44BA] shadow-[0_4px_14px_rgba(35,25,66,0.16)] hover:bg-[#f4f0ff] hover:text-[#452ea0] transition-all"
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
                    <h1 className="text-[26px] sm:text-[32px] font-extrabold leading-tight tracking-tight text-white break-words">
                      {task.taskTitle}
                    </h1>
                  </div>
                </div>

                {/* EDIT (OWNER OR ASSIGNEE) & DELETE (OWNER ONLY) */}
                {(canEditTask || canDeleteTask) && (
                  <div className="flex flex-wrap shrink-0 items-center gap-2.5 self-start sm:self-center">
                    {canEditTask && (
                      <Link
                        href={`/projects/${resolvedProjectId}/tasks/${resolvedTaskId}/edit`}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-[#5B44BA] shadow-[0_4px_14px_rgba(35,25,66,0.14)] hover:bg-[#f6f3ff] transition-all"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                        <span>Edit Task</span>
                      </Link>
                    )}

                    {canDeleteTask && (
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={openDeleteDialog}
                        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-rose-300/40 bg-rose-500/90 px-4 py-2 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(35,25,66,0.14)] hover:bg-rose-600 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                        <span>Delete Task</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CENTERED CONTENT COLUMN */}
          <div className="mx-auto w-full max-w-[880px] space-y-5">
            {/* 1. METADATA SUMMARY BAR */}
            <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 px-5 py-4 sm:px-6 sm:py-5 shadow-[0_6px_24px_rgba(35,25,66,0.05)] space-y-4">
              {/* TOP ROW: STATUS, PRIORITY, DUE DATE, PROJECT */}
              <div className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-[#ece8f8]">
                {/* STATUS */}
                <div className="sm:pr-4">
                  <p className="text-[11.5px] font-semibold text-[#7d7696]">
                    Status
                  </p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[12px] font-semibold whitespace-nowrap ${statusConfig.badgeClass}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`}
                      />
                      {task.status}
                    </span>
                  </div>
                </div>

                {/* PRIORITY */}
                <div className="sm:px-4">
                  <p className="text-[11.5px] font-semibold text-[#7d7696]">
                    Priority
                  </p>
                  <div className="mt-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-0.5 text-[12px] font-semibold ${priorityConfig.badgeClass}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${priorityConfig.dotClass}`}
                      />
                      {priorityConfig.label}
                    </span>
                  </div>
                </div>

                {/* DUE DATE */}
                <div className="sm:px-4">
                  <p className="text-[11.5px] font-semibold text-[#7d7696]">
                    Due Date
                  </p>
                  <div
                    className={`mt-2 flex items-center gap-2 text-[13px] ${
                      task.isOverdue && task.status !== 'Done'
                        ? 'font-bold text-rose-600'
                        : 'font-bold text-[#1f1f1f]'
                    }`}
                  >
                    <span
                      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                        task.isOverdue && task.status !== 'Done'
                          ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : 'border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]'
                      }`}
                    >
                      <svg
                        width="13"
                        height="13"
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
                    </span>
                    <span className="truncate">
                      {formatShortDate(task.dueDate)}
                    </span>
                  </div>
                </div>

                {/* PROJECT */}
                <div className="sm:pl-4">
                  <p className="text-[11.5px] font-semibold text-[#7d7696]">
                    Project
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                    </span>
                    <Link
                      href={`/projects/${resolvedProjectId}`}
                      className="truncate text-[13px] font-bold text-[#5B44BA] hover:text-[#452ea0] hover:underline transition-colors"
                    >
                      {project.projectName}
                    </Link>
                  </div>
                </div>
              </div>

              {/* BOTTOM ROW: ALL ASSIGNEES */}
              <div className="border-t border-[#ece8f8] pt-4">
                <div className="mb-2.5 flex items-center gap-2">
                  <p className="text-[11.5px] font-semibold text-[#7d7696]">
                    Assigned to
                  </p>
                  {assignees.length > 0 && (
                    <span className="rounded-full border border-[#cfc5f7] bg-[#f3f0ff] px-2 py-0.5 text-[10.5px] font-bold text-[#5B44BA] tabular-nums">
                      {assignees.length}
                    </span>
                  )}
                </div>

                {assignees.length === 0 ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#e2dcf5] bg-[#f8f6fe] text-[#7d7696]">
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <span className="text-[13px] font-semibold text-[#7d7696]">
                      Unassigned
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {assignees.map((assignee, index) => (
                      <div
                        key={assignee.userId ?? `${assignee.userName}-${index}`}
                        className="inline-flex items-center gap-2 rounded-full border border-[#dcd4fa] bg-[#f8f6fe] py-1 pl-1.5 pr-3 shadow-[0_1px_2px_rgba(91,68,186,0.04)]"
                      >
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5B44BA] text-[10px] font-bold text-white">
                          {getInitials(assignee.userName)}
                        </span>
                        <span className="text-[12.5px] font-semibold text-[#1f1f1f]">
                          {assignee.userName}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 2. DESCRIPTION CARD */}
            <div className="min-h-[160px] rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 sm:p-7 shadow-[0_6px_24px_rgba(35,25,66,0.05)]">
              <div className="mb-3.5 flex items-center gap-2.5 border-b border-[#ece8f8] pb-3.5">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
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
                    <line x1="17" y1="10" x2="3" y2="10" />
                    <line x1="21" y1="6" x2="3" y2="6" />
                    <line x1="21" y1="14" x2="3" y2="14" />
                    <line x1="17" y1="18" x2="3" y2="18" />
                  </svg>
                </span>
                <h2 className="text-[17px] font-extrabold text-[#1f1f1f]">
                  Description
                </h2>
              </div>

              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#3a3747]">
                {task.taskDescription || (
                  <span className="italic text-[#8f89a6]">
                    No description provided.
                  </span>
                )}
              </p>
            </div>

            {/* 3. COMMENTS SECTION */}
            <TaskComments
              key={`${resolvedProjectId}-${resolvedTaskId}-${currentUserId ?? 'anon'}`}
              projectId={resolvedProjectId}
              taskId={resolvedTaskId}
              draft={activeDraft}
              onDraftChange={(text) => {
                if (session.status === 'ready' && session.user) {
                  setCommentDraft({
                    userId: session.user.userId,
                    generation: authGenerationRef.current,
                    text,
                  });
                }
              }}
              onSubmit={() => void handleCommentSubmit()}
              isPosting={activeCommentPost?.status === 'posting'}
              error={
                activeCommentPost?.status === 'error'
                  ? activeCommentPost.message
                  : ''
              }
              notice={
                activeCommentPost?.status === 'saved'
                  ? activeCommentPost.message
                  : ''
              }
            />
          </div>
        </div>
      </div>

      {/* DELETE TASK CONFIRMATION MODAL (OWNER ONLY) */}
      {canDeleteTask && (
        <ConfirmationDialog
          open={isDeleteDialogOpen}
          title="Delete task?"
          itemName={`Remove “${task.taskTitle}” from this project?`}
          description="Deleting this task will permanently delete its comments and assignments."
          confirmLabel="Delete task"
          isLoading={isDeleting}
          error={deleteError}
          onCancel={closeDeleteDialog}
          onConfirm={() => void handleDelete()}
        />
      )}
    </>
  );
}

export default function TaskDetailPage() {
  const params = useParams<{
    projectId: string;
    taskId: string;
  }>();

  const projectId = params.projectId;
  const taskId = params.taskId;

  return (
    <TaskDetailContent
      key={`${projectId}-${taskId}`}
      projectId={projectId}
      taskId={taskId}
    />
  );
}