'use client';

import {
  useCallback,
  useEffect,
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
import type { Project, Task } from '@/types';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getPriorityLabel(priority: Task['priority']) {
  switch (priority) {
    case 1:
      return 'High';
    case 2:
      return 'Medium';
    case 3:
      return 'Low';
    default:
      return 'Unknown';
  }
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

  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  // Keep the draft while focus verification temporarily unmounts the protected view.
  // The route keys this component by task; user ownership prevents cross-account display.
  const [commentDraft, setCommentDraft] = useState<{
    userId: number | string;
    text: string;
  } | null>(null);

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

    const stillOwner = data.project.myRole === 'Owner';

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
      data.project.myRole !== 'Owner' ||
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
      data.project.myRole !== 'Owner'
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
      data.project.myRole === 'Owner' &&
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

      router.push(`/projects/${requestProjectId}/tasks`);
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
      <div className="mx-auto min-w-0 w-full max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-4 sm:p-6">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          Unable to load task details. Please try again.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}/tasks`)}
            className="min-h-11 rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px]"
          >
            Back to Tasks
          </button>

          <button
            type="button"
            onClick={retry}
            className="min-h-11 rounded-lg bg-[#222222] px-4 py-2 text-[12px] text-white"
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

  return (
    <>
      <TaskDetailView
        task={data.task}
        projectId={projectId}
        isOwner={data.project.myRole === 'Owner'}
        isDeleting={isDeleting}
        onDelete={openDeleteDialog}
        onBack={() => router.push(`/projects/${projectId}/tasks`)}
        onEdit={() =>
          router.push(
            `/projects/${projectId}/tasks/${data.task.taskId}/edit`,
          )
        }
      />

      <TaskComments
        projectId={data.project.projectId}
        taskId={data.task.taskId}
        draft={commentDraft?.userId === session.user?.userId ? commentDraft?.text ?? '' : ''}
        onDraftChange={(text) => {
          if (session.status === 'ready' && session.user) {
            setCommentDraft({ userId: session.user.userId, text });
          }
        }}
        onAccessLost={retry}
      />

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        title="Delete Task?"
        description="Are you sure you want to permanently delete this task?"
        itemName={data.task.taskTitle}
        confirmLabel="Delete Task"
        isLoading={isDeleting}
        error={deleteError}
        onCancel={closeDeleteDialog}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}

function TaskDetailView({
  task,
  projectId,
  isOwner,
  isDeleting,
  onDelete,
  onBack,
  onEdit,
}: {
  task: Task;
  projectId: string;
  isOwner: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onBack: () => void;
  onEdit: () => void;
}) {
  return (
    <div className="mx-auto min-w-0 w-full max-w-4xl [overflow-wrap:anywhere]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="min-h-11 text-[13px] text-[#666666] hover:text-black"
        >
          ← Back to Tasks
        </button>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-11 rounded-lg bg-[#222222] px-5 py-2 text-[12px] font-medium text-white hover:bg-[#444444]"
          >
            Edit Task
          </button>

          {isOwner && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="min-h-11 rounded-lg border border-red-300 px-5 py-2 text-[12px] font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Delete Task
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-[#e0e0e0] bg-white p-4 sm:p-6 md:p-8">
        <div className="mb-6 border-b border-[#eeeeee] pb-6">
          <p className="mb-2 text-[12px] text-[#888888]">
            Task Detail
          </p>

          <h1 className="mb-3 text-2xl font-bold text-[#222222] sm:text-3xl">
            {task.taskTitle}
          </h1>

          <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#666666]">
            {task.taskDescription || 'No description provided.'}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-[11px] text-[#888888]">
              Project
            </p>
            <Link
              href={`/projects/${projectId}`}
              className="text-[14px] font-semibold text-[#222222] underline underline-offset-4 hover:text-[#666666]"
            >
              {task.projectName}
            </Link>
          </div>

          <div>
            <p className="mb-2 text-[11px] text-[#888888]">
              Status
            </p>
            <p className="text-[14px] font-semibold text-[#222222]">
              {task.status}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] text-[#888888]">
              Priority
            </p>
            <p className="text-[14px] font-semibold text-[#222222]">
              {getPriorityLabel(task.priority)}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] text-[#888888]">
              Due Date
            </p>
            <p className="text-[14px] font-semibold text-[#222222]">
              {formatDate(task.dueDate)}
            </p>

            {task.isOverdue && (
              <p className="mt-1 text-[12px] font-medium text-red-600">
                Overdue
              </p>
            )}
          </div>

          <div>
            <p className="mb-2 text-[11px] text-[#888888]">
              Created By
            </p>
            <p className="text-[14px] font-semibold text-[#222222]">
              {task.createdByName}
            </p>
          </div>

          <div>
            <p className="mb-2 text-[11px] text-[#888888]">
              Created At
            </p>
            <p className="text-[14px] font-semibold text-[#222222]">
              {formatDate(task.createdAt)}
            </p>
          </div>
        </div>

        <div className="mt-7 border-t border-[#eeeeee] pt-6">
          <h2 className="mb-4 text-[15px] font-semibold text-[#222222]">
            Assignees
          </h2>

          {task.assignees.length === 0 ? (
            <p className="text-[13px] text-[#888888]">
              No assignees.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {task.assignees.map((assignee) => (
                <div
                  key={assignee.userId}
                  className="rounded-lg border border-[#e5e5e5] bg-[#fafafa] px-3 py-2"
                >
                  <p className="text-[13px] font-medium text-[#333333]">
                    {assignee.userName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
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
