'use client';

import Link from 'next/link';
import { useCallback, useId } from 'react';
import { ApiRequestError, request } from '@/lib/projectApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import type { ActivitiesResponse } from '@/types';

const activityDate = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export default function ActivityFeed({ projectId, taskId }: { projectId: number; taskId?: number }) {
  const headingId = useId();
  const load = useCallback(async () => {
    const scope = taskId === undefined ? '' : `/tasks/${taskId}`;
    const body = await request<Extract<ActivitiesResponse, { success: true }>>(
      `/api/projects/${projectId}${scope}/activity`,
    );
    if (!Array.isArray(body.activities)) {
      throw new ApiRequestError('The server returned an invalid activity feed.', 200);
    }
    return body.activities;
  }, [projectId, taskId]);
  const { status, data, retry } = useProtectedLoad(load);

  return (
    <section aria-labelledby={headingId} className="min-w-0 rounded-2xl border border-[#ebe6ff] bg-white p-5 [overflow-wrap:anywhere]">
      <h2 id={headingId} className="text-[17px] font-extrabold text-[#1f1f1f]">Activity</h2>
      {status === 'loading' && <p role="status" className="mt-3 text-sm text-[#6e6487]">Loading activity…</p>}
      {status === 'error' && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 text-sm">
          <p role="alert" className="text-red-700">Unable to load activity.</p>
          <button type="button" onClick={retry} className="min-h-11 font-semibold text-[#5B44BA] underline">Try again</button>
        </div>
      )}
      {status === 'ready' && data?.length === 0 && (
        <p className="mt-3 text-sm text-[#6e6487]">No activity yet.</p>
      )}
      {status === 'ready' && data && data.length > 0 && (
        <ol className="mt-2 max-h-96 divide-y divide-[#ebe6ff] overflow-y-auto">
          {data.map((event) => (
            <li key={event.activityId} className="py-3 text-sm text-[#3a3747]">
              <p>
                <strong>{event.actorName}</strong>{' '}
                {event.activityType === 'task_created' ? (taskId === undefined ? 'created' : 'created this task') : (
                  taskId === undefined ? 'commented on' : 'added a comment'
                )}
                {taskId === undefined && (
                  <> <Link href={`/projects/${projectId}/tasks/${event.taskId}`} className="font-semibold text-[#5B44BA] underline">{event.taskTitle}</Link></>
                )}
              </p>
              {event.commentText !== null && <p className="mt-1 whitespace-pre-wrap">{event.commentText}</p>}
              <time dateTime={event.occurredAt} className="mt-1 block text-xs text-[#6e6487]">
                {activityDate.format(new Date(event.occurredAt))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
