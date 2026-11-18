'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import {
  notFound,
  useParams,
  useRouter,
} from 'next/navigation';

import {
  ApiRequestError,
  projectApi,
} from '@/lib/projectApi';
import {
  parseRouteId,
  taskApi,
  tryParseRouteId,
} from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import { useSession } from '@/lib/SessionProvider';
import ProtectedState from '@/components/ProtectedState';

import type {
  ProjectItem,
  Task,
  TaskStatus,
} from '@/types';

const emptySubscribe = () => () => {};

type ExtendedTask = Task & {
  createdAt?: string | null;
  updatedAt?: string | null;
  createdByName?: string | null;
  creatorName?: string | null;
  creator?: {
    userId?: number | string;
    userName?: string;
  } | null;
  comments?: RawComment[];
};

type RawComment = {
  commentId?: number | string;
  id?: number | string;
  userId?: number | string;
  userName?: string;
  authorName?: string;
  user?: {
    userId?: number | string;
    userName?: string;
  };
  content?: string;
  commentText?: string;
  text?: string;
  createdAt?: string;
};

type TaskCommentItem = {
  id: string;
  userId?: number | string;
  authorName: string;
  content: string;
  createdAt: string;
};

type TaskDetailBundle = {
  project: ProjectItem;
  task: ExtendedTask;
  initialComments: TaskCommentItem[];
};

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

const COMMENT_SORT_OPTIONS: {
  value: 'LATEST' | 'OLDEST';
  label: string;
}[] = [
  { value: 'LATEST', label: 'Sort by latest' },
  { value: 'OLDEST', label: 'Sort by oldest' },
];

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

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return 'Just now';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return 'Just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }

  return formatShortDate(value);
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

function normalizeComments(rawList: unknown): TaskCommentItem[] {
  if (!Array.isArray(rawList)) return [];

  return rawList
    .map((item, idx): TaskCommentItem | null => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as RawComment;
      const content =
        raw.content ?? raw.commentText ?? raw.text ?? '';
      if (!content.trim()) return null;

      return {
        id: String(raw.commentId ?? raw.id ?? `comment-${idx}`),
        userId: raw.userId ?? raw.user?.userId,
        authorName:
          raw.userName ??
          raw.authorName ??
          raw.user?.userName ??
          'Team Member',
        content,
        createdAt: raw.createdAt ?? new Date().toISOString(),
      };
    })
    .filter((entry): entry is TaskCommentItem => entry !== null);
}

export default function TaskDetailPage() {
  const params = useParams<{ projectId: string; taskId: string }>();
  const router = useRouter();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isInvalidIds =
    tryParseRouteId(params.projectId, 'project ID') === null ||
    tryParseRouteId(params.taskId, 'task ID') === null;

  const { session } = useSession();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const [commentSort, setCommentSort] = useState<'LATEST' | 'OLDEST'>('LATEST');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');
  const [extraComments, setExtraComments] = useState<TaskCommentItem[]>([]);
  const [deletedCommentIds, setDeletedCommentIds] = useState<string[]>([]);

  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isSortDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSortDropdownOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSortDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSortDropdownOpen]);

  useEffect(() => {
    if (!isDeleteDialogOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) {
        setIsDeleteDialogOpen(false);
        setDeleteError('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDeleteDialogOpen, isDeleting]);

  const load = useCallback(async (): Promise<TaskDetailBundle> => {
    const projectId = parseRouteId(params.projectId, 'project ID');
    const taskId = parseRouteId(params.taskId, 'task ID');

    const apiRecord = taskApi as unknown as Record<string, unknown>;
    const getTaskByIdFn =
      typeof apiRecord.getTaskById === 'function'
        ? (apiRecord.getTaskById as (...args: number[]) => Promise<ExtendedTask>)
        : null;

    const getCommentsFn =
      typeof apiRecord.getTaskComments === 'function'
        ? (apiRecord.getTaskComments as (...args: number[]) => Promise<unknown>)
        : typeof apiRecord.getComments === 'function'
          ? (apiRecord.getComments as (...args: number[]) => Promise<unknown>)
          : null;

    const [project, tasks, singleTask, rawComments] = await Promise.all([
      projectApi.getProjectById(projectId),
      taskApi.getTasks(projectId),
      getTaskByIdFn
        ? (getTaskByIdFn.length >= 2
            ? getTaskByIdFn(projectId, taskId)
            : getTaskByIdFn(taskId)
          ).catch((err: unknown) => {
            if (
              err instanceof ApiRequestError &&
              (err.status === 400 || err.status === 404)
            ) {
              throw err;
            }
            return null;
          })
        : Promise.resolve(null),
      getCommentsFn
        ? (getCommentsFn.length >= 2
            ? getCommentsFn(projectId, taskId)
            : getCommentsFn(taskId)
          ).catch(() => null)
        : Promise.resolve(null),
    ]);

    const matchedFromList =
      tasks.find((item) => item.taskId === taskId) ?? null;

    const resolvedTask: ExtendedTask | null =
      singleTask !== null
        ? { ...(matchedFromList ?? {}), ...singleTask }
        : matchedFromList;

    if (!resolvedTask) {
      throw new ApiRequestError('Task not found.', 404);
    }

    const initialComments = normalizeComments(
      rawComments ?? resolvedTask.comments ?? [],
    );

    return {
      project,
      task: resolvedTask,
      initialComments,
    };
  }, [params.projectId, params.taskId]);

  const {
    status,
    data: bundle,
    httpStatus,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: false,
  });

  const isNotFound =
    isInvalidIds ||
    (status === 'error' && (httpStatus === 400 || httpStatus === 404));

  useEffect(() => {
    if (isNotFound && isClient) {
      notFound();
    }
  }, [isNotFound, isClient]);

  const comments = useMemo(() => {
    const base = bundle?.initialComments ?? [];
    const seen = new Set<string>();
    const merged: TaskCommentItem[] = [];

    for (const item of [...extraComments, ...base]) {
      if (deletedCommentIds.includes(item.id) || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }

    return [...merged].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return commentSort === 'LATEST' ? timeB - timeA : timeA - timeB;
    });
  }, [bundle?.initialComments, extraComments, deletedCommentIds, commentSort]);

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
            onClick={() => router.push(`/projects/${params.projectId}`)}
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

  if (status !== 'ready' || bundle === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const { project, task } = bundle;
  const projectId = project.projectId;
  const taskId = task.taskId;
  const assignees = task.assignees ?? [];

  const currentUserId = session.user?.userId;
  const isProjectOwner = project.myRole === 'Owner';
  const isTaskAssignee =
    currentUserId !== undefined &&
    assignees.some(
      (assignee) => String(assignee.userId) === String(currentUserId),
    );
  const canManageTask = isProjectOwner || isTaskAssignee;

  const statusConfig = getStatusConfig(task.status);
  const priorityConfig = getPriorityConfig(task.priority);
  const activeSortOption =
    COMMENT_SORT_OPTIONS.find((option) => option.value === commentSort) ??
    COMMENT_SORT_OPTIONS[0];

  const handleDeleteTask = async () => {
    if (isDeleting || !canManageTask) return;

    setIsDeleting(true);
    setDeleteError('');

    try {
      const apiRecord = taskApi as unknown as Record<string, unknown>;
      const deleteTaskFn =
        typeof apiRecord.deleteTask === 'function'
          ? (apiRecord.deleteTask as (...args: number[]) => Promise<unknown>)
          : null;

      if (deleteTaskFn) {
        if (deleteTaskFn.length >= 2) {
          await deleteTaskFn(projectId, taskId);
        } else {
          await deleteTaskFn(taskId);
        }
      }

      setIsDeleteDialogOpen(false);
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          router.replace('/login');
          return;
        }
        setDeleteError(error.message);
      } else {
        setDeleteError('Unable to delete this task. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAddComment = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = commentDraft.trim();
    if (!trimmed || isSubmittingComment) return;

    setIsSubmittingComment(true);
    setCommentError('');

    const currentUserName = session.user?.userName ?? 'You';

    try {
      const apiRecord = taskApi as unknown as Record<string, unknown>;
      const createCommentFn =
        typeof apiRecord.createTaskComment === 'function'
          ? (apiRecord.createTaskComment as (...args: unknown[]) => Promise<unknown>)
          : typeof apiRecord.createComment === 'function'
            ? (apiRecord.createComment as (...args: unknown[]) => Promise<unknown>)
            : typeof apiRecord.addComment === 'function'
              ? (apiRecord.addComment as (...args: unknown[]) => Promise<unknown>)
              : null;

      let createdItem: TaskCommentItem | null = null;

      if (createCommentFn) {
        const response =
          createCommentFn.length >= 3
            ? await createCommentFn(projectId, taskId, { content: trimmed })
            : await createCommentFn(taskId, { content: trimmed });

        const normalized = normalizeComments([response]);
        if (normalized.length > 0) {
          createdItem = normalized[0];
        }
      }

      if (!createdItem) {
        createdItem = {
          id: `local-${Date.now()}`,
          userId: currentUserId,
          authorName: currentUserName,
          content: trimmed,
          createdAt: new Date().toISOString(),
        };
      }

      setExtraComments((prev) => [createdItem!, ...prev]);
      setCommentDraft('');
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setCommentError(error.message);
      } else {
        setCommentError('Unable to post comment. Please try again.');
      }
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    setDeletedCommentIds((prev) => [...prev, commentId]);

    try {
      const apiRecord = taskApi as unknown as Record<string, unknown>;
      const deleteCommentFn =
        typeof apiRecord.deleteTaskComment === 'function'
          ? (apiRecord.deleteTaskComment as (...args: unknown[]) => Promise<unknown>)
          : typeof apiRecord.deleteComment === 'function'
            ? (apiRecord.deleteComment as (...args: unknown[]) => Promise<unknown>)
            : null;

      const numericCommentId = Number(commentId);
      if (deleteCommentFn && Number.isFinite(numericCommentId)) {
        if (deleteCommentFn.length >= 3) {
          await deleteCommentFn(projectId, taskId, numericCommentId);
        } else {
          await deleteCommentFn(numericCommentId);
        }
      }
    } catch {
      // Keep optimistic removal smooth
    }
  };

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
                  href={`/projects/${projectId}`}
                  className="font-medium hover:text-white transition-colors break-words"
                >
                  {project.projectName}
                </Link>
                <span aria-hidden="true" className="text-white/55">
                  &gt;
                </span>
                <Link
                  href={`/projects/${projectId}`}
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
                    href={`/projects/${projectId}`}
                    aria-label="Back to Project"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 hover:border-white/40 transition-colors"
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
                    <h1 className="text-[26px] sm:text-[32px] font-extrabold leading-tight tracking-tight text-white break-words">
                      {task.taskTitle}
                    </h1>
                  </div>
                </div>

                {/* EDIT & DELETE BUTTONS (ONLY FOR PROJECT OWNER OR TASK ASSIGNEES) */}
                {canManageTask && (
                  <div className="flex flex-wrap shrink-0 items-center gap-2.5 self-start sm:self-center">
                    <Link
                      href={`/projects/${projectId}/tasks/${taskId}/edit`}
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

                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => {
                        setDeleteError('');
                        setIsDeleteDialogOpen(true);
                      }}
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
                      href={`/projects/${projectId}`}
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

            {/* 3. COMMENTS CARD */}
            <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 sm:p-7 shadow-[0_6px_24px_rgba(35,25,66,0.05)]">
              {/* HEADER + CUSTOM ROUNDED SORT DROPDOWN */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ece8f8] pb-4">
                <div className="flex items-center gap-2.5">
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
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>

                  <h2 className="text-[17px] font-extrabold text-[#1f1f1f]">
                    Comments
                  </h2>

                  <span className="rounded-full border border-[#cfc5f7] bg-[#f3f0ff] px-2.5 py-0.5 text-[11.5px] font-bold text-[#5B44BA] tabular-nums">
                    {comments.length}
                  </span>
                </div>

                {/* CUSTOM SORT DROPDOWN */}
                <div ref={sortDropdownRef} className="relative">
                  <button
                    type="button"
                    aria-label="Sort comments"
                    aria-haspopup="listbox"
                    aria-expanded={isSortDropdownOpen}
                    onClick={() => setIsSortDropdownOpen((prev) => !prev)}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-xl border px-3.5 py-1.5 text-[12.5px] font-semibold outline-none transition-all cursor-pointer ${
                      isSortDropdownOpen
                        ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                        : 'border-[#cfc9e8] bg-[#f8f6fe] text-[#3d3a4b] hover:border-[#9e8ce6] hover:bg-white hover:text-[#5B44BA]'
                    }`}
                  >
                    <span>{activeSortOption.label}</span>
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className={`shrink-0 transition-transform duration-150 ${
                        isSortDropdownOpen
                          ? 'rotate-180 text-[#5B44BA]'
                          : 'text-[#6e6b7b]'
                      }`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isSortDropdownOpen && (
                    <div
                      role="listbox"
                      aria-label="Comment sort options"
                      className="absolute right-0 top-full z-30 mt-1.5 min-w-[168px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                    >
                      {COMMENT_SORT_OPTIONS.map((option) => {
                        const isSelected = commentSort === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => {
                              setCommentSort(option.value);
                              setIsSortDropdownOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors cursor-pointer ${
                              isSelected
                                ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                                : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                            }`}
                          >
                            <span>{option.label}</span>
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
              </div>

              {/* COMMENTS LIST */}
              {comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-9 text-center">
                  <span className="mb-2.5 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e2dcf5] bg-[#f8f6fe] text-[#8f89a6]">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <p className="text-[13.5px] font-semibold text-[#5c586b]">
                    No comments yet
                  </p>
                  <p className="mt-0.5 text-[12px] text-[#8f89a6]">
                    Start the conversation below.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#ece8f8]">
                  {comments.map((comment) => {
                    const canDeleteComment =
                      isProjectOwner ||
                      (currentUserId !== undefined &&
                        String(comment.userId) === String(currentUserId)) ||
                      comment.id.startsWith('local-');

                    return (
                      <div
                        key={comment.id}
                        className="group flex items-start justify-between gap-3 py-4"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[11.5px] font-bold text-[#5B44BA]">
                            {getInitials(comment.authorName)}
                          </span>

                          <div className="min-w-0">
                            <div className="flex flex-wrap items-baseline gap-2">
                              <span className="text-[13.5px] font-bold text-[#1f1f1f]">
                                {comment.authorName}
                              </span>
                              <span className="text-[11.5px] text-[#8f89a6]">
                                {formatRelativeTime(comment.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#3a3747]">
                              {comment.content}
                            </p>
                          </div>
                        </div>

                        {canDeleteComment && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteComment(comment.id)}
                            aria-label="Delete comment"
                            className="shrink-0 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-[#8f89a6] opacity-0 transition-all hover:bg-rose-50 hover:text-rose-600 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* WRITE A COMMENT FORM */}
              <form
                onSubmit={(e) => void handleAddComment(e)}
                className="mt-2 border-t border-[#ece8f8] pt-4"
              >
                {commentError && (
                  <p
                    role="alert"
                    className="mb-2.5 text-[12px] font-medium text-rose-600"
                  >
                    {commentError}
                  </p>
                )}

                <div className="flex items-start gap-3">
                  {session.user?.userName ? (
                    <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#5B44BA] text-[11.5px] font-bold text-white shadow-xs">
                      {getInitials(session.user.userName)}
                    </span>
                  ) : (
                    <span className="mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
                      <svg
                        width="16"
                        height="16"
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
                  )}

                  <textarea
                    rows={2}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void handleAddComment(e);
                      }
                    }}
                    placeholder="Write a comment... (Press Enter to send)"
                    aria-label="Write a comment"
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-[#cfc9e8] bg-[#f8f6fe] px-3.5 py-2.5 text-[13.5px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15 transition-all"
                  />

                  <button
                    type="submit"
                    disabled={!commentDraft.trim() || isSubmittingComment}
                    className="mt-1 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-[#5B44BA] px-4 py-2 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.25)] hover:bg-[#4934a3] hover:shadow-[0_6px_18px_rgba(91,68,186,0.34)] transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    <span>Send</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* CENTERED DELETE CONFIRMATION MODAL */}
      {canManageTask && isDeleteDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-task-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-[1px]"
          onClick={() => {
            if (!isDeleting) {
              setIsDeleteDialogOpen(false);
              setDeleteError('');
            }
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-[490px] rounded-[28px] bg-white px-7 py-8 sm:px-10 sm:py-9 text-center shadow-[0_20px_50px_rgba(15,15,25,0.22)] [overflow-wrap:anywhere]"
          >
            {/* TRASH ICON */}
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center text-[#1f1f1f]">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            </div>

            <h2
              id="delete-task-dialog-title"
              className="text-[24px] sm:text-[26px] font-extrabold tracking-tight text-[#1f1f1f]"
            >
              Delete task?
            </h2>

            <p className="mt-2.5 text-[15px] font-medium text-[#2b2b2b] break-words">
              Remove &ldquo;{task.taskTitle}&rdquo; from this project?
            </p>

            <p className="mt-3 text-[13.5px] leading-relaxed text-[#777777]">
              Deleting this task will permanently delete its comments and
              assignments.{' '}
              <span className="text-[#ef4444]">
                This action cannot be undone.
              </span>
            </p>

            {deleteError && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-600"
              >
                {deleteError}
              </p>
            )}

            <div className="mt-7 flex flex-wrap items-center justify-center sm:justify-end gap-3">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setIsDeleteDialogOpen(false);
                  setDeleteError('');
                }}
                className="min-h-[46px] rounded-2xl border border-[#dcdce0] bg-white px-7 py-2.5 text-[14px] font-bold text-[#1f1f1f] transition-colors hover:bg-[#f6f6f9] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeleteTask()}
                className="min-h-[46px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[#e60039] px-7 py-2.5 text-[14px] font-bold text-white transition-colors hover:bg-[#cc0032] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting && (
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
                <span>{isDeleting ? 'Deleting...' : 'Delete task'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}