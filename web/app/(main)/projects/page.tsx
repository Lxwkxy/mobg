'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { projectService } from '@/lib/mockData';
import { ProjectItem } from '@/types';

export default function ProjectsPage() {
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await projectService.getProjects();
        setProjectsList(data);
      } catch (error) {
        console.error('Failed to fetch projects', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold text-[#1f1f1f] mb-1">Projects</h1>
        <p className="text-[14px] text-[#777777]">Manage all your projects here</p>
      </div>

      {/* FILTER BAR */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex items-center gap-2 bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 w-[320px]">
          <span className="text-[13px] text-[#888]">🔍</span>
          <input type="text" placeholder="Search projects..." className="border-none bg-transparent outline-none w-full text-[13px]" />
        </div>

        <select className="bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 text-[13px] text-[#444] outline-none cursor-pointer">
          <option>All status</option>
          <option>To do</option>
          <option>In progress</option>
          <option>Done</option>
        </select>

        <select className="bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 text-[13px] text-[#444] outline-none cursor-pointer">
          <option>Sort by</option>
          <option>Name</option>
          <option>Due date</option>
        </select>

        <button className="ml-auto bg-[#1f1f1f] hover:bg-black text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors">
          + Create Project
        </button>
      </div>

      {/* PROJECTS GRID */}
      {isLoading ? (
        <div className="py-12 text-center text-[14px] text-[#777777]">Loading projects...</div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {projectsList.map((item) => {
            const progress = item.totalTasks > 0 ? Math.round((item.completedTasks / item.totalTasks) * 100) : 0;
            const membersCount = 4;
            const highPriorityCount = 3;

            return (
              <article key={item.projectId} className="bg-white rounded-xl border border-[#e0e0e0] p-6 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[20px] font-bold text-[#1f1f1f]">{item.projectName}</h3>
                  <button className="text-[16px] text-[#555] cursor-pointer">•••</button>
                </div>
                <p className="text-[13px] text-[#777777] leading-[1.5] mb-5">{item.projectDescription ?? 'No description'}</p>

                {/* Members & Due Date */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-[28px] h-[28px] rounded-full bg-[#e8e8e8] border-2 border-white flex items-center justify-center text-[12px] -mr-1.5">
                        👤
                      </div>
                    ))}
                    {membersCount > 3 && (
                      <span className="ml-3 bg-[#f0f0f0] px-2 py-0.5 rounded-full text-[11px] font-semibold text-[#555]">
                        +{membersCount - 3}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[16px]">📅</span>
                    <div className="flex flex-col">
                      <span className="text-[10px] text-[#888]">Due date</span>
                      <strong className="text-[11px] font-bold text-[#333]">{item.dueDate ?? 'No due date'}</strong>
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-5">
                  <div className="flex justify-between text-[11px] text-[#555555] mb-1.5">
                    <span>Progress</span>
                    <strong className="text-[#111111]">{progress}%</strong>
                  </div>
                  <div className="w-full h-[7px] bg-[#e5e5e5] rounded-full overflow-hidden">
                    <div className="h-full bg-[#62c400] rounded-full" style={{ width: `${progress}%` }} />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-4 pt-4 border-t border-[#f0f0f0] mt-auto">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-[#f4f4f4] rounded-md flex items-center justify-center text-[13px]">📑</span>
                    <div className="flex items-baseline gap-1">
                      <strong className="text-[13px] text-[#1f1f1f]">{item.totalTasks}</strong>
                      <span className="text-[10px] text-[#777]">Total tasks</span>
                    </div>
                  </div>
                  <div className="w-px h-5 bg-[#e5e5e5]" />
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-[#f4f4f4] rounded-md flex items-center justify-center text-[13px]">⚠️</span>
                    <div className="flex items-baseline gap-1">
                      <strong className="text-[13px] text-[#1f1f1f]">{highPriorityCount}</strong>
                      <span className="text-[10px] text-[#777]">High priority</span>
                    </div>
                  </div>
                  <Link href="/mytasks" className="ml-auto bg-[#f4f4f4] hover:bg-[#e8e8e8] border border-[#e0e0e0] px-3.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#333] transition-colors">
                    View project →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}