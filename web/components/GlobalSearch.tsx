'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ApiRequestError, request } from '@/lib/projectApi';
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
  const inputRef = useRef<HTMLInputElement>(null);
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
        next = { status: 'error', message: error instanceof ApiRequestError && error.status === 401
          ? 'Your session has expired. Log in to search again.'
          : 'Unable to search. Try again.' };
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
  const resultLink = 'block rounded-md px-3 py-2.5 text-sm [overflow-wrap:anywhere] hover:bg-[#f4f4f4] focus-visible:outline-2 focus-visible:outline-violet-600';

  return (
    <form
      ref={formRef}
      role="search"
      className="relative mr-auto min-w-0 max-w-[580px] flex-1 basis-full sm:basis-0"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) search(query, false);
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && outcome) {
          event.preventDefault();
          inputRef.current?.focus();
          close();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-2.5 rounded-full bg-[#eaeaea] py-1.5 pr-2 pl-4 focus-within:ring-2 focus-within:ring-violet-600">
        <span aria-hidden="true" className="text-sm">🔍</span>
        <input
          ref={inputRef}
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
          className="min-h-9 min-w-0 flex-1 bg-transparent text-base outline-none sm:text-sm"
        />
        <button
          type="submit"
          disabled={disabled || !query.trim()}
          className="min-h-9 rounded-full bg-white px-3 text-xs font-medium text-[#333333] hover:bg-violet-50 focus-visible:outline-2 focus-visible:outline-violet-600 disabled:opacity-60"
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
        <div id={resultsId} className="absolute inset-x-0 top-full z-20 mt-2 max-h-[min(24rem,50dvh)] overflow-y-auto rounded-xl border border-[#e0e0e0] bg-white p-2 shadow-lg">
          {outcome.status === 'loading' && <p className="px-3 py-2 text-sm text-[#555555]">Searching…</p>}
          {outcome.status === 'error' && <p className="px-3 py-2 text-sm text-red-700">{outcome.message}</p>}
          {results && resultCount === 0 && <p className="px-3 py-2 text-sm text-[#555555]">No matching projects or tasks.</p>}
          {results && results.projects.length > 0 && (
            <>
              <p className="px-3 py-2 text-xs font-semibold text-[#555555]">Projects</p>
              <ul aria-label="Projects">
                {results.projects.map((project) => (
                  <li key={project.projectId}>
                    <Link href={`/projects/${project.projectId}`} prefetch={false} onNavigate={close} className={resultLink}>
                      {project.projectName}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          {results && results.tasks.length > 0 && (
            <>
              <p className="px-3 py-2 text-xs font-semibold text-[#555555]">Tasks</p>
              <ul aria-label="Tasks">
                {results.tasks.map((task) => (
                  <li key={task.taskId}>
                    <Link href={`/projects/${task.projectId}/tasks/${task.taskId}`} prefetch={false} onNavigate={close} className={resultLink}>
                      <span className="block">{task.taskTitle}</span>
                      <span className="block text-xs text-[#555555]">{task.projectName}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </form>
  );
}
