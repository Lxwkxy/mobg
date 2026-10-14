
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { taskService } from '@/lib/mockData';
import { getCurrentUser } from '@/lib/authService';
import type { TaskItem } from '@/types';

export default function MyTasksPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [tasksList, setTasksList] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoginRequired, setIsLoginRequired] = useState(false);
  const [pageError, setPageError] = useState('');
  const router = useRouter();

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setPageError('');
    setIsAuthorized(false);
    setIsLoginRequired(false);

    try {
      const currentUser = await getCurrentUser();

      if (!currentUser) {
        setTasksList([]);
        setIsLoginRequired(true);
        return;
      }

      // Keep the existing task service and UI unchanged.
      const data = await taskService.getTasks();

      setTasksList(data);
      setIsLoginRequired(false);
      setIsAuthorized(true);
    } catch (error) {
      console.error(
        'Failed to verify session or fetch tasks:',
        error,
      );

      setTasksList([]);
      setIsAuthorized(false);
      setIsLoginRequired(false);
      setPageError(
        'Unable to connect to the server. Please try again.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function verifySessionAndFetchTasks() {
      setIsLoading(true);
      setPageError('');
      setIsAuthorized(false);
      setIsLoginRequired(false);

      try {
        const currentUser = await getCurrentUser();

        if (!isMounted) return;

        if (!currentUser) {
          setTasksList([]);
          setIsLoginRequired(true);
          return;
        }

        const data = await taskService.getTasks();

        if (!isMounted) return;

        setTasksList(data);
        setIsLoginRequired(false);
        setIsAuthorized(true);
      } catch (error) {
        console.error(
          'Failed to verify session or fetch tasks:',
          error,
        );

        if (isMounted) {
          setTasksList([]);
          setIsAuthorized(false);
          setIsLoginRequired(false);
          setPageError(
            'Unable to connect to the server. Please try again.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void verifySessionAndFetchTasks();

    return () => {
      isMounted = false;
    };
  }, []);

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
    if (activeTab === 'High priority') return task.priority === 1;
    if (activeTab === 'In progress') return task.status === 'In progress';
    if (activeTab === 'To do') return task.status === 'To do';
    if (activeTab === 'Done') return task.status === 'Done';
    return true;
  });

  if (isLoading || !isAuthorized) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
        <p
          role={pageError || isLoginRequired ? 'alert' : undefined}
          className="text-[13px] text-[#888888]"
        >
          {isLoading
            ? 'Checking your session...'
            : pageError ||
              (isLoginRequired
                ? 'You need to log in to view this page.'
                : 'Unable to verify your session. Please try again.')}
        </p>

        {!isLoading && isLoginRequired && (
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px] text-[#333333] hover:bg-[#f4f4f4]"
          >
            Log in
          </button>
        )}

        {!isLoading && pageError && (
          <button
            type="button"
            onClick={() => void loadTasks()}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px] text-[#333333] hover:bg-[#f4f4f4]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold text-[#1f1f1f] mb-1">
          My Tasks
        </h1>
        <p className="text-[14px] text-[#777777]">
          All your assigned tasks across projects
        </p>
      </div>

      {/* FILTER & TABS ROW */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveTab(tab.name)}
              className={`px-3.5 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === tab.name
                  ? 'bg-[#dcdcdc] text-[#111111] font-bold'
                  : 'bg-white border border-[#dcdcdc] text-[#555555] hover:bg-[#f4f4f4]'
              }`}
            >
              {tab.name}
              <span className="bg-black/5 px-1.5 py-0.5 rounded-full text-[11px]">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 w-[220px]">
            <span className="text-[12px] text-[#888]">🔍</span>
            <input
              type="text"
              placeholder="Search tasks..."
              className="border-none bg-transparent outline-none w-full text-[13px]"
            />
          </div>

          <select className="bg-white border border-[#dcdcdc] rounded-lg px-3 py-2 text-[13px] text-[#444] outline-none cursor-pointer">
            <option>All project</option>
            <option>Web Programming</option>
            <option>OS Project</option>
          </select>

          <select className="bg-white border border-[#dcdcdc] rounded-lg px-3 py-2 text-[13px] text-[#444] outline-none cursor-pointer">
            <option>Sort by</option>
            <option>Priority</option>
            <option>Name</option>
          </select>
        </div>
      </div>

      {/* TASKS TABLE CARD */}
      <div className="bg-white rounded-xl border border-[#e0e0e0] p-6">
        <div className="grid grid-cols-[2fr_1.3fr_1fr_0.8fr_1fr_1.1fr_0.6fr] items-center pb-3 border-b border-[#e8e8e8] text-[12px] font-semibold text-[#888888]">
          <div>Tasks name</div>
          <div>Project</div>
          <div>Assignee</div>
          <div>Priority</div>
          <div>Status</div>
          <div>Due Date</div>
          <div />
        </div>

        <div className="flex flex-col">
          {filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#888888]">
              No tasks found.
            </div>
          ) : (
            filteredTasks.map((row) => {
              const assigneeName =
                row.assignees?.[0]?.userName || 'Unassigned';

              return (
                <div
                  key={row.taskId}
                  className="grid grid-cols-[2fr_1.3fr_1fr_0.8fr_1fr_1.1fr_0.6fr] items-center py-4 border-b border-[#f0f0f0] last:border-none"
                >
                  <div className="flex flex-col">
                    <strong className="text-[14px] font-bold text-[#1f1f1f]">
                      {row.taskTitle}
                    </strong>
                    <span className="text-[11px] text-[#888888]">
                      {row.taskDescription}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <span>📋</span>
                    <span>{row.projectName || 'General'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <div className="w-6 h-6 rounded-full bg-[#e8e8e8] flex items-center justify-center text-[11px]">
                      👤
                    </div>
                    <span>{assigneeName}</span>
                  </div>

                  <div>
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[#f0f0f0] text-[#444]">
                      {getPriorityLabel(row.priority)}
                    </span>
                  </div>

                  <div>
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[#eaeaea] text-[#444]">
                      {row.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px] text-[#555555]">
                    <span>📅</span>
                    <span>{row.dueDate}</span>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      aria-label={`More options for ${row.taskTitle}`}
                      className="text-[14px] text-[#777] cursor-pointer"
                    >
                      •••
                    </button>
                    <span className="text-[16px] text-[#555] cursor-pointer">
                      ›
                    </span>
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
