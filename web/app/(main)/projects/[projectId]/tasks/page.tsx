
'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import ProtectedState from '@/components/ProtectedState';
import { parseRouteId, taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import type { Task } from '@/types';

function formatDate(value: string | null | undefined) {
  if (!value) return 'No due date';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function priorityLabel(priority: Task['priority']) {
  switch (priority) {
    case 1:
      return 'High';
    case 2:
      return 'Medium';
    case 3:
      return 'Low';
    default:
      return '—';
  }
}

function priorityClass(priority: Task['priority']) {
  switch (priority) {
    case 1:
      return 'bg-red-50 text-red-700';
    case 2:
      return 'bg-yellow-50 text-yellow-700';
    case 3:
      return 'bg-green-50 text-green-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

function TaskRow({ task, projectId }: {
  task: Task;
  projectId: number;
}) {
  const assignees = task.assignees ?? [];
  const visibleAssignees = assignees.slice(0, 2);
  const remaining = Math.max(0, assignees.length - 2);

  return (
    <Link
      href={`/projects/${projectId}/tasks/${task.taskId}`}
      className="grid gap-3 border-b border-[#eeeeee] px-4 py-4 transition hover:bg-[#fafafa] sm:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_minmax(100px,0.8fr)] sm:items-center"
    >
      <div className="min-w-0">
        <p className="break-words text-[13px] font-semibold text-[#222222]">
          {task.taskTitle}
        </p>
        <p className="mt-1 text-[11px] text-[#999999]">
          {task.isOverdue ? 'Overdue' : 'Task'}
        </p>
      </div>

      <div className="min-w-0">
        <p className="mb-1 text-[10px] text-[#999999] sm:hidden">
          Assignees
        </p>

        {assignees.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {visibleAssignees.map((person) => (
              <span
                key={person.userId}
                className="max-w-full truncate rounded-full bg-[#f1f1f1] px-2 py-1 text-[11px] text-[#555555]"
              >
                {person.userName}
              </span>
            ))}

            {remaining > 0 && (
              <span className="rounded-full bg-[#eeeeee] px-2 py-1 text-[11px] text-[#555555]">
                +{remaining}
              </span>
            )}
          </div>
        ) : (
          <span className="text-[12px] text-[#999999]">No assignees</span>
        )}
      </div>

      <div>
        <p className="mb-1 text-[10px] text-[#999999] sm:hidden">
          Due date
        </p>
        <p className={`text-[12px] ${task.isOverdue ? 'font-semibold text-red-600' : 'text-[#555555]'}`}>
          {formatDate(task.dueDate)}
        </p>
      </div>

      <div>
        <p className="mb-1 text-[10px] text-[#999999] sm:hidden">
          Priority
        </p>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${priorityClass(task.priority)}`}>
          {priorityLabel(task.priority)}
        </span>
      </div>

      <div>
        <p className="mb-1 text-[10px] text-[#999999] sm:hidden">
          Status
        </p>
        <span className="inline-flex rounded-full bg-[#f1f1f1] px-2.5 py-1 text-[11px] text-[#555555]">
          {task.status}
        </span>
      </div>
    </Link>
  );
}

function ProjectTasksContent({ projectId }: { projectId: string }) {
  const router = useRouter();

  const load = useCallback(async () => {
    const id = parseRouteId(projectId, 'project ID');
    return taskApi.getTasks(id);
  }, [projectId]);

  const {
    status,
    data: tasks,
    httpStatus,
    retry,
  } = useProtectedLoad(load);

  const numericProjectId = Number(projectId);

  if (status === 'error') {
    const message =
      httpStatus === 400
        ? 'Invalid project ID.'
        : httpStatus === 404
          ? 'Project not found or you do not have access.'
          : 'Unable to load project tasks. Please try again.';

    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-[#e0e0e0] bg-white p-6">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          {message}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="min-h-11 rounded-lg border border-[#e0e0e0] px-4 text-[12px]"
          >
            Back to Project
          </button>

          {httpStatus !== 400 && httpStatus !== 404 && (
            <button
              type="button"
              onClick={retry}
              className="min-h-11 rounded-lg bg-[#222222] px-4 text-[12px] text-white"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status !== 'ready' || tasks === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl">
      <Link
        href={`/projects/${projectId}`}
        className="mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black"
      >
        ← Back to Project Overview
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#222222]">
            Project Tasks
          </h1>
          <p className="mt-1 text-[13px] text-[#888888]">
            All tasks in this project
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            router.push(`/projects/${projectId}/tasks/new`)
          }
          className="min-h-11 rounded-lg bg-[#222222] px-5 text-[12px] font-medium text-white hover:bg-[#444444]"
        >
          + Create Task
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e5e5e5] bg-white">
        <div className="flex items-center justify-between border-b border-[#eeeeee] px-5 py-4">
          <h2 className="text-[14px] font-semibold text-[#333333]">
            Tasks
          </h2>
          <span className="text-[12px] text-[#888888]">
            {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
            <p className="text-[14px] font-semibold text-[#444444]">
              No tasks yet
            </p>
            <p className="mt-2 text-[12px] text-[#999999]">
              Create the first task for this project.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(100px,0.8fr)_minmax(90px,0.7fr)_minmax(100px,0.8fr)] gap-3 border-b border-[#eeeeee] bg-[#fafafa] px-4 py-3 text-[11px] font-semibold text-[#888888] sm:grid">
              <span>Task name</span>
              <span>Assignees</span>
              <span>Due date</span>
              <span>Priority</span>
              <span>Status</span>
            </div>

            {tasks.map((task) => (
              <TaskRow
                key={task.taskId}
                task={task}
                projectId={numericProjectId}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function ProjectTasksPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  // Remount when projectId changes so the previous project's rows
  // cannot remain visible while the next project is loading.
  return (
    <ProjectTasksContent
      key={projectId}
      projectId={projectId}
    />
  );
}
