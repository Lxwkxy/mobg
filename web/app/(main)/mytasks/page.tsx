
'use client';

import { useState } from 'react';
import Link from 'next/link';

import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

import type { Task, TaskStatus } from '@/types';

// ต้องประกาศนอก Component เพื่อให้ useProtectedLoad
// ไม่เข้าใจว่า load เปลี่ยนทุกครั้งที่ render
const loadMyTasks = () => taskApi.getMyTasks();

const STATUS_OPTIONS: TaskStatus[] = [
  'To do',
  'In progress',
  'Done',
];

export default function MyTasksPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const { status, data, retry, isRefreshing } =
    useProtectedLoad(loadMyTasks);

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

      // โหลดข้อมูลล่าสุดหลังเปลี่ยนสถานะสำเร็จ
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

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const tasksList = data;

  const getPriorityLabel = (priority: number) => {
    if (priority === 1) return 'High';
    if (priority === 2) return 'Medium';
    return 'Low';
  };

  const countHigh = tasksList.filter(
    (task) => task.priority === 1,
  ).length;

  const countInProgress = tasksList.filter(
    (task) => task.status === 'In progress',
  ).length;

  const countTodo = tasksList.filter(
    (task) => task.status === 'To do',
  ).length;

  const countDone = tasksList.filter(
    (task) => task.status === 'Done',
  ).length;

  const tabs = [
    { name: 'All', count: tasksList.length },
    { name: 'High priority', count: countHigh },
    { name: 'In progress', count: countInProgress },
    { name: 'To do', count: countTodo },
    { name: 'Done', count: countDone },
  ];

  const filteredTasks = tasksList.filter((task) => {
    if (activeTab === 'High priority') {
      return task.priority === 1;
    }

    if (activeTab === 'In progress') {
      return task.status === 'In progress';
    }

    if (activeTab === 'To do') {
      return task.status === 'To do';
    }

    if (activeTab === 'Done') {
      return task.status === 'Done';
    }

    return true;
  });

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

      {/* TASK FILTER TABS */}
      <div className="mb-6 flex flex-col gap-4">
        <div
          aria-label="Task filters"
          className="flex flex-wrap items-center gap-2"
        >
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveTab(tab.name)}
              aria-pressed={activeTab === tab.name}
              className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors ${
                activeTab === tab.name
                  ? 'bg-[#dcdcdc] font-bold text-[#111111]'
                  : 'border border-[#dcdcdc] bg-white text-[#555555] hover:bg-[#f4f4f4]'
              }`}
            >
              {tab.name}

              <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-[11px]">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {isRefreshing && (
          <p className="text-[12px] text-[#888888]" role="status">
            Updating tasks...
          </p>
        )}

        {actionError && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-[13px] text-red-700"
          >
            {actionError}
          </div>
        )}
      </div>

      {/* TASKS TABLE */}
      <div className="min-w-0 rounded-xl border border-[#e0e0e0] bg-white p-4 sm:p-6">
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
                {tasksList.length === 0
                  ? 'You have no assigned tasks.'
                  : 'No tasks found.'}
              </p>

              <p className="mt-1 text-[12px] text-[#999999]">
                {tasksList.length === 0
                  ? 'Tasks assigned to you will appear here.'
                  : 'Try selecting another filter.'}
              </p>
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
                  {/* TASK NAME */}
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

                  {/* PROJECT */}
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

                  {/* ASSIGNEES */}
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
                          <summary className="min-h-11 flex cursor-pointer items-center">
                            Show all assignees
                          </summary>

                          <span>{assigneeNames.join(', ')}</span>
                        </details>
                      )}
                    </div>
                  </div>

                  {/* PRIORITY */}
                  <div>
                    <span className="mr-2 text-[12px] font-semibold xl:sr-only">
                      Priority:
                    </span>

                    <span className="rounded-xl bg-[#f0f0f0] px-2.5 py-1 text-[11px] font-medium text-[#444444]">
                      {getPriorityLabel(row.priority)}
                    </span>
                  </div>

                  {/* STATUS */}
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

                  {/* DUE DATE */}
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
