'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { projectService, taskService } from '@/lib/mockData';
import type { ProjectSummary, TaskItem } from '@/types';

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [projData, taskData] = await Promise.all([
          projectService.getProjects(),
          taskService.getTasks(),
        ]);
        setProjects(projData);
        setTasks(taskData);
      } catch (error) {
        console.error('Failed to fetch dashboard data', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const totalProjects = projects.length;
  const inProgressTasks = tasks.filter((t) => t.status === 'In progress').length;
  const doneTasks = tasks.filter((t) => t.status === 'Done').length;
  const overdueTasks = 3;

  const stats = [
    { icon: '📁', label: 'Total projects', value: String(totalProjects || '8') },
    { icon: '📋', label: 'Task in progress', value: String(inProgressTasks || '4') },
    { icon: '☑️', label: 'Complete tasks', value: String(doneTasks || '12') },
    { icon: '🕒', label: 'Overdue tasks', value: String(overdueTasks) },
  ];

  const getPriorityText = (priority: number) => {
    if (priority === 1) return 'High';
    if (priority === 2) return 'Medium';
    return 'Low';
  };

  return (
    <div className="min-w-0 flex flex-col gap-6 [overflow-wrap:anywhere]">
      {/* STATS GRID */}
      <section aria-label="Dashboard summary" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((item, idx) => (
          <article key={idx} className="min-w-0 bg-white rounded-[14px] p-5 flex items-center justify-between shadow-sm">
            <div className="shrink-0 w-[42px] h-[42px] bg-[#f0f0f0] rounded-xl flex items-center justify-center text-[18px]">
              {item.icon}
            </div>
            <div className="min-w-0 flex flex-col mx-3 flex-1">
              <span className="text-[12px] text-[#666666]">{item.label}</span>
              <strong className="text-[20px] font-bold text-[#111111] mt-0.5">{item.value}</strong>
            </div>
            <span className="text-[16px] text-[#333333]">→</span>
          </article>
        ))}
      </section>

      {/* DASHBOARD GRID */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-5">
        {/* LEFT PANEL: YOUR PROJECT */}
        <section className="min-w-0 bg-white rounded-[16px] p-4 sm:p-6 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">Your Project</h2>
            <Link href="/projects" className="min-h-11 inline-flex items-center text-[12px] font-medium text-[#555555] hover:underline">
              View all →
            </Link>
          </div>

          <div className="flex flex-col">
            {isLoading ? (
              <p className="py-4 text-[12px] text-[#888888]">Loading projects...</p>
            ) : (
              projects.map((p) => (
                <article key={p.projectId} className="min-w-0 flex flex-col gap-3 py-4 border-b border-[#f0f0f0] last:border-none">
                  <div className="min-w-0">
                    <strong className="block text-[13px] text-[#222222]">{p.projectName}</strong>
                    <p className="mt-1 text-[11px] text-[#888888]">{p.projectDescription ?? 'No description'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-[#666666]">
                    <span>☑ {p.completedTasks} / {p.totalTasks} tasks</span>
                    <span>📅 {p.dueDate ? `Due ${p.dueDate}` : 'No due date'}</span>
                    <span className="text-[16px] font-bold text-[#333333]">›</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {/* RIGHT PANEL: UPCOMING TASKS */}
        <section className="min-w-0 bg-white rounded-[16px] p-4 sm:p-6 shadow-sm">
          <div className="flex flex-wrap gap-2 items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-[#111111]">Upcoming Tasks</h2>
            <Link href="/mytasks" className="min-h-11 inline-flex items-center text-[12px] font-medium text-[#555555] hover:underline">
              View all →
            </Link>
          </div>

          <div className="flex flex-col">
            {isLoading ? (
              <p className="py-4 text-[12px] text-[#888888]">Loading tasks...</p>
            ) : (
              tasks.map((t) => (
                <Link key={t.taskId} href="/mytasks" className="py-[14px] border-b border-[#f0f0f0] last:border-none block">
                  <div className="flex flex-wrap gap-2 items-center justify-between mb-2">
                    <div className="min-w-0 flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#f2f2f2] text-[#444444]">
                        {getPriorityText(t.priority)}
                      </span>
                      {t.projectName && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#eef0f2] text-[#555555]">
                          {t.projectName}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-[#777777]">
                      <span>📅 Due {t.dueDate}</span>
                      <span className="text-[16px] font-bold text-[#333333]">›</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#222222]">
                    <span className="shrink-0">🗃️</span>
                    <strong className="min-w-0">{t.taskTitle}</strong>
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
