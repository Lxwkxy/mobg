'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/SessionProvider';
import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';

type SortOrder = 'latest' | 'oldest';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function formatExactDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatRelativeTime(value: string, nowMs: number | null) {
  const date = new Date(value);
  const timestamp = date.getTime();
  if (Number.isNaN(timestamp)) return value;
  if (nowMs === null) return formatExactDateTime(value);

  const diffSeconds = Math.floor((nowMs - timestamp) / 1000);
  if (diffSeconds < 60) return 'Just now';

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  }

  return formatExactDateTime(value);
}

function UserAvatar({ name }: { name?: string | null }) {
  const initials = name ? getInitials(name) : '';

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[12.5px] font-bold text-[#5B44BA]"
    >
      {initials || (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      )}
    </span>
  );
}

export default function TaskComments({
  projectId,
  taskId,
  draft,
  onDraftChange,
  onSubmit,
  isPosting,
  error,
  notice,
}: {
  projectId: number;
  taskId: number;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => void;
  isPosting: boolean;
  error: string;
  notice: string;
}) {
  const { session } = useSession();
  const load = useCallback(
    () => taskApi.getComments(projectId, taskId),
    [projectId, taskId],
  );
  // TaskDetailContent owns session/focus verification. Refreshing the session here
  // would hide the parent, unmount this component, and restart that cycle on mount.
  const { status, data: comments, retry } = useProtectedLoad(load);

  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const initialTimer = setTimeout(() => setNowMs(Date.now()), 0);
    const interval = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!isSortOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(event.target as Node)
      ) {
        setIsSortOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSortOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isSortOpen]);

  const sortedComments = useMemo(() => {
    if (!comments) return [];
    const copy = [...comments];
    copy.sort((a, b) => {
      const timeDiff = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      const order =
        Number.isFinite(timeDiff) && timeDiff !== 0
          ? timeDiff
          : a.commentId - b.commentId;
      return sortOrder === 'latest' ? -order : order;
    });
    return copy;
  }, [comments, sortOrder]);

  const currentUserName =
    session.status === 'ready' ? session.user?.userName : null;

  return (
    <section
      aria-label="Comments"
      className="w-full min-w-0 rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 sm:p-7 shadow-[0_6px_24px_rgba(35,25,66,0.05)] [overflow-wrap:anywhere]"
    >
      {/* HEADER: Comments (count) + Sort dropdown */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ece8f8] pb-4">
        <h2
          id="task-comments-heading"
          className="text-[18px] sm:text-[20px] font-extrabold text-[#1f1f1f]"
        >
          Comments
          {status === 'ready' && comments && (
            <span aria-hidden="true" className="ml-1.5">
              ({comments.length})
            </span>
          )}
        </h2>

        {status === 'ready' && (
          <div ref={sortDropdownRef} className="relative">
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isSortOpen}
              onClick={() => setIsSortOpen((prev) => !prev)}
              className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-[#cfc9e8] bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f8f6fe] hover:text-[#5B44BA] cursor-pointer"
            >
              <span>
                {sortOrder === 'latest' ? 'Sort by latest' : 'Sort by oldest'}
              </span>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.3"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className={`transition-transform duration-150 ${
                  isSortOpen ? 'rotate-180 text-[#5B44BA]' : 'text-[#6e6b7b]'
                }`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {isSortOpen && (
              <div
                role="listbox"
                aria-label="Sort comments"
                className="absolute right-0 top-full z-20 mt-1.5 w-40 rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
              >
                {(
                  [
                    { value: 'latest', label: 'Sort by latest' },
                    { value: 'oldest', label: 'Sort by oldest' },
                  ] as const
                ).map((option) => {
                  const isSelected = sortOrder === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => {
                        setSortOrder(option.value);
                        setIsSortOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                          : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                      }`}
                    >
                      <span>{option.label}</span>
                      {isSelected && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* BODY */}
      {status === 'error' ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 p-4">
          <p role="alert" className="text-[13.5px] font-medium text-rose-600">
            Unable to load comments. Please try again.
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-[#cfc9e8] bg-white px-4 py-2 text-[12.5px] font-semibold text-[#333333] hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] transition-colors cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : status !== 'ready' ? (
        <p role="status" className="py-6 text-[13.5px] font-medium text-[#7d7696]">
          Loading comments…
        </p>
      ) : (
        <>
          {sortedComments.length === 0 ? (
            <p className="py-7 text-center text-[13.5px] text-[#8f89a6]">
              No comments yet. Start the conversation.
            </p>
          ) : (
            <ol className="divide-y divide-[#ece8f8]">
              {sortedComments.map((comment) => (
                <li key={comment.commentId} className="py-4">
                  <div className="flex items-start gap-3.5">
                    <UserAvatar name={comment.userName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <span className="text-[13.5px] font-bold text-[#1f1f1f]">
                          {comment.userName}
                        </span>
                        <time
                          dateTime={comment.createdAt}
                          title={formatExactDateTime(comment.createdAt)}
                          className="text-[12px] font-medium text-[#8f89a6]"
                        >
                          {formatRelativeTime(comment.createdAt, nowMs)}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-[#3a3747]">
                        {comment.commentText}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {/* BOTTOM INPUT BAR: Avatar + Textarea + Send Button */}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
            className="mt-3 border-t border-[#ece8f8] pt-5"
          >
            <div className="flex items-start sm:items-center gap-3.5">
              <div className="hidden sm:block">
                <UserAvatar name={currentUserName} />
              </div>

              <div className="min-w-0 flex-1">
                <label htmlFor="task-comment" className="sr-only">
                  Add a comment
                </label>
                <textarea
                  id="task-comment"
                  value={draft}
                  onChange={(event) => onDraftChange(event.target.value)}
                  rows={2}
                  required
                  disabled={isPosting}
                  placeholder="Write a comment…"
                  aria-describedby={error ? 'task-comment-error' : undefined}
                  className="w-full min-w-0 resize-y rounded-xl border border-[#cfc9e8] bg-[#f8f6fe] px-4 py-2.5 text-[13.5px] leading-relaxed text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15 disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c]"
                />
              </div>

              <button
                type="submit"
                disabled={!draft.trim() || isPosting}
                className="min-h-11 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-[#5B44BA] px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.24)] transition-all hover:bg-[#4934a3] hover:shadow-[0_6px_18px_rgba(91,68,186,0.32)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
                <span>{isPosting ? 'Posting…' : 'Post comment'}</span>
              </button>
            </div>

            {error && (
              <p
                id="task-comment-error"
                role="alert"
                className="mt-2 sm:pl-[54px] text-[12.5px] font-medium text-rose-600"
              >
                {error}
              </p>
            )}
            <p
              role="status"
              className="mt-2 sm:pl-[54px] text-[12.5px] font-semibold text-emerald-600"
            >
              {notice}
            </p>
          </form>
        </>
      )}
    </section>
  );
}