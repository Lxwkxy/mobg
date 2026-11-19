'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, request } from '@/lib/projectApi';
import { handleResultKeys } from '@/lib/keyboardNavigation';
import type { SearchResults } from '@/types';

type Outcome =
  | { status: 'loading' }
  | { status: 'ready'; results: SearchResults }
  | { status: 'error'; message: string };

type PendingSearch = {
  controller: AbortController;
  timer?: ReturnType<typeof setTimeout>;
};

export default function GlobalSearch({ userId }: { userId: number | null }) {
  const pathname = usePathname();
  return <SearchField key={`${userId}:${pathname}`} disabled={userId === null} />;
}

function SearchField({ disabled }: { disabled: boolean }) {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const pending = useRef<PendingSearch | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultsId = useId();

  const cancel = useCallback(() => {
    const previous = pending.current;
    pending.current = null;
    if (previous) {
      clearTimeout(previous.timer);
      previous.controller.abort();
    }
  }, []);

  const close = useCallback(() => {
    cancel();
    setOutcome(null);
  }, [cancel]);

  useEffect(() => {
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !formRef.current?.contains(event.target)) close();
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      cancel();
    };
  }, [cancel, close]);

  function search(value: string, debounce: boolean) {
    cancel();
    const term = value.trim();
    if (!term) {
      setOutcome(null);
      return;
    }

    const work: PendingSearch = { controller: new AbortController() };
    pending.current = work;
    setOutcome({ status: 'loading' });

    async function load() {
      let next: Outcome;
      try {
        const params = new URLSearchParams({ q: term });
        const results = await request<{ success: true } & SearchResults>(
          `/api/search?${params}`, { signal: work.controller.signal },
        );
        next = { status: 'ready', results };
      } catch (error) {
        next = {
          status: 'error',
          message:
            error instanceof ApiRequestError && error.status === 401
              ? 'Your session has expired. Log in to search again.'
              : 'Unable to search. Try again.',
        };
      }

      // Only this request may publish its outcome, even if the transport ignores abort.
      if (pending.current === work) {
        pending.current = null;
        setOutcome(next);
      }
    }

    if (debounce) work.timer = setTimeout(() => void load(), 250);
    else void load();
  }

  const results = outcome?.status === 'ready' ? outcome.results : null;
  const resultCount = results ? results.projects.length + results.tasks.length : 0;
  const resultLink =
    'group flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm [overflow-wrap:anywhere] transition-colors hover:bg-[#f6f4ff] focus-visible:outline-2 focus-visible:outline-[#5B44BA]';

  return (
    <form
      ref={formRef}
      role="search"
      className="relative min-w-0 w-full max-w-[540px]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) search(query, false);
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => handleResultKeys(event, resultsId, close)}
    >
      <div className="group flex min-w-0 items-center gap-2.5 rounded-full bg-[#f6f4ff] border border-[#e4dcff] py-1.5 pr-1.5 pl-4 transition-all duration-200 focus-within:bg-white focus-within:border-[#5B44BA] focus-within:ring-4 focus-within:ring-[#5B44BA]/12">
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-[#7c6fa0] transition-colors group-focus-within:text-[#5B44BA]"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          placeholder="Search projects, tasks ..."
          aria-label="Search projects and tasks"
          aria-controls={outcome ? resultsId : undefined}
          value={query}
          maxLength={200}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            search(event.target.value, true);
          }}
          className="min-h-9 min-w-0 flex-1 bg-transparent text-base text-[#231942] placeholder:text-[#8c80ad] outline-none sm:text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !query.trim()}
          className="min-h-9 rounded-full bg-[#5B44BA] px-4 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(91,68,186,0.22)] hover:bg-[#4d38a3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5B44BA] transition-colors cursor-pointer disabled:bg-[#5B44BA]/45 disabled:shadow-none disabled:cursor-not-allowed"
        >
          Search
        </button>
      </div>

      <p role="status" className="sr-only">
        {outcome?.status === 'loading' && 'Searching…'}
        {outcome?.status === 'error' && outcome.message}
        {results && (resultCount ? `${resultCount} search results available.` : 'No matching projects or tasks.')}
      </p>

      {outcome && (
        <div
          id={resultsId}
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-[min(24rem,50dvh)] overflow-y-auto rounded-2xl border border-[#e6e0ff] bg-white p-2 shadow-[0_14px_32px_rgba(91,68,186,0.12)]"
        >
          {outcome.status === 'loading' && <p className="px-3 py-2 text-sm text-[#6e6487]">Searching…</p>}
          {outcome.status === 'error' && <p className="px-3 py-2 text-sm text-red-700">{outcome.message}</p>}
          {results && resultCount === 0 && <p className="px-3 py-2 text-sm text-[#6e6487]">No matching projects or tasks.</p>}
          {results && results.projects.length > 0 && (
            <div>
              <div className="flex items-center justify-between px-3 py-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7c6fa0]">
                  Projects
                </p>
                <span className="rounded-full bg-[#f0ecff] px-2 py-0.5 text-[11px] font-semibold text-[#5B44BA]">
                  {results.projects.length}
                </span>
              </div>
              <ul aria-label="Projects" className="space-y-0.5">
                {results.projects.map((project) => (
                  <li key={project.projectId}>
                    <Link href={`/projects/${project.projectId}`} prefetch={false} onNavigate={close} className={resultLink}>
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 shrink-0 text-[#7c6fa0] transition-colors group-hover:text-[#5B44BA]"
                      >
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="font-medium text-[#231942]">{project.projectName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {results && results.tasks.length > 0 && (
            <div className={results.projects.length > 0 ? 'mt-2 border-t border-[#f0ecff] pt-2' : ''}>
              <div className="flex items-center justify-between px-3 py-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#7c6fa0]">
                  Tasks
                </p>
                <span className="rounded-full bg-[#f0ecff] px-2 py-0.5 text-[11px] font-semibold text-[#5B44BA]">
                  {results.tasks.length}
                </span>
              </div>
              <ul aria-label="Tasks" className="space-y-0.5">
                {results.tasks.map((task) => (
                  <li key={task.taskId}>
                    <Link href={`/projects/${task.projectId}/tasks/${task.taskId}`} prefetch={false} onNavigate={close} className={resultLink}>
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 shrink-0 text-[#7c6fa0] transition-colors group-hover:text-[#5B44BA]"
                      >
                        <polyline points="9 11 12 14 22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                      </svg>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium text-[#231942]">{task.taskTitle}</span>
                        <span className="block text-xs text-[#6e6487]">{task.projectName}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
