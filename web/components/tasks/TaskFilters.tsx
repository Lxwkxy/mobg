
'use client';

import type { TaskPriority, TaskStatus } from '@/types';

type Props = {
  search: string;
  status: TaskStatus | '';
  priority: TaskPriority | '';
  onSearchChange: (value: string) => void;
  onStatusChange: (value: TaskStatus | '') => void;
  onPriorityChange: (value: TaskPriority | '') => void;
  onClear: () => void;
};

export default function TaskFilters({
  search,
  status,
  priority,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onClear,
}: Props) {
  const hasFilters = Boolean(search || status || priority);

  return (
    <div className="mb-5 rounded-xl border border-[#e5e5e5] bg-white p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto]">
        <input
          type="search"
          aria-label="Search tasks"
          placeholder="Search task name..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="min-h-11 min-w-0 rounded-lg border border-[#dedede] px-3 text-[13px] outline-none focus:border-[#888888]"
        />

        <select
          aria-label="Filter by status"
          value={status}
          onChange={(event) =>
            onStatusChange(event.target.value as TaskStatus | '')
          }
          className="min-h-11 rounded-lg border border-[#dedede] bg-white px-3 text-[13px] outline-none focus:border-[#888888]"
        >
          <option value="">All statuses</option>
          <option value="To do">To do</option>
          <option value="In progress">In progress</option>
          <option value="Done">Done</option>
        </select>

        <select
          aria-label="Filter by priority"
          value={priority}
          onChange={(event) =>
            onPriorityChange(
              event.target.value === ''
                ? ''
                : (Number(event.target.value) as TaskPriority),
            )
          }
          className="min-h-11 rounded-lg border border-[#dedede] bg-white px-3 text-[13px] outline-none focus:border-[#888888]"
        >
          <option value="">All priorities</option>
          <option value="1">High</option>
          <option value="2">Medium</option>
          <option value="3">Low</option>
        </select>

        <button
          type="button"
          onClick={onClear}
          disabled={!hasFilters}
          className="min-h-11 rounded-lg border border-[#dedede] px-4 text-[12px] font-medium text-[#555555] transition hover:bg-[#f5f5f5] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
