
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectService, taskService } from '@/lib/mockData';
import { getCurrentUser } from '@/lib/authService';
import type { ProjectItem, TaskItem } from '@/types';

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoginRequired, setIsLoginRequired] = useState(false);
  const [pageError, setPageError] = useState('');
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function verifySessionAndFetchData() {
      setIsLoading(true);
      setPageError('');
      setIsAuthorized(false);
      setIsLoginRequired(false);

      try {
        // Verify the real Better Auth session through GET /api/me.
        const currentUser = await getCurrentUser();

        if (!isMounted) return;

        if (!currentUser) {
          setProjects([]);
          setTasks([]);
          setIsLoginRequired(true);
          return;
        }

        // Load dashboard data only after the session is verified.
        const [projData, taskData] = await Promise.all([
          projectService.getProjects(),
          taskService.getTasks(),
        ]);

        if (!isMounted) return;

        setProjects(projData);
        setTasks(taskData);
        setIsLoginRequired(false);
        setIsAuthorized(true);
      } catch (error) {
        console.error(
          'Failed to verify session or load dashboard data:',
          error,
        );

        if (isMounted) {
          setProjects([]);
          setTasks([]);
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

    void verifySessionAndFetchData();

    return () => {
      isMounted = false;
    };
  }, []);

  const totalProjects = projects.length;

  const inProgressTasks = tasks.filter(
    (task) => task.status === 'In progress',
  ).length;

  const doneTasks = tasks.filter(
    (task) => task.status === 'Done',
  ).length;

  // TODO: Replace with a real overdue-task count when task data is connected.
  const overdueTasks = 0;

  const stats = [
    {
      icon: '📁',
      label: 'Total projects',
      value: totalProjects,
    },
    {
      icon: '📋',
      label: 'Task in progress',
      value: inProgressTasks,
    },
    {
      icon: '☑️',
      label: 'Complete tasks',
      value: doneTasks,
    },
    {
      icon: '🕒',
      label: 'Overdue tasks',
      value: overdueTasks,
    },
  ];

  const getPriorityText = (priority: number) => {
    if (priority === 1) return 'High';
    if (priority === 2) return 'Medium';
    return 'Low';
  };

  // Do not render private dashboard content before session verification.
  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-[13px] text-[#888888]">
          Checking your session...
        </p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
        <p
          role="alert"
          className="text-[13px] text-[#888888]"
        >
          {pageError ||
            (isLoginRequired
              ? 'You need to log in to view this page.'
              : 'Unable to verify your session. Please try again.')}
        </p>

        {isLoginRequired && (
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px] text-[#333333] hover:bg-[#f4f4f4]"
          >
            Log in
          </button>
        )}

        {pageError && (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px] text-[#333333] hover:bg-[#f4f4f4]"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* STATS GRID */}
      <section className="grid grid-cols-4 gap-4">
        {stats.map((item) => (
          <article
            key={item.label}
            className="bg-white rounded-[14px] p-5 flex items-center justify-between shadow-sm"
          >
            <div className="w-[42px] h-[42px] bg-[#f0f0f0] rounded-xl flex items-center justify-center text-[18px]">
              {item.icon}
            </div>

            <div className="flex flex-col ml-3 flex-1">
              <span className="text-[12px] text-[#666666]">
                {item.label}
              </span>

              <strong className="text-[20px] font-bold text-[#111111] mt-0.5">
                {item.value}
              </strong>
            </div>

            <span className="text-[16px] text-[#333333]">→</span>
          </article>
        ))}
      </section>

      {/* DASHBOARD GRID */}
      <div className="grid grid-cols-[1.1fr_1fr] gap-5">
        {/* LEFT PANEL: YOUR PROJECT */}
        <section className="bg-white rounded-[16px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">
              Your Project
            </h2>

            <Link
              href="/projects"
              className="text-[12px] font-medium text-[#555555] hover:underline"
            >
              View all →
            </Link>
          </div>

          <div className="flex flex-col">
            {projects.length === 0 ? (
              <p className="py-4 text-[12px] text-[#888888]">
                No projects yet.
              </p>
            ) : (
              projects.map((project) => (
                <article
                  key={project.projectId}
                  className="flex items-center justify-between py-4 border-b border-[#f0f0f0] last:border-none"
                >
                  <div>
                    <strong className="block text-[13px] text-[#222222]">
                      {project.projectName}
                    </strong>

                    <p className="mt-1 text-[11px] text-[#888888]">
                      {project.projectDescription ?? 'No description'}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 text-[11px] text-[#666666]">
                    <span>
                      ☑ {project.completedTasks} / {project.totalTasks} tasks
                    </span>

                    <span>
                      📅{' '}
                      {project.dueDate
                        ? `Due ${project.dueDate}`
                        : 'No due date'}
                    </span>

                    <span className="text-[16px] font-bold text-[#333333]">
                      ›
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* RIGHT PANEL: UPCOMING TASKS */}
        <section className="bg-white rounded-[16px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">
              Upcoming Tasks
            </h2>

            <Link
              href="/mytasks"
              className="text-[12px] font-medium text-[#555555] hover:underline"
            >
              View all →
            </Link>
          </div>

          <div className="flex flex-col">
            {tasks.length === 0 ? (
              <p className="py-4 text-[12px] text-[#888888]">
                No upcoming tasks.
              </p>
            ) : (
              tasks.map((task) => (
                <Link
                  key={task.taskId}
                  href="/mytasks"
                  className="py-[14px] border-b border-[#f0f0f0] last:border-none block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#f2f2f2] text-[#444444]">
                        {getPriorityText(task.priority)}
                      </span>

                      {task.projectName && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#eef0f2] text-[#555555]">
                          {task.projectName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-[#777777]">
                      <span>
                        📅{' '}
                        {task.dueDate
                          ? `Due ${task.dueDate}`
                          : 'No due date'}
                      </span>

                      <span className="text-[16px] font-bold text-[#333333]">
                        ›
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#222222]">
                    <span>🗃️</span>
                    <strong>{task.taskTitle}</strong>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
