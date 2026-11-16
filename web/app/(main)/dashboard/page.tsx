
'use client';

import Link from 'next/link';

import { dashboardApi } from '@/lib/dashboardApi';
import { projectApi } from '@/lib/projectApi';
import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

import type {
  DashboardResponse,
  ProjectsResponse,
  Task,
} from '@/types';

type DashboardData = {
  summary: Extract<
    DashboardResponse,
    { success: true }
  >['summary'];

  projects: Extract<
    ProjectsResponse,
    { success: true }
  >['projects'];

  importantTasks: Task[];
};

const loadDashboard = async (): Promise<DashboardData> => {
  const [dashboard, projectResult, myTasks] = await Promise.all([
    dashboardApi.getDashboard(5),
    projectApi.getProjects({ page: 1, pageSize: 5 }),
    taskApi.getMyTasks(),
  ]);

  const importantTasks = myTasks
    .filter((task) => task.status !== 'Done')
    .sort((a, b) => {
      // Priority: High (1) -> Medium (2) -> Low (3)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }

      // Due date: nearest -> farthest
      const dateComparison =
        new Date(a.dueDate).getTime() -
        new Date(b.dueDate).getTime();

      if (dateComparison !== 0) {
        return dateComparison;
      }

      // Use taskId as a stable tie-breaker
      return a.taskId - b.taskId;
    })
    .slice(0, 5);

  return {
    summary: dashboard.summary,
    projects: projectResult.projects,
    importantTasks,
  };
};

const getPriorityText = (priority: number) => {
  if (priority === 1) return 'High';
  if (priority === 2) return 'Medium';
  return 'Low';
};

const formatDate = (date: string) => {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
};

export default function DashboardPage() {
  const { status, data, isRefreshing, retry } =
    useProtectedLoad(loadDashboard, {
      revalidateOnFocus: true,
      hideDataWhileRefreshing: true,
    });

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const { summary, projects, importantTasks } = data;

  const stats = [
    {
      icon: '📁',
      label: 'Total projects',
      value: summary.projectCount,
    },
    {
      icon: '📋',
      label: 'Total tasks',
      value: summary.taskCount,
    },
    {
      icon: '🔄',
      label: 'Task in progress',
      value: summary.statusCounts.inProgress,
    },
    {
      icon: '☑️',
      label: 'Complete tasks',
      value: summary.statusCounts.done,
    },
    {
      icon: '🕒',
      label: 'Overdue tasks',
      value: summary.overdueCount,
    },
    {
      icon: '⚡',
      label: 'High priority',
      value: summary.highPriorityCount,
    },
  ];

  return (
    <div
      className={`min-w-0 flex flex-col gap-6 [overflow-wrap:anywhere] transition-opacity ${
        isRefreshing ? 'opacity-60' : ''
      }`}
    >
      {/* DASHBOARD SUMMARY */}
      <section
        aria-label="Dashboard summary"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
      >
        {stats.map((item) => (
          <article
            key={item.label}
            className="min-w-0 bg-white rounded-[14px] p-5 flex items-center justify-between shadow-sm"
          >
            <div className="shrink-0 w-[42px] h-[42px] bg-[#f0f0f0] rounded-xl flex items-center justify-center text-[18px]">
              {item.icon}
            </div>

            <div className="min-w-0 flex flex-col mx-3 flex-1">
              <span className="text-[12px] text-[#666666]">
                {item.label}
              </span>

              <strong className="text-[20px] font-bold text-[#111111] mt-0.5">
                {item.value}
              </strong>
            </div>
          </article>
        ))}
      </section>

      {/* DASHBOARD CONTENT */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
        {/* YOUR PROJECT */}
        <section className="min-w-0 bg-white rounded-[16px] p-4 sm:p-6 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">
              Your Project
            </h2>

            <Link
              href="/projects"
              className="min-h-11 inline-flex items-center text-[12px] font-medium text-[#555555] hover:underline"
            >
              View all →
            </Link>
          </div>

          {projects.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[#888888]">
              You have no projects yet.
            </p>
          ) : (
            <div className="flex flex-col">
              {projects.map((project) => {
                const progress = Math.max(
                  0,
                  Math.min(100, project.progressPercent),
                );

                return (
                  <Link
                    key={project.projectId}
                    href={`/projects/${project.projectId}`}
                    className="min-w-0 flex flex-col gap-3 py-4 border-b border-[#f0f0f0] last:border-none hover:bg-[#fafafa] transition-colors"
                  >
                    <div className="min-w-0">
                      <strong className="block text-[13px] text-[#222222]">
                        {project.projectName}
                      </strong>

                      <p className="mt-1 text-[11px] text-[#888888]">
                        {project.projectDescription ?? 'No description'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#666666]">
                      <span>
                        ☑ {project.completedTasks} / {project.totalTasks} tasks
                      </span>

                      <span>
                        📅{' '}
                        {project.dueDate
                          ? `Due ${formatDate(project.dueDate)}`
                          : 'No due date'}
                      </span>

                      <span className="ml-auto font-semibold text-[#333333]">
                        {progress}%
                      </span>
                    </div>

                    <div className="w-full h-[6px] bg-[#e5e5e5] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#62c400] rounded-full"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        {/* IMPORTANT TASKS */}
        <section className="min-w-0 bg-white rounded-[16px] p-4 sm:p-6 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">
              Important Tasks
            </h2>

            <Link
              href="/mytasks"
              className="min-h-11 inline-flex items-center text-[12px] font-medium text-[#555555] hover:underline"
            >
              View all →
            </Link>
          </div>

          {importantTasks.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-[#888888]">
              No important tasks.
            </p>
          ) : (
            <div className="flex flex-col">
              {importantTasks.map((task) => (
                <Link
                  key={`${task.projectId}-${task.taskId}`}
                  href={`/projects/${task.projectId}/tasks/${task.taskId}`}
                  className="py-[14px] border-b border-[#f0f0f0] last:border-none block hover:bg-[#fafafa] transition-colors"
                >
                  <div className="flex flex-wrap gap-2 items-center justify-between mb-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          task.priority === 1
                            ? 'bg-[#fff0e8] text-[#c45a20]'
                            : task.priority === 2
                              ? 'bg-[#fff8df] text-[#987000]'
                              : 'bg-[#eef0f2] text-[#555555]'
                        }`}
                      >
                        {getPriorityText(task.priority)}
                      </span>

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#eef0f2] text-[#555555]">
                        {task.projectName}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-[#777777]">
                      <span>
                        Due {formatDate(task.dueDate)}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="min-w-0 text-[12px] text-[#222222]">
                      {task.taskTitle}
                    </strong>

                    <span className="text-[10px] text-[#777777]">
                      {task.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
