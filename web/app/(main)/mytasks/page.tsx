'use client';

import { useState } from 'react';
import { taskService } from '@/lib/mockData';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

// อยู่นอก component เพื่อให้ identity คงที่ (hook จะโหลดครั้งเดียวตอนเปิดหน้า)
const loadTasks = () => taskService.getTasks();

export default function MyTasksPage() {
  const [activeTab, setActiveTab] = useState('All');
  const { status, data, retry } = useProtectedLoad(loadTasks);

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

  const countHigh = tasksList.filter((task) => task.priority === 1).length;
  const countInProgress = tasksList.filter(
    (task) => task.status === 'In progress',
  ).length;
  const countTodo = tasksList.filter((task) => task.status === 'To do').length;
  const countDone = tasksList.filter((task) => task.status === 'Done').length;

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

  return (
    <div className="min-w-0">
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold text-[#1f1f1f] mb-1">
          My Tasks
        </h1>
        <p className="text-[14px] text-[#777777]">
          All your assigned tasks across projects
        </p>
      </div>

      {/* FILTER & TABS ROW */}
      <div className="flex flex-col gap-4 mb-6">
        <div aria-label="Task filters" className="flex flex-wrap items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              type="button"
              onClick={() => setActiveTab(tab.name)}
              aria-pressed={activeTab === tab.name}
              className={`min-h-11 px-3.5 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
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

        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <div className="flex min-w-0 min-h-11 items-center gap-2 bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 w-full sm:w-[220px] sm:flex-1">
            <span className="text-[12px] text-[#888]">🔍</span>
            <input
              type="text"
              placeholder="Search tasks..."
              aria-label="Search tasks"
              className="min-w-0 border-none bg-transparent outline-none w-full text-[13px]"
            />
          </div>

          <select aria-label="Project filter" className="min-w-0 min-h-11 bg-white border border-[#dcdcdc] rounded-lg px-3 py-2 text-[13px] text-[#444] outline-none cursor-pointer">
            <option>All project</option>
            <option>Web Programming</option>
            <option>OS Project</option>
          </select>

          <select aria-label="Sort tasks" className="min-w-0 min-h-11 bg-white border border-[#dcdcdc] rounded-lg px-3 py-2 text-[13px] text-[#444] outline-none cursor-pointer">
            <option>Sort by</option>
            <option>Priority</option>
            <option>Name</option>
          </select>
        </div>
      </div>

      {/* TASKS TABLE CARD */}
      <div className="min-w-0 bg-white rounded-xl border border-[#e0e0e0] p-4 sm:p-6">
        <div aria-hidden="true" className="hidden xl:grid grid-cols-[2fr_1.3fr_1fr_0.8fr_1fr_1.1fr_0.6fr] gap-3 items-center pb-3 border-b border-[#e8e8e8] text-[12px] font-semibold text-[#888888]">
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
              const assigneeNames = row.assignees?.map(assignee => assignee.userName) || [];

              return (
                <div
                  key={row.taskId}
                  className="grid min-w-0 grid-cols-1 sm:grid-cols-2 xl:grid-cols-[2fr_1.3fr_1fr_0.8fr_1fr_1.1fr_0.6fr] gap-3 items-start xl:items-center py-4 border-b border-[#f0f0f0] last:border-none [&>div]:min-w-0 [overflow-wrap:anywhere]"
                >
                  <div className="flex flex-col sm:col-span-2 xl:col-span-1">
                    <strong className="text-[14px] font-bold text-[#1f1f1f]">
                      {row.taskTitle}
                    </strong>
                    <span className="text-[11px] text-[#888888]">
                      {row.taskDescription}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <span className="shrink-0 xl:sr-only font-semibold">Project:</span>
                    <span className="shrink-0">📋</span>
                    <span className="min-w-0">{row.projectName || 'General'}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <span className="shrink-0 xl:sr-only font-semibold">Assignee:</span>
                    <div className="shrink-0 w-6 h-6 rounded-full bg-[#e8e8e8] flex items-center justify-center text-[11px]">
                      👤
                    </div>
                    <div className="min-w-0">
                      <span>{assigneeNames.slice(0, 2).join(', ') || 'Unassigned'}</span>
                      {assigneeNames.length > 2 && (
                        <details>
                          <summary className="min-h-11 flex items-center cursor-pointer" aria-label="More assignees">
                            +{assigneeNames.length - 2}
                          </summary>
                          <span>{assigneeNames.slice(2).join(', ')}</span>
                        </details>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="xl:sr-only text-[12px] font-semibold mr-2">Priority:</span>
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[#f0f0f0] text-[#444]">
                      {getPriorityLabel(row.priority)}
                    </span>
                  </div>

                  <div>
                    <span className="xl:sr-only text-[12px] font-semibold mr-2">Status:</span>
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-medium bg-[#eaeaea] text-[#444]">
                      {row.status}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[12px] text-[#555555]">
                    <span className="xl:sr-only font-semibold">Due:</span>
                    <span>📅</span>
                    <span>{row.dueDate}</span>
                  </div>

                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      aria-label={`More options for ${row.taskTitle}`}
                      className="min-h-11 min-w-11 text-[14px] text-[#777] cursor-pointer"
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
