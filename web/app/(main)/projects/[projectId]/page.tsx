'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiRequestError, projectApi } from '@/lib/projectApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

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

function describeError(httpStatus: number | undefined) {
  if (httpStatus === 400) return 'Invalid project ID.';
  if (httpStatus === 404) return 'Project not found.';
  return 'Unable to load the project. Please try again.';
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();

  const load = useCallback(async () => {
    const projectId = Number(params.projectId);

    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw new ApiRequestError('Invalid project ID.', 400);
    }

    return projectApi.getProjectById(projectId);
  }, [params.projectId]);

  const { status, data: project, httpStatus, retry } = useProtectedLoad(load);

  if (status === 'error') {
    const canRetry = httpStatus !== 400 && httpStatus !== 404;

    return (
      <div className="mx-auto max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-6">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          {describeError(httpStatus)}
        </p>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => router.push('/projects')}
            className="rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px]"
          >
            Back to Projects
          </button>

          {canRetry && (
            <button
              type="button"
              onClick={retry}
              className="rounded-lg bg-[#222222] px-4 py-2 text-[12px] text-white"
            >
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  if (status !== 'ready' || project === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const progress = Math.max(0, Math.min(100, project.progressPercent));

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
          <p className="mb-2 text-[12px] text-[#777777]">Project details</p>

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
            <p className="text-[13px] font-semibold">{project.derivedStatus}</p>
          </div>

          <div>
            <p className="mb-1 text-[11px] text-[#888888]">Your role</p>
            <p className="text-[13px] font-semibold">{project.myRole ?? '—'}</p>
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