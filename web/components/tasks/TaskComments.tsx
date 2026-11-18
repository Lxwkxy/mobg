'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiRequestError } from '@/lib/projectApi';
import { useSession } from '@/lib/SessionProvider';
import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

export default function TaskComments({ projectId, taskId, onAccessLost }: {
  projectId: number;
  taskId: number;
  onAccessLost: () => void;
}) {
  const { session, isCurrentSessionRevision } = useSession();
  const load = useCallback(() => taskApi.getComments(projectId, taskId), [projectId, taskId]);
  // TaskDetailContent owns session/focus verification. Refreshing the session here
  // would hide the parent, unmount this component, and restart that cycle on mount.
  const { status, data: comments, retry } = useProtectedLoad(load);
  const [text, setText] = useState('');
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mountedRef = useRef(false);
  const postingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const commentText = text.trim();
    if (!commentText || postingRef.current || status !== 'ready' || session.status !== 'ready') return;
    const revision = session.revision;
    const isCurrent = () => mountedRef.current && isCurrentSessionRevision(revision);
    postingRef.current = true;
    setIsPosting(true);
    setError('');
    setNotice('');
    try {
      await taskApi.addComment(projectId, taskId, { commentText });
      if (!isCurrent()) return;
      setText('');
      setNotice('Comment posted.');
      retry();
    } catch (cause) {
      if (!isCurrent()) return;
      if (cause instanceof ApiRequestError && [401, 403, 404].includes(cause.status)) {
        onAccessLost();
      }
      setError(cause instanceof Error ? cause.message : 'Unable to post your comment. Please try again.');
    } finally {
      postingRef.current = false;
      if (isCurrent()) setIsPosting(false);
    }
  }

  return (
    <section aria-labelledby="task-comments-heading" className="mx-auto mt-6 w-full min-w-0 max-w-4xl rounded-2xl border border-[#e0e0e0] bg-white p-4 [overflow-wrap:anywhere] sm:p-6 md:p-8">
      <h2 id="task-comments-heading" className="mb-4 text-[16px] font-semibold text-[#222222]">Comments</h2>
      {status === 'error' ? (
        <div>
          <p role="alert" className="text-[13px] text-red-600">Unable to load comments. Please try again.</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 text-[13px] underline">Try again</button>
        </div>
      ) : status !== 'ready' ? (
        <p role="status" className="text-[13px] text-[#666666]">Loading comments…</p>
      ) : (
        <>
          {comments?.length === 0 ? (
            <p className="text-[13px] text-[#888888]">No comments yet. Start the conversation.</p>
          ) : (
            <ol className="space-y-4">
              {comments?.map((comment) => (
                <li key={comment.commentId} className="rounded-lg border border-[#eeeeee] bg-[#fafafa] p-4">
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-[13px] font-semibold text-[#222222]">{comment.userName}</span>
                    <time dateTime={comment.createdAt} className="text-[12px] text-[#888888]">
                      {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(comment.createdAt))}
                    </time>
                  </div>
                  <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#444444]">{comment.commentText}</p>
                </li>
              ))}
            </ol>
          )}
          <form onSubmit={submit} className="mt-6 border-t border-[#eeeeee] pt-5">
            <label htmlFor="task-comment" className="mb-2 block text-[13px] font-medium text-[#333333]">Add a comment</label>
            <textarea id="task-comment" value={text} onChange={(event) => setText(event.target.value)}
              rows={3} required disabled={isPosting} placeholder="Write a comment…"
              aria-describedby={error ? 'task-comment-error' : undefined}
              className="w-full min-w-0 resize-y rounded-lg border border-[#d5d5d5] p-3 text-[14px] focus:border-[#222222] focus:outline-none disabled:opacity-50" />
            {error && <p id="task-comment-error" role="alert" className="mt-2 text-[13px] text-red-600">{error}</p>}
            <div className="mt-3 flex justify-end">
              <button type="submit" disabled={!text.trim() || isPosting}
                className="min-h-11 rounded-lg bg-[#222222] px-5 py-2 text-[13px] font-medium text-white hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-50">
                {isPosting ? 'Posting…' : 'Post comment'}
              </button>
            </div>
          </form>
        </>
      )}
      <p role="status" className="mt-2 text-[13px] text-[#666666]">{notice}</p>
    </section>
  );
}
