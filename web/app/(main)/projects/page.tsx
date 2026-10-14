'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectApi } from '@/lib/projectApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';
import { StatusBadge } from '@/components/ui/Badge';

export default function ProjectsPage() {
  const [page, setPage] = useState(1);
  const router = useRouter();

  // เปลี่ยน page -> load เปลี่ยน identity -> hook โหลดใหม่และคงเนื้อหาเดิมไว้ระหว่างรอ
  const load = useCallback(() => projectApi.getProjects({ page }), [page]);
  const { status, data, isRefreshing, retry } = useProtectedLoad(load);

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const { projects: projectsList, pagination } = data;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[32px] font-extrabold text-[#1f1f1f] mb-1">
          Projects
        </h1>
        <p className="text-[14px] text-[#777777]">
          Manage all your projects here
        </p>
      </div>

      {/* FILTER BAR */}
      <div className="flex items-center gap-3 mb-7">
        <div className="flex items-center gap-2 bg-white border border-[#dcdcdc] rounded-lg px-3.5 py-2 w-[320px]">
          <span className="text-[13px] text-[#888]">🔍</span>
          <input
            type="text"
            placeholder="Search projects..."
            className="border-none bg-transparent outline-none w-full text-[13px]"
          />
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

        <button
          type="button"
          onClick={() => router.push('/projects/create')}
          className="ml-auto bg-[#1f1f1f] hover:bg-black text-white px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors"
        >
          + Create Project
        </button>
      </div>

      {/* PROJECTS GRID */}
      {projectsList.length === 0 ? (
        <div className="py-12 text-center text-[14px] text-[#777777]">
          No projects found.
        </div>
      ) : (
        <div
          className={`grid grid-cols-2 gap-5 transition-opacity ${
            isRefreshing ? 'opacity-60' : ''
          }`}
        >
          {projectsList.map((item) => {
            // ใช้ค่าที่ backend คำนวณมาแล้ว ไม่คำนวณซ้ำฝั่ง frontend
            const progress = Math.max(0, Math.min(100, item.progressPercent));

            return (
              <article
                key={item.projectId}
                className="bg-white rounded-xl border border-[#e0e0e0] p-6 flex flex-col"
              >
                <div className="flex items-center justify-between mb-2 gap-3">
                  <h3 className="text-[20px] font-bold text-[#1f1f1f]">
                    {item.projectName}
                  </h3>

                  <div className="flex items-center gap-3">
                    <StatusBadge status={item.derivedStatus} />

                    <button
                      type="button"
                      aria-label={`More options for ${item.projectName}`}
                      className="text-[16px] text-[#555] cursor-pointer"
                    >
                      •••
                    </button>
                  </div>
                </div>

                <p className="text-[13px] text-[#777777] leading-[1.5] mb-5">
                  {item.projectDescription ?? 'No description'}
                </p>

                {/* Members & Dates */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center">
                    <div
                      className="w-[28px] h-[28px] rounded-full bg-[#e8e8e8] border-2 border-white flex items-center justify-center text-[12px]"
                      title="Member information is not connected yet"
                    >
                      👤
                    </div>

                    <span className="ml-2 text-[11px] text-[#777777]">
                      Member details unavailable
                    </span>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">🚀</span>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[#888]">
                          Start date
                        </span>
                        <strong className="text-[11px] font-bold text-[#333]">
                          {item.startDate}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[16px]">📅</span>
                      <div className="flex flex-col">
                        <span className="text-[10px] text-[#888]">
                          Due date
                        </span>
                        <strong className="text-[11px] font-bold text-[#333]">
                          {item.dueDate ?? 'No due date'}
                        </strong>
                      </div>
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
                    <div
                      className="h-full bg-[#62c400] rounded-full"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center gap-4 pt-4 border-t border-[#f0f0f0] mt-auto">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-[#f4f4f4] rounded-md flex items-center justify-center text-[13px]">
                      📑
                    </span>

                    <div className="flex items-baseline gap-1">
                      <strong className="text-[13px] text-[#1f1f1f]">
                        {item.totalTasks}
                      </strong>
                      <span className="text-[10px] text-[#777]">
                        Total tasks
                      </span>
                    </div>
                  </div>

                  <div className="w-px h-5 bg-[#e5e5e5]" />

                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 bg-[#f4f4f4] rounded-md flex items-center justify-center text-[13px]">
                      ⚠️
                    </span>

                    <div className="flex flex-col">
                      <strong className="text-[13px] text-[#1f1f1f]">—</strong>
                      <span className="text-[10px] text-[#777]">
                        High priority
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/projects/${item.projectId}`}
                    className="ml-auto bg-[#f4f4f4] hover:bg-[#e8e8e8] border border-[#e0e0e0] px-3.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#333] transition-colors"
                  >
                    View project →
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* PAGINATION */}
      {pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 text-[12px]">
          <button
            type="button"
            disabled={isRefreshing || page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-[#dcdcdc] bg-white px-3.5 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            ← Previous
          </button>

          <span className="text-[#555]">
            Page {pagination.page} of {pagination.totalPages}
          </span>

          <button
            type="button"
            disabled={isRefreshing || page >= pagination.totalPages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-[#dcdcdc] bg-white px-3.5 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}