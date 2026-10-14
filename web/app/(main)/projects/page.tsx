
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { projectApi } from '@/lib/projectApi';
import { getCurrentUser } from '@/lib/authService';
import type { ProjectItem } from '@/types';

export default function ProjectsPage() {
  const [projectsList, setProjectsList] = useState<ProjectItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoginRequired, setIsLoginRequired] = useState(false);
  const [pageError, setPageError] = useState('');
  const router = useRouter();

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    setPageError('');
    setIsAuthorized(false);
    setIsLoginRequired(false);

    try {
      // Verify the real Better Auth session through GET /api/me.
      const currentUser = await getCurrentUser();

      if (!currentUser) {
        setProjectsList([]);
        setIsLoginRequired(true);
        return;
      }

      // Load real project data from Backend API.
      const data = await projectApi.getProjects();

      setProjectsList(data);
      setIsLoginRequired(false);
      setIsAuthorized(true);
    } catch (error) {
      console.error(
        'Failed to verify session or fetch projects:',
        error,
      );

      setProjectsList([]);
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
    void loadProjects();
  }, [loadProjects]);

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
            onClick={() => void loadProjects()}
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
        <div className="grid grid-cols-2 gap-5">
          {projectsList.map((item) => {
            const progress =
              item.totalTasks > 0
                ? Math.round(
                    (item.completedTasks / item.totalTasks) * 100,
                  )
                : 0;

            return (
              <article
                key={item.projectId}
                className="bg-white rounded-xl border border-[#e0e0e0] p-6 flex flex-col"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[20px] font-bold text-[#1f1f1f]">
                    {item.projectName}
                  </h3>

                  <button
                    type="button"
                    aria-label={`More options for ${item.projectName}`}
                    className="text-[16px] text-[#555] cursor-pointer"
                  >
                    •••
                  </button>
                </div>

                <p className="text-[13px] text-[#777777] leading-[1.5] mb-5">
                  {item.projectDescription ?? 'No description'}
                </p>

                {/* Members & Due Date */}
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

                {/* Progress Bar */}
                <div className="mb-5">
                  <div className="flex justify-between text-[11px] text-[#555555] mb-1.5">
                    <span>Progress</span>
                    <strong className="text-[#111111]">
                      {progress}%
                    </strong>
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
                      <strong className="text-[13px] text-[#1f1f1f]">
                        —
                      </strong>
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
    </div>
  );
}
