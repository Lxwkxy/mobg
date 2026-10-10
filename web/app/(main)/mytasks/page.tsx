'use client';

import { useState, useEffect } from 'react';
import { taskService } from '@/lib/mockData';
import { TaskItem } from '@/types';

export default function MyTasksPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [tasksList, setTasksList] = useState<TaskItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const data = await taskService.getTasks();
        setTasksList(data);
      } catch (error) {
        console.error('Failed to fetch tasks', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTasks();
  }, []);

  // ตัวแปลง Priority จากตัวเลข (1, 2, 3) เป็นข้อความ
  const getPriorityLabel = (priority: number) => {
    if (priority === 1) return 'High';
    if (priority === 2) return 'Medium';
    return 'Low';
  };

  // คำนวณจำนวนในแต่ละ Tab จากข้อมูลจริง
  const countHigh = tasksList.filter((t) => t.priority === 1).length;
  const countInProgress = tasksList.filter((t) => t.status === 'In progress').length;
  const countTodo = tasksList.filter((t) => t.status === 'To do').length;
  const countDone = tasksList.filter((t) => t.status === 'Done').length;

  const tabs = [
    { name: 'All', count: tasksList.length },
    { name: 'High priority', count: countHigh },
    { name: 'In progress', count: countInProgress },
    { name: 'To do', count: countTodo },
    { name: 'Done', count: countDone },
  ];

  // กรองรายการ Task ตาม Tab ที่เลือก
  const filteredTasks = tasksList.filter((task) => {
    if (activeTab === 'High priority') return task.priority === 1;
    if (activeTab === 'In progress') return task.status === 'In progress';
    if (activeTab === 'To do') return task.status === 'To do';
    if (activeTab === 'Done') return task.status === 'Done';
    return true; // 'All'
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold text-[#1f1f1f] mb-1">My Tasks</h1>
        <p className="text-[14px] text-[#777777]">All your assigned tasks across projects</p>
      </div>

      {/* FILTER & TABS ROW */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.name}
              onClick={() => setActiveTab(tab.name)}
              className={`px-3.5 py-2 rounded-lg text-[13px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === tab.name
                  ? 'bg-[#dcdcdc] text-[#111111] font-bold'
                  : 'bg-white border border-[#dcdcdc] text-[#555555] hover:bg-[#f4f4f4]'
              }`}
            >
              {tab.name}
              <span className="bg-black/5 px-1.5 py-0.5 rounded-full text-[11px]">{tab.count}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 w-[220px]">
            <span className="text-[12px] text-[#888]">🔍</span>
            <input type="text" placeholder="Search tasks..." className="border-none bg-transparent outline-none w-full text-[13px]" />
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
          {isLoading ? (
            <div className="py-8 text-center text-[13px] text-[#888888]">Loading tasks...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="py-8 text-center text-[13px] text-[#888888]">No tasks found.</div>
          ) : (
            filteredTasks.map((row) => {
              const assigneeName = row.assignees?.[0]?.userName || 'Unassigned';
              return (
                <div key={row.taskId} className="grid grid-cols-[2fr_1.3fr_1fr_0.8fr_1fr_1.1fr_0.6fr] items-center py-4 border-b border-[#f0f0f0] last:border-none">
                  <div className="flex flex-col">
                    <strong className="text-[14px] font-bold text-[#1f1f1f]">{row.taskTitle}</strong>
                    <span className="text-[11px] text-[#888888]">{row.taskDescription}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <span>📋</span>
                    <span>{row.projectName || 'General'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-[#444444]">
                    <div className="w-6 h-6 rounded-full bg-[#e8e8e8] flex items-center justify-center text-[11px]">👤</div>
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
                    <button className="text-[14px] text-[#777] cursor-pointer">•••</button>
                    <span className="text-[16px] text-[#555] cursor-pointer">›</span>
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