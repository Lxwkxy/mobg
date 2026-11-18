'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';
import TaskFilters from '@/components/tasks/TaskFilters';

import type { Task, TaskPriority, TaskStatus } from '@/types';

const STATUS_OPTIONS: TaskStatus[] = [
  'To do',
  'In progress',
  'Done',
];

function parseStatusParam(value: string | null): TaskStatus | '' {
  if (value === 'To do' || value === 'In progress' || value === 'Done') {
    return value;
  }
  return '';
}

function parsePriorityParam(value: string | null): TaskPriority | '' {
  if (value === '1') return 1;
  if (value === '2') return 2;
  if (value === '3') return 3;
  return '';
}

export default function MyTasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState('');
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  // อ่านค่าตัวกรองจาก URL query parameters โดยตรง (ไม่ต้องใช้ useEffect ซิงก์)
  const statusFilter = parseStatusParam(searchParams.get('status'));
  const priorityFilter = parsePriorityParam(searchParams.get('priority'));
  const overdueOnly = searchParams.get('overdue') === 'true';

  const updateQueryParams = useCallback(
    (updates: {
      status?: TaskStatus | '';
      priority?: TaskPriority | '';
      overdue?: boolean;
    }) => {
      const next = new URLSearchParams(searchParams.toString());

      if (updates.status !== undefined) {
        if (updates.status) {
          next.set('status', updates.status);
        } else {
          next.delete('status');
        }
      }

      if (updates.priority !== undefined) {
        if (updates.priority !== '') {
          next.set('priority', String(updates.priority));
        } else {
          next.delete('priority');
        }
      }

      if (updates.overdue !== undefined) {
        if (updates.overdue) {
          next.set('overdue', 'true');
        } else {
          next.delete('overdue');
        }
      }

      const qs = next.toString();
      router.replace(qs ? `/mytasks?${qs}` : '/mytasks', { scroll: false });
    },
    [router, searchParams],
  );

  // โหลดข้อมูลใหม่เมื่อ Status Filter เปลี่ยน
  // ถ้าไม่ได้เลือก Status จะไม่ส่ง status ไปยัง API
  const loadMyTasks = useCallback(
    () =>
      statusFilter
        ? taskApi.getMyTasks({ status: statusFilter })
        : taskApi.getMyTasks(),
    [statusFilter],
  );

  const { status, data, retry } = useProtectedLoad(loadMyTasks, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: true,
    revalidateOnRoute: '/mytasks',
  });

  const tasksList = useMemo(() => data ?? [], [data]);

  // Search, Priority และ Overdue กรองข้อมูลฝั่ง Client
  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return tasksList.filter((task) => {
      const matchesSearch =
        !keyword || task.taskTitle.toLowerCase().includes(keyword);

      const matchesPriority =
        priorityFilter === '' || task.priority === priorityFilter;

      const matchesOverdue = !overdueOnly || Boolean(task.isOverdue);

      return matchesSearch && matchesPriority && matchesOverdue;
    });
  }, [tasksList, search, priorityFilter, overdueOnly]);

  const handleStatusChange = async (
    task: Task,
    newStatus: TaskStatus,
  ) => {
    if (task.status === newStatus || updatingTaskId !== null) {
      return;
    }

    setUpdatingTaskId(task.taskId);
    setActionError('');

    try {
      await taskApi.updateTask(
        task.projectId,
        task.taskId,
        { status: newStatus },
      );

      retry();
    } catch (error) {
      console.error('Failed to update task status:', error);

      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to update task status. Please try again.',
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const clearFilters = () => {
    setSearch('');

    if (searchParams.toString()) {
      router.replace('/mytasks', { scroll: false });
    }
  };

  const getPriorityLabel = (priority: number) => {
    if (priority === 1) return 'High';
    if (priority === 2) return 'Medium';
    return 'Low';
  };

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const hasActiveFilters =
    search !== '' ||
    statusFilter !== '' ||
    priorityFilter !== '' ||
    overdueOnly;

  const hasNoAssignedTasks =
    tasksList.length === 0 && !hasActiveFilters;

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="mb-1 text-[32px] font-extrabold text-[#1f1f1f]">
          My Tasks
        </h1>

        <p className="text-[14px] text-[#777777]">
          All your assigned tasks across projects
        </p>
      </div>

      <TaskFilters
        search={search}
        status={statusFilter}
        priority={priorityFilter}
        onSearchChange={setSearch}
        onStatusChange={(nextStatus) =>
          updateQueryParams({ status: nextStatus })
        }
        onPriorityChange={(nextPriority) =>
          updateQueryParams({ priority: nextPriority })
        }
        onClear={clearFilters}
      />

      {overdueOnly && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-700">
          <span>Showing overdue tasks only</span>
          <button
            type="button"
            onClick={() => updateQueryParams({ overdue: false })}
            className="font-semibold underline hover:text-red-900"
          >
            Show all due dates
          </button>
        </div>
      )}

      {actionError && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
        >
          {actionError}
        </div>
      )}

      <div className="min-w-0 rounded-xl border border-[#e0e0e0] bg-white p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-[#333333]">
            Assigned Tasks
          </h2>

          <span className="text-[12px] text-[#888888]">
            {filteredTasks.length} of {tasksList.length} tasks
          </span>
        </div>

        <div
          aria-hidden="true"
          className="hidden grid-cols-[2fr_1.3fr_1fr_0.8fr_1.1fr_1.1fr] items-center gap-3 border-b border-[#e8e8e8] pb-3 text-[12px] font-semibold text-[#888888] xl:grid"
        >
          <div>Task name</div>
          <div>Project</div>
          <div>Assignee</div>
          <div>Priority</div>
          <div>Status</div>
          <div>Due Date</div>
        </div>

        <div className="flex flex-col">
          {filteredTasks.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-[14px] font-semibold text-[#555555]">
                {hasNoAssignedTasks
                  ? 'You have no assigned tasks.'
                  : 'No tasks found.'}
              </p>

              <p className="mt-1 text-[12px] text-[#999999]">
                {hasNoAssignedTasks
                  ? 'Tasks assigned to you will appear here.'
                  : 'Try changing your search or filters.'}
              </p>

              {!hasNoAssignedTasks && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="mt-4 min-h-10 rounded-lg border border-[#dedede] px-4 text-[12px] hover:bg-[#f5f5f5]"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            filteredTasks.map((row) => {
              const assigneeNames =
                row.assignees?.map(
                  (assignee) => assignee.userName,
                ) ?? [];

              const isUpdating = updatingTaskId === row.taskId;

              return (
                <div
                  key={`${row.projectId}-${row.taskId}`}
                  className="grid min-w-0 grid-cols-1 items-start gap-3 border-b border-[#f0f0f0] py-4 last:border-none sm:grid-cols-2 xl:grid-cols-[2fr_1.3fr_1fr_0.8fr_1.1fr_1.1fr] xl:items-center [&>div]:min-w-0 [overflow-wrap:anywhere]"
                >
                  <div className="flex min-w-0 flex-col sm:col-span-2 xl:col-span-1">
                    <Link
                      href={`/projects/${row.projectId}/tasks/${row.taskId}`}
                      className="text-[14px] font-bold text-[#1f1f1f] hover:underline"
                    >
                      {row.taskTitle}
                    </Link>

                    <span className="text-[11px] text-[#888888]">
                      {row.taskDescription || 'No description'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <span className="shrink-0 font-semibold xl:sr-only">
                      Project:
                    </span>

                    <span className="shrink-0">📋</span>

                    <Link
                      href={`/projects/${row.projectId}`}
                      className="min-w-0 hover:underline"
                    >
                      {row.projectName}
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <span className="shrink-0 font-semibold xl:sr-only">
                      Assignee:
                    </span>

                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8e8e8] text-[11px]">
                      👤
                    </div>

                    <div className="min-w-0">
                      {assigneeNames.length > 0 ? (
                        <span>
                          {assigneeNames.slice(0, 2).join(', ')}
                          {assigneeNames.length > 2 &&
                            ` +${assigneeNames.length - 2}`}
                        </span>
                      ) : (
                        <span>Unassigned</span>
                      )}

                      {assigneeNames.length > 2 && (
                        <details>
                          <summary className="flex min-h-11 cursor-pointer items-center">
                            Show all assignees
                          </summary>
                          <span>{assigneeNames.join(', ')}</span>
                        </details>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="mr-2 text-[12px] font-semibold xl:sr-only">
                      Priority:
                    </span>

                    <span className="rounded-xl bg-[#f0f0f0] px-2.5 py-1 text-[11px] font-medium text-[#444444]">
                      {getPriorityLabel(row.priority)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-semibold xl:sr-only">
                      Status:
                    </span>

                    <select
                      aria-label={`Change status for ${row.taskTitle}`}
                      value={row.status}
                      disabled={updatingTaskId !== null}
                      onChange={(event) => {
                        void handleStatusChange(
                          row,
                          event.target.value as TaskStatus,
                        );
                      }}
                      className="min-h-10 max-w-full rounded-lg border border-[#dedede] bg-[#f5f5f5] px-2 py-1 text-[11px] text-[#444444] outline-none focus:border-[#888888] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>

                    {isUpdating && (
                      <span className="text-[10px] text-[#888888]">
                        Saving...
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px] text-[#555555]">
                    <span className="font-semibold xl:sr-only">
                      Due:
                    </span>

                    <span>📅</span>
                    <span>{row.dueDate}</span>

                    {row.isOverdue && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Overdue
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}