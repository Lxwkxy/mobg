'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/authService';
import { projectApi } from '@/lib/projectApi';
import type { ProjectItem } from '@/types';

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();

  const [project, setProject] = useState<ProjectItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadProject = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const user = await getCurrentUser();

      if (!user) {
        router.replace('/login');
        return;
      }

      const projectId = Number(params.projectId);

      if (!Number.isSafeInteger(projectId) || projectId <= 0) {
        setError('Invalid project ID.');
        return;
      }

      const result = await projectApi.getProjectById(projectId);
      setProject(result);
    } catch (err) {
      console.error('Failed to load project:', err);

      const status = (err as { status?: number }).status;

      if (status === 401) {
        router.replace('/login');
        return;
      }

      if (status === 403) {
        setError('You do not have permission to view this project.');
      } else if (status === 404) {
        setError('Project not found.');
      } else {
        setError('Unable to load the project. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [params.projectId, router]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  if (isLoading) {
    return <p className="py-12 text-center text-[13px] text-[#777777]">Loading project...</p>;
  }

  if (error || !project) {
    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-6">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          {error || 'Project not found.'}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px]"
          >
            Back to Projects
          </button>

          {error !== 'Project not found.' && (
            <button
              type="button"
              onClick={() => void loadProject()}
              className="rounded-lg bg-[#222222] px-4 py-2 text-[12px] text-white"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const progress = Math.max(
    0,
    Math.min(100, project.progressPercent ?? 0),
  );

  return (
    <div className="mx-auto w-full max-w-4xl">
      <Link
        href="/projects"
        className="mb-5 inline-block text-[13px] text-[#666666] hover:text-black"
      >
        ← Back to Projects
      </Link>

      <div className="rounded-2xl border border-[#e0e0e0] bg-white p-6 md:p-8">
        <div className="mb-6">
          <p className="mb-2 text-[12px] text-[#777777]">
            Project details
          </p>

          <h1 className="mb-3 text-[30px] font-extrabold text-[#1f1f1f]">
            {project.projectName}
          </h1>

          <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#666666]">
            {project.projectDescription || 'No description provided.'}
          </p>
        </div>

        <div className="grid gap-4 border-t border-[#eeeeee] pt-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] text-[#888888]">Start date</p>
            <p className="text-[13px] font-semibold">
              {formatDate(project.startDate)}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[11px] text-[#888888]">Due date</p>
            <p className="text-[13px] font-semibold">
              {formatDate(project.dueDate)}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[11px] text-[#888888]">Status</p>
            <p className="text-[13px] font-semibold">
              {project.derivedStatus}
            </p>
          </div>

          <div>
            <p className="mb-1 text-[11px] text-[#888888]">Your role</p>
            <p className="text-[13px] font-semibold">
              {project.myRole}
            </p>
          </div>
        </div>

        <div className="mt-7 border-t border-[#eeeeee] pt-6">
          <div className="mb-2 flex justify-between text-[12px]">
            <span>Progress</span>
            <strong>{progress}%</strong>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-[#e5e5e5]">
            <div
              className="h-full rounded-full bg-[#62c400]"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-3 text-[12px] text-[#777777]">
            {project.completedTasks} of {project.totalTasks} tasks completed
          </p>
        </div>
      </div>
    </div>
  );
}