'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { projectApi } from '@/lib/projectApi';
import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';
import KeyboardPopup from '@/components/ui/KeyboardPopup';

import type {
  Task,
  TaskPriority,
  TaskStatus,
} from '@/types';

const STATUS_OPTIONS: TaskStatus[] = [
  'To do',
  'In progress',
  'Done',
];

const STATUS_FILTER_OPTIONS: { value: TaskStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'To do', label: 'To do' },
  { value: 'In progress', label: 'In progress' },
  { value: 'Done', label: 'Done' },
];

const PRIORITY_FILTER_OPTIONS: { value: TaskPriority | ''; label: string }[] = [
  { value: '', label: 'All priorities' },
  { value: 1, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Low' },
];

const SORT_OPTIONS: {
  value: 'DEFAULT' | 'DUE_DATE' | 'PRIORITY' | 'NAME' | 'PROJECT';
  label: string;
}[] = [
  { value: 'DEFAULT', label: 'Sort by' },
  { value: 'DUE_DATE', label: 'Due date' },
  { value: 'PRIORITY', label: 'Priority' },
  { value: 'NAME', label: 'Task name' },
  { value: 'PROJECT', label: 'Project' },
];

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

function parseStatusParam(value: string | null): TaskStatus | '' {
  if (value === 'To do' || value === 'In progress' || value === 'Done') {
    return value;
  }
  return '';
}

function parsePriorityParam(value: string | null): TaskPriority | '' {
  if (value === '1') return 1;
  if (value === '2') return 2;
  if (value === '3') return 3;
  return '';
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return 'No due date';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getPriorityLabel(priority: number) {
  if (priority === 1) return 'High';
  if (priority === 2) return 'Medium';
  return 'Low';
}

function getPriorityBadgeClass(priority: number) {
  if (priority === 1) return 'bg-red-50 text-red-600 border-red-200';
  if (priority === 2) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-cyan-50 text-cyan-700 border-cyan-200';
}

function getStatusBadgeClass(status: TaskStatus) {
  if (status === 'Done') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'In progress') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-neutral-200 text-neutral-700 border-neutral-300';
}

function getStatusButtonClass(status: TaskStatus, isOpen: boolean) {
  if (status === 'Done') {
    return isOpen
      ? 'border-emerald-400 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-500/15'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300';
  }
  if (status === 'In progress') {
    return isOpen
      ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-500/15'
      : 'border-blue-200 bg-blue-50 text-blue-700 hover:border-blue-300';
  }
  return isOpen
    ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
    : 'border-[#dcd4fa] bg-[#f4f1ff] text-[#4c35ab] hover:border-[#b3a4eb]';
}

// ดึงงานทั้งหมดจากทุกโปรเจกต์ที่ผู้ใช้เป็นสมาชิก (ขอบเขตเดียวกับตัวเลขบน Dashboard)
async function loadProjectTasks() {
  const pageSize = 50;
  const first = await projectApi.getProjects({ page: 1, pageSize });
  const projects = [...first.projects];
  for (let page = 2; page <= first.pagination.totalPages; page += 1) {
    const result = await projectApi.getProjects({ page, pageSize });
    projects.push(...result.projects);
  }

  const tasksByProject = await Promise.all(
    projects.map((project) => taskApi.getTasks(project.projectId)),
  );

  return {
    tasks: tasksByProject.flat(),
    ownedProjects: new Set(
      projects
        .filter((project) => project.myRole === 'Owner')
        .map((project) => project.projectId),
    ),
  };
}

export default function MyTasksPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // อ่านค่าตัวกรองและขอบเขตข้อมูลจาก URL query parameters
  const isProjectScope = searchParams.get('scope') === 'projects';
  const statusFilter = parseStatusParam(searchParams.get('status'));
  const priorityFilter = parsePriorityParam(searchParams.get('priority'));
  const overdueOnly = searchParams.get('overdue') === 'true';
  const excludeDone = searchParams.get('excludeDone') === 'true';

  const [search, setSearch] = useState('');
  const [projectFilterState, setProjectFilterState] = useState<{
    scope: boolean;
    value: number | 'ALL';
  }>({
    scope: isProjectScope,
    value: 'ALL',
  });
  const [sortBy, setSortBy] = useState<
    'DEFAULT' | 'DUE_DATE' | 'PRIORITY' | 'NAME' | 'PROJECT'
  >('DEFAULT');
  const [openDropdown, setOpenDropdown] = useState<
    'project' | 'status' | 'priority' | 'sort' | null
  >(null);
  const [openStatusRowKey, setOpenStatusRowKey] = useState<string | null>(null);

  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');

  const filterBarRef = useRef<HTMLDivElement | null>(null);
  const projectTriggerRef = useRef<HTMLButtonElement | null>(null);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);
  const priorityTriggerRef = useRef<HTMLButtonElement | null>(null);
  const sortTriggerRef = useRef<HTMLButtonElement | null>(null);
  const statusRowTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // รีเซ็ต projectFilter อัตโนมัติเมื่อขอบเขตงานเปลี่ยน (เช่น สลับจาก Project Tasks กลับเป็น My Tasks)
  const projectFilter =
    projectFilterState.scope === isProjectScope
      ? projectFilterState.value
      : 'ALL';

  const setProjectFilter = useCallback(
    (value: number | 'ALL') => {
      setProjectFilterState({ scope: isProjectScope, value });
    },
    [isProjectScope],
  );

  const closeDropdownAndRestoreFocus = useCallback(
    (dropdown: 'project' | 'status' | 'priority' | 'sort' | null) => {
      setOpenDropdown(null);
      if (!dropdown) return;
      const triggerMap = {
        project: projectTriggerRef.current,
        status: statusTriggerRef.current,
        priority: priorityTriggerRef.current,
        sort: sortTriggerRef.current,
      };
      requestAnimationFrame(() => {
        triggerMap[dropdown]?.focus();
      });
    },
    [],
  );

  useEffect(() => {
    if (openDropdown === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        filterBarRef.current &&
        !filterBarRef.current.contains(event.target as Node)
      ) {
        setOpenDropdown(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDropdownAndRestoreFocus(openDropdown);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown, closeDropdownAndRestoreFocus]);

  useEffect(() => {
    if (openStatusRowKey === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('[data-status-dropdown="true"]')) {
        setOpenStatusRowKey(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        const currentKey = openStatusRowKey;
        setOpenStatusRowKey(null);
        requestAnimationFrame(() => {
          statusRowTriggerRefs.current[currentKey]?.focus();
        });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openStatusRowKey]);

  const updateQueryParams = useCallback(
    (updates: {
      scope?: 'mine' | 'projects';
      status?: TaskStatus | '';
      priority?: TaskPriority | '';
      overdue?: boolean;
      excludeDone?: boolean;
    }) => {
      const next = new URLSearchParams(searchParams.toString());

      if (updates.scope !== undefined) {
        const nextIsProjectScope = updates.scope === 'projects';
        setProjectFilterState({ scope: nextIsProjectScope, value: 'ALL' });
        if (nextIsProjectScope) {
          next.set('scope', 'projects');
        } else {
          next.delete('scope');
        }
      }

      if (updates.status !== undefined) {
        if (updates.status) {
          next.set('status', updates.status);
        } else {
          next.delete('status');
        }
      }

      if (updates.priority !== undefined) {
        if (updates.priority !== '') {
          next.set('priority', String(updates.priority));
        } else {
          next.delete('priority');
        }
      }

      if (updates.overdue !== undefined) {
        if (updates.overdue) {
          next.set('overdue', 'true');
        } else {
          next.delete('overdue');
        }
      }

      if (updates.excludeDone !== undefined) {
        if (updates.excludeDone) {
          next.set('excludeDone', 'true');
        } else {
          next.delete('excludeDone');
        }
      }

      const qs = next.toString();
      router.replace(qs ? `/mytasks?${qs}` : '/mytasks', { scroll: false });
    },
    [router, searchParams],
  );

  // โหลดข้อมูลตามขอบเขต (งานทั้งหมดในโปรเจกต์ที่เป็นสมาชิก vs งานที่มอบหมายให้เรา)
  const loadTasks = useCallback(async () => {
    if (isProjectScope) {
      return loadProjectTasks();
    }

    const tasks = await taskApi.getMyTasks();
    return { tasks, ownedProjects: new Set<number>() };
  }, [isProjectScope]);

  const { status, data, retry, userId } = useProtectedLoad(loadTasks, {
    revalidateOnFocus: true,
    verifyBeforeLoad: false,
    hideDataWhileRefreshing: true,
  });

  const tasksList = useMemo(() => data?.tasks ?? [], [data]);

  // รายชื่อโปรเจกต์ที่มีในรายการงานสำหรับ Dropdown กรองโปรเจกต์
  const projectOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const task of tasksList) {
      if (!map.has(task.projectId)) {
        map.set(task.projectId, task.projectName);
      }
    }
    return Array.from(map.entries())
      .map(([projectId, projectName]) => ({ projectId, projectName }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [tasksList]);

  const canEditTask = (task: Task) =>
    userId !== null &&
    (data?.ownedProjects.has(task.projectId) === true ||
      task.assignees.some((assignee) => assignee.userId === userId));

  // กรองและจัดเรียงรายการงานฝั่ง Client
  const filteredTasks = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const filtered = tasksList.filter((task) => {
      const matchesSearch =
        !keyword ||
        task.taskTitle.toLowerCase().includes(keyword) ||
        (task.taskDescription ?? '').toLowerCase().includes(keyword);

      const matchesProject =
        projectFilter === 'ALL' || task.projectId === projectFilter;

      const matchesStatus =
        statusFilter === '' || task.status === statusFilter;

      const matchesPriority =
        priorityFilter === '' || task.priority === priorityFilter;

      const matchesOverdue = !overdueOnly || Boolean(task.isOverdue);

      const matchesExcludeDone = !excludeDone || task.status !== 'Done';

      return (
        matchesSearch &&
        matchesProject &&
        matchesStatus &&
        matchesPriority &&
        matchesOverdue &&
        matchesExcludeDone
      );
    });

    if (sortBy === 'DUE_DATE') {
      return [...filtered].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }

    if (sortBy === 'PRIORITY') {
      return [...filtered].sort((a, b) => a.priority - b.priority);
    }

    if (sortBy === 'NAME') {
      return [...filtered].sort((a, b) =>
        a.taskTitle.localeCompare(b.taskTitle),
      );
    }

    if (sortBy === 'PROJECT') {
      return [...filtered].sort((a, b) =>
        a.projectName.localeCompare(b.projectName),
      );
    }

    return filtered;
  }, [
    tasksList,
    search,
    projectFilter,
    statusFilter,
    priorityFilter,
    overdueOnly,
    excludeDone,
    sortBy,
  ]);

  const handleStatusChange = async (
    task: Task,
    newStatus: TaskStatus,
  ) => {
    if (
      !canEditTask(task) ||
      task.status === newStatus ||
      updatingTaskId !== null
    ) {
      return;
    }

    setUpdatingTaskId(task.taskId);
    setActionError('');

    try {
      await taskApi.updateTask(
        task.projectId,
        task.taskId,
        { status: newStatus },
      );

      retry();
    } catch (error) {
      console.error('Failed to update task status:', error);

      setActionError(
        error instanceof Error
          ? error.message
          : 'Unable to update task status. Please try again.',
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };

  const clearFilters = () => {
    setSearch('');
    setProjectFilter('ALL');
    setSortBy('DEFAULT');
    setOpenDropdown(null);
    setOpenStatusRowKey(null);

    const targetUrl = isProjectScope ? '/mytasks?scope=projects' : '/mytasks';
    if (`${window.location.pathname}${window.location.search}` !== targetUrl) {
      router.replace(targetUrl, { scroll: false });
    }
  };

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  const hasActiveFilters =
    search !== '' ||
    projectFilter !== 'ALL' ||
    sortBy !== 'DEFAULT' ||
    statusFilter !== '' ||
    priorityFilter !== '' ||
    overdueOnly ||
    excludeDone;

  const hasNoTasksInScope =
    tasksList.length === 0 && !hasActiveFilters;

  const currentProjectLabel =
    projectFilter === 'ALL'
      ? 'All projects'
      : projectOptions.find((p) => p.projectId === projectFilter)?.projectName ??
        'All projects';

  const currentStatusLabel =
    STATUS_FILTER_OPTIONS.find((opt) => opt.value === statusFilter)?.label ??
    'All statuses';

  const currentPriorityLabel =
    PRIORITY_FILTER_OPTIONS.find((opt) => opt.value === priorityFilter)
      ?.label ?? 'All priorities';

  const currentSortLabel =
    SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label ?? 'Sort by';

  return (
    <div className="relative min-w-0 pb-10 [overflow-wrap:anywhere]">
      {/* FULL-SCREEN WORKSPACE PATTERN BACKGROUND */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: WORKSPACE_PATTERN_BG,
          backgroundRepeat: 'repeat',
          backgroundSize: '140px 140px',
        }}
      />

      <div className="relative z-[1] mx-auto w-full max-w-6xl">
        {/* TOP BANNER + MALE CHARACTER REACHING DOWN TO GRIP LOWER FILTER BAR */}
        <div className="relative mb-4">
          <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 py-7 sm:px-9 sm:py-9 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
            {/* Soft decorative circles inside banner */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-12 -bottom-16 h-48 w-48 rounded-full bg-white/[0.07]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-8 -top-10 h-56 w-56 rounded-full bg-white/[0.08]"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute right-32 top-3 h-40 w-40 rounded-full bg-white/[0.07]"
            />

            {/* Decorative workspace doodles & subtle lines inside purple banner */}
            <svg
              aria-hidden="true"
              viewBox="0 0 1152 148"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {/* Soft decorative waves */}
              <path
                d="M270 156 C355 96, 460 112, 545 64 C630 16, 725 46, 815 -10"
                stroke="#FFFFFF"
                strokeOpacity="0.09"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M340 160 C430 108, 520 128, 610 82 C695 38, 770 64, 865 14"
                stroke="#FFFFFF"
                strokeOpacity="0.06"
                strokeWidth="1.6"
                strokeDasharray="5 7"
                strokeLinecap="round"
              />

              {/* Geometric workspace icons matching the page pattern */}
              <g
                stroke="#FFFFFF"
                strokeOpacity="0.22"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {/* Plus signs */}
                <path d="M276 22V34M270 28H282" strokeWidth="2" />
                <path d="M466 102V114M460 108H472" strokeWidth="2" />
                <path d="M624 26V36M619 31H629" strokeWidth="1.8" />
                <path d="M768 106V116M763 111H773" strokeWidth="1.8" />

                {/* Rotated rounded diamonds */}
                <rect
                  x="358"
                  y="88"
                  width="13"
                  height="13"
                  rx="3.5"
                  transform="rotate(45 364.5 94.5)"
                  strokeWidth="1.9"
                />
                <rect
                  x="546"
                  y="34"
                  width="11"
                  height="11"
                  rx="3"
                  transform="rotate(45 551.5 39.5)"
                  strokeWidth="1.8"
                />
                <rect
                  x="702"
                  y="74"
                  width="14"
                  height="14"
                  rx="3.8"
                  transform="rotate(45 709 81)"
                  strokeWidth="1.9"
                />

                {/* Mini task check-squares */}
                <g transform="translate(426 24)">
                  <rect x="0" y="0" width="17" height="17" rx="4.5" strokeWidth="1.8" />
                  <path d="M5 8.5L7.6 11.1L12.2 6.2" strokeWidth="1.8" />
                </g>
                <g transform="translate(652 94)">
                  <rect x="0" y="0" width="16" height="16" rx="4.2" strokeWidth="1.8" />
                  <path d="M4.6 8L7 10.4L11.4 5.8" strokeWidth="1.8" />
                </g>

                {/* 4-point sparkles */}
                <path
                  d="M322 36L324.4 43.6L332 46L324.4 48.4L322 56L319.6 48.4L312 46L319.6 43.6L322 36Z"
                  strokeWidth="1.7"
                />
                <path
                  d="M582 82L584.2 88.8L591 91L584.2 93.2L582 100L579.8 93.2L573 91L579.8 88.8L582 82Z"
                  strokeWidth="1.7"
                />
                <path
                  d="M754 24L756.4 31.6L764 34L756.4 36.4L754 44L751.6 36.4L744 34L751.6 31.6L754 24Z"
                  strokeWidth="1.7"
                />

                {/* Tilted pill capsules & circles */}
                <rect
                  x="492"
                  y="62"
                  width="18"
                  height="8"
                  rx="4"
                  transform="rotate(-24 501 66)"
                  strokeWidth="1.8"
                />
                <circle cx="394" cy="58" r="5.5" strokeWidth="1.8" />
                <circle cx="688" cy="36" r="5" strokeWidth="1.8" />
              </g>

              {/* Soft cluster dots */}
              <g fill="#FFFFFF" fillOpacity="0.22">
                <circle cx="298" cy="112" r="2.4" />
                <circle cx="307" cy="107" r="2.4" />
                <circle cx="306" cy="117" r="2.4" />

                <circle cx="518" cy="114" r="2.4" />
                <circle cx="527" cy="109" r="2.4" />
                <circle cx="526" cy="119" r="2.4" />

                <circle cx="634" cy="64" r="2.4" />
                <circle cx="806" cy="96" r="2.6" />
              </g>
            </svg>

            {/* HEADER TITLE & SUBTITLE */}
            <div className="relative z-[1] pr-32 sm:pr-56 md:pr-72">
              <h1 className="text-[30px] sm:text-[36px] leading-tight font-extrabold tracking-tight text-white">
                {isProjectScope ? 'Project Tasks' : 'My Tasks'}
              </h1>

              <p className="mt-1.5 text-[13.5px] sm:text-[14.5px] text-white/85">
                {isProjectScope
                  ? 'All tasks across projects you are a member of'
                  : 'All your assigned tasks across projects'}
              </p>
            </div>
          </div>

          {/* MALE CHARACTER ILLUSTRATION ALIGNED IDENTICALLY TO PROJECTS PAGE */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-2 sm:right-7 md:right-10 -bottom-[17px] sm:-bottom-[21px] md:-bottom-[24px] z-20 select-none"
          >
            <svg
              width="258"
              height="192"
              viewBox="0 0 210 156"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-[168px] sm:w-[224px] md:w-[258px] h-auto drop-shadow-[0_8px_18px_rgba(45,31,107,0.22)]"
            >
              {/* Floating mini task badge */}
              <g>
                <rect
                  x="6"
                  y="14"
                  width="54"
                  height="34"
                  rx="9"
                  fill="#FFFFFF"
                />
                <circle cx="15" cy="22" r="2.2" fill="#FF6B6B" />
                <circle cx="21.5" cy="22" r="2.2" fill="#FFD166" />
                <circle cx="28" cy="22" r="2.2" fill="#06D6A0" />
                <circle cx="15.5" cy="31" r="2.3" fill="#6C55D4" />
                <rect
                  x="21"
                  y="29.3"
                  width="31"
                  height="3.4"
                  rx="1.7"
                  fill="#D9D2F7"
                />
                <path
                  d="M13.5 39.5L15.3 41.3L18.5 38"
                  stroke="#22C55E"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="21"
                  y="38"
                  width="26"
                  height="3.4"
                  rx="1.7"
                  fill="#C4F1D7"
                />
              </g>

              {/* Sparkles & accent dots */}
              <path
                d="M193 40L194.7 45.3L200 47L194.7 48.7L193 54L191.3 48.7L186 47L191.3 45.3L193 40Z"
                fill="#FFFFFF"
              />
              <circle cx="71" cy="24" r="2.5" fill="#FDE047" />
              <circle cx="187" cy="92" r="2.2" fill="#FFFFFF" fillOpacity="0.7" />

              {/* White sticker outline silhouette */}
              <g
                stroke="#FFFFFF"
                strokeWidth="7"
                strokeLinejoin="round"
                strokeLinecap="round"
              >
                <path d="M101 61 C100 41, 112 31, 128 31 C143 31, 152 41, 151 61 C153 63, 155 66, 154 70 C153 73, 150 74, 148 74 C146 86, 137 94, 126 94 C115 94, 106 86, 104 74 C102 74, 99 73, 98 70 C97 66, 99 63, 101 61 Z" />
                <path d="M92 135 C92 112, 111 103, 126 103 C141 103, 160 112, 160 135 Z" />
                <path d="M95 122 C90 131, 91 140, 96 146 L109 144 C106 138, 106 131, 108 124 Z" />
                <path d="M157 122 C162 131, 161 140, 156 146 L143 144 C146 138, 146 131, 144 124 Z" />
                <rect x="93" y="142" width="20" height="11" rx="5.5" />
                <rect x="139" y="142" width="20" height="11" rx="5.5" />
              </g>

              {/* Neck & Royal Purple Sweater */}
              <rect
                x="120"
                y="90"
                width="12"
                height="15"
                rx="5"
                fill="#E7B08A"
              />
              <path
                d="M92 135 C92 112, 111 103, 126 103 C141 103, 160 112, 160 135 Z"
                fill="#4630AB"
              />
              <path
                d="M115 104 Q126 113 137 104"
                stroke="#FFFFFF"
                strokeWidth="2.4"
                strokeLinecap="round"
              />

              {/* Headphones Resting Around Neck */}
              <rect
                x="108"
                y="104"
                width="7.5"
                height="11.5"
                rx="3.75"
                fill="#F4F1FF"
                stroke="#CFC9E8"
                strokeWidth="1.2"
              />
              <rect
                x="136.5"
                y="104"
                width="7.5"
                height="11.5"
                rx="3.75"
                fill="#F4F1FF"
                stroke="#CFC9E8"
                strokeWidth="1.2"
              />

              {/* Ears */}
              <circle cx="102" cy="68" r="4.8" fill="#E7B08A" />
              <circle cx="150" cy="68" r="4.8" fill="#E7B08A" />

              {/* Face */}
              <path
                d="M103 58 C103 44, 149 44, 149 58 L149 71 C149 85, 139 94, 126 94 C113 94, 103 85, 103 71 Z"
                fill="#F4C3A0"
              />

              {/* Male Stylish Short Swept Hair */}
              <path
                d="M101 61 C100 41, 112 31, 128 31 C143 31, 152 41, 151 61 C149 53, 145 48, 139 46 C133 50, 124 52, 115 50 C109 49, 104 53, 101 61 Z"
                fill="#1E1B3A"
              />
              <path
                d="M114 35 C121 30, 133 30, 141 35 C135 36, 127 38, 120 40 C116 41, 114 38, 114 35 Z"
                fill="#2D2757"
              />

              {/* Eyebrows */}
              <path
                d="M110 58 Q115 56.5 120 58"
                stroke="#1E1B3A"
                strokeWidth="1.9"
                strokeLinecap="round"
              />
              <path
                d="M132 58 Q137 56.5 142 58"
                stroke="#1E1B3A"
                strokeWidth="1.9"
                strokeLinecap="round"
              />

              {/* Glasses */}
              <rect
                x="107"
                y="61"
                width="16"
                height="13"
                rx="4.5"
                fill="#FFFFFF"
                fillOpacity="0.2"
                stroke="#2B234D"
                strokeWidth="2.6"
              />
              <rect
                x="129"
                y="61"
                width="16"
                height="13"
                rx="4.5"
                fill="#FFFFFF"
                fillOpacity="0.2"
                stroke="#2B234D"
                strokeWidth="2.6"
              />
              <line
                x1="123"
                y1="67"
                x2="129"
                y2="67"
                stroke="#2B234D"
                strokeWidth="2.6"
                strokeLinecap="round"
              />

              {/* Eyes, Cheeks & Friendly Smile */}
              <circle cx="115" cy="67.5" r="2.2" fill="#1E1B3A" />
              <circle cx="115.8" cy="66.7" r="0.8" fill="#FFFFFF" />
              <circle cx="137" cy="67.5" r="2.2" fill="#1E1B3A" />
              <circle cx="137.8" cy="66.7" r="0.8" fill="#FFFFFF" />
              <ellipse
                cx="111"
                cy="75"
                rx="3.2"
                ry="1.8"
                fill="#E89984"
                fillOpacity="0.55"
              />
              <ellipse
                cx="141"
                cy="75"
                rx="3.2"
                ry="1.8"
                fill="#E89984"
                fillOpacity="0.55"
              />
              <path
                d="M121.5 79.5 Q126 84 130.5 79.5"
                stroke="#8C4A32"
                strokeWidth="2.1"
                strokeLinecap="round"
              />

              {/* Arms reaching down */}
              <path
                d="M95 122 C90 131, 91 140, 96 146 L109 144 C106 138, 106 131, 108 124 Z"
                fill="#4630AB"
              />
              <path
                d="M157 122 C162 131, 161 140, 156 146 L143 144 C146 138, 146 131, 144 124 Z"
                fill="#4630AB"
              />

              {/* Hands gripping the top border of lower filter container */}
              <rect
                x="93"
                y="142"
                width="20"
                height="11"
                rx="5.5"
                fill="#F4C3A0"
                stroke="#FFFFFF"
                strokeWidth="2.2"
              />
              <line
                x1="99.5"
                y1="145"
                x2="99.5"
                y2="150"
                stroke="#D4956A"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <line
                x1="104"
                y1="145"
                x2="104"
                y2="150"
                stroke="#D4956A"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <line
                x1="108.5"
                y1="145"
                x2="108.5"
                y2="150"
                stroke="#D4956A"
                strokeWidth="1.2"
                strokeLinecap="round"
              />

              <rect
                x="139"
                y="142"
                width="20"
                height="11"
                rx="5.5"
                fill="#F4C3A0"
                stroke="#FFFFFF"
                strokeWidth="2.2"
              />
              <line
                x1="143.5"
                y1="145"
                x2="143.5"
                y2="150"
                stroke="#D4956A"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <line
                x1="148"
                y1="145"
                x2="148"
                y2="150"
                stroke="#D4956A"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
              <line
                x1="152.5"
                y1="145"
                x2="152.5"
                y2="150"
                stroke="#D4956A"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* MAIN WHITE FILTER BAR (PROJECTS STYLE + CLEAR FILTERS) */}
        <div
          ref={filterBarRef}
          className="relative z-10 mb-6 rounded-2xl border border-[#cfc9e8] bg-white/95 p-3.5 shadow-[0_6px_22px_rgba(91,68,186,0.06)]"
        >
          <div className="flex flex-wrap items-center gap-2.5">
            {/* SEARCH INPUT */}
            <div className="flex min-h-11 w-full sm:min-w-[210px] sm:flex-1 items-center gap-2.5 rounded-xl border border-[#cfc9e8] focus-within:border-[#5B44BA] bg-[#f8f6fe] focus-within:bg-white px-3.5 py-2 transition-colors">
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
                className="shrink-0 text-[#7d7696]"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search task name..."
                aria-label="Search tasks"
                className="w-full min-w-0 border-none bg-transparent text-[13px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6] [&::-webkit-search-cancel-button]:appearance-none"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear task search"
                  className="shrink-0 h-6 w-6 rounded-full hover:bg-[#ece8fa] inline-flex items-center justify-center text-[#777777] hover:text-[#5B44BA] cursor-pointer transition-colors"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* PROJECT DROPDOWN */}
            {projectOptions.length > 0 && (
              <KeyboardPopup
                open={openDropdown === 'project'}
                onClose={() => closeDropdownAndRestoreFocus('project')}
                className="relative w-full sm:w-auto sm:shrink-0"
              >
                <button
                  ref={projectTriggerRef}
                  type="button"
                  aria-label="Filter tasks by project"
                  aria-haspopup="listbox"
                  aria-expanded={openDropdown === 'project'}
                  onClick={() =>
                    setOpenDropdown((prev) =>
                      prev === 'project' ? null : 'project',
                    )
                  }
                  onKeyDown={(e) => {
                    if (
                      (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
                      openDropdown !== 'project'
                    ) {
                      e.preventDefault();
                      setOpenDropdown('project');
                    }
                  }}
                  className={`min-h-11 w-full sm:w-auto sm:min-w-[140px] sm:max-w-[230px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all focus-visible:border-[#5B44BA] focus-visible:ring-2 focus-visible:ring-[#5B44BA]/25 ${
                    openDropdown === 'project'
                      ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                      : projectFilter !== 'ALL'
                        ? 'border-[#b3a4eb] bg-[#f4f0ff] text-[#4c35ab]'
                        : 'border-[#cfc9e8] bg-[#f8f6fe] hover:bg-white hover:border-[#9e8ce6] text-[#3d3a4b]'
                  }`}
                >
                  <span className="min-w-0 flex-1 text-left whitespace-normal break-words [overflow-wrap:anywhere] leading-snug">
                    {currentProjectLabel}
                  </span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className={`shrink-0 transition-transform duration-150 ${
                      openDropdown === 'project'
                        ? 'rotate-180 text-[#5B44BA]'
                        : 'text-[#6e6b7b]'
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openDropdown === 'project' && (
                  <div
                    role="listbox"
                    aria-label="Project options"
                    className="absolute left-0 right-0 sm:right-auto sm:left-0 top-full mt-1.5 z-30 max-h-64 w-full sm:w-auto sm:min-w-[210px] sm:max-w-[280px] overflow-y-auto rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                  >
                    <button
                      type="button"
                      role="option"
                      tabIndex={-1}
                      aria-selected={projectFilter === 'ALL'}
                      onClick={(e) => {
                        setProjectFilter('ALL');
                        if (e.detail === 0) {
                          closeDropdownAndRestoreFocus('project');
                        } else {
                          setOpenDropdown(null);
                        }
                      }}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer focus:bg-[#f1edff] focus:text-[#5B44BA] focus:outline-none ${
                        projectFilter === 'ALL'
                          ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                          : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                      }`}
                    >
                      <span>All projects</span>
                      {projectFilter === 'ALL' && (
                        <svg
                          width="14"
                          height="14"
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

                    {projectOptions.map((proj) => {
                      const isSelected = projectFilter === proj.projectId;
                      return (
                        <button
                          key={proj.projectId}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          onClick={(e) => {
                            setProjectFilter(proj.projectId);
                            if (e.detail === 0) {
                              closeDropdownAndRestoreFocus('project');
                            } else {
                              setOpenDropdown(null);
                            }
                          }}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer focus:bg-[#f1edff] focus:text-[#5B44BA] focus:outline-none ${
                            isSelected
                              ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                              : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                          }`}
                        >
                          <span className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere] leading-snug">
                            {proj.projectName}
                          </span>
                          {isSelected && (
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className="shrink-0"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </KeyboardPopup>
            )}

            {/* STATUS DROPDOWN */}
            <KeyboardPopup
              open={openDropdown === 'status'}
              onClose={() => closeDropdownAndRestoreFocus('status')}
              className="relative w-full sm:w-auto sm:shrink-0"
            >
              <button
                ref={statusTriggerRef}
                type="button"
                aria-label="Filter tasks by status"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === 'status'}
                onClick={() =>
                  setOpenDropdown((prev) =>
                    prev === 'status' ? null : 'status',
                  )
                }
                onKeyDown={(e) => {
                  if (
                    (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
                    openDropdown !== 'status'
                  ) {
                    e.preventDefault();
                    setOpenDropdown('status');
                  }
                }}
                className={`min-h-11 w-full sm:w-auto sm:min-w-[138px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all focus-visible:border-[#5B44BA] focus-visible:ring-2 focus-visible:ring-[#5B44BA]/25 ${
                  openDropdown === 'status'
                    ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                    : statusFilter !== ''
                      ? 'border-[#b3a4eb] bg-[#f4f0ff] text-[#4c35ab]'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] hover:bg-white hover:border-[#9e8ce6] text-[#3d3a4b]'
                }`}
              >
                <span>{currentStatusLabel}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`shrink-0 transition-transform duration-150 ${
                    openDropdown === 'status'
                      ? 'rotate-180 text-[#5B44BA]'
                      : 'text-[#6e6b7b]'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openDropdown === 'status' && (
                <div
                  role="listbox"
                  aria-label="Task status options"
                  className="absolute left-0 right-0 sm:right-auto sm:left-0 top-full mt-1.5 z-30 w-full sm:w-auto sm:min-w-[168px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                >
                  {STATUS_FILTER_OPTIONS.map((option) => {
                    const isSelected = statusFilter === option.value;
                    return (
                      <button
                        key={option.value || 'ALL'}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        onClick={(e) => {
                          updateQueryParams({
                            status: option.value,
                            ...(option.value === 'Done'
                              ? { excludeDone: false }
                              : {}),
                          });
                          if (e.detail === 0) {
                            closeDropdownAndRestoreFocus('status');
                          } else {
                            setOpenDropdown(null);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer focus:bg-[#f1edff] focus:text-[#5B44BA] focus:outline-none ${
                          isSelected
                            ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                            : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isSelected && (
                          <svg
                            width="14"
                            height="14"
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
            </KeyboardPopup>

            {/* PRIORITY DROPDOWN */}
            <KeyboardPopup
              open={openDropdown === 'priority'}
              onClose={() => closeDropdownAndRestoreFocus('priority')}
              className="relative w-full sm:w-auto sm:shrink-0"
            >
              <button
                ref={priorityTriggerRef}
                type="button"
                aria-label="Filter tasks by priority"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === 'priority'}
                onClick={() =>
                  setOpenDropdown((prev) =>
                    prev === 'priority' ? null : 'priority',
                  )
                }
                onKeyDown={(e) => {
                  if (
                    (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
                    openDropdown !== 'priority'
                  ) {
                    e.preventDefault();
                    setOpenDropdown('priority');
                  }
                }}
                className={`min-h-11 w-full sm:w-auto sm:min-w-[138px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all focus-visible:border-[#5B44BA] focus-visible:ring-2 focus-visible:ring-[#5B44BA]/25 ${
                  openDropdown === 'priority'
                    ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                    : priorityFilter !== ''
                      ? 'border-[#b3a4eb] bg-[#f4f0ff] text-[#4c35ab]'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] hover:bg-white hover:border-[#9e8ce6] text-[#3d3a4b]'
                }`}
              >
                <span>{currentPriorityLabel}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`shrink-0 transition-transform duration-150 ${
                    openDropdown === 'priority'
                      ? 'rotate-180 text-[#5B44BA]'
                      : 'text-[#6e6b7b]'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openDropdown === 'priority' && (
                <div
                  role="listbox"
                  aria-label="Task priority options"
                  className="absolute left-0 right-0 sm:right-auto sm:left-0 top-full mt-1.5 z-30 w-full sm:w-auto sm:min-w-[168px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                >
                  {PRIORITY_FILTER_OPTIONS.map((option) => {
                    const isSelected = priorityFilter === option.value;
                    return (
                      <button
                        key={String(option.value || 'ALL')}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        onClick={(e) => {
                          updateQueryParams({
                            priority: option.value,
                            excludeDone: false,
                          });
                          if (e.detail === 0) {
                            closeDropdownAndRestoreFocus('priority');
                          } else {
                            setOpenDropdown(null);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer focus:bg-[#f1edff] focus:text-[#5B44BA] focus:outline-none ${
                          isSelected
                            ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                            : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isSelected && (
                          <svg
                            width="14"
                            height="14"
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
            </KeyboardPopup>

            {/* SORT DROPDOWN */}
            <KeyboardPopup
              open={openDropdown === 'sort'}
              onClose={() => closeDropdownAndRestoreFocus('sort')}
              className="relative w-full sm:w-auto sm:shrink-0"
            >
              <button
                ref={sortTriggerRef}
                type="button"
                aria-label="Sort tasks"
                aria-haspopup="listbox"
                aria-expanded={openDropdown === 'sort'}
                onClick={() =>
                  setOpenDropdown((prev) =>
                    prev === 'sort' ? null : 'sort',
                  )
                }
                onKeyDown={(e) => {
                  if (
                    (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
                    openDropdown !== 'sort'
                  ) {
                    e.preventDefault();
                    setOpenDropdown('sort');
                  }
                }}
                className={`min-h-11 w-full sm:w-auto sm:min-w-[125px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all focus-visible:border-[#5B44BA] focus-visible:ring-2 focus-visible:ring-[#5B44BA]/25 ${
                  openDropdown === 'sort'
                    ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                    : sortBy !== 'DEFAULT'
                      ? 'border-[#b3a4eb] bg-[#f4f0ff] text-[#4c35ab]'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] hover:bg-white hover:border-[#9e8ce6] text-[#3d3a4b]'
                }`}
              >
                <span>{currentSortLabel}</span>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className={`shrink-0 transition-transform duration-150 ${
                    openDropdown === 'sort'
                      ? 'rotate-180 text-[#5B44BA]'
                      : 'text-[#6e6b7b]'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openDropdown === 'sort' && (
                <div
                  role="listbox"
                  aria-label="Sort task options"
                  className="absolute left-0 right-0 sm:left-auto sm:right-0 top-full mt-1.5 z-30 w-full sm:w-auto sm:min-w-[165px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                >
                  {SORT_OPTIONS.map((option) => {
                    const isSelected = sortBy === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        tabIndex={-1}
                        aria-selected={isSelected}
                        onClick={(e) => {
                          setSortBy(option.value);
                          if (e.detail === 0) {
                            closeDropdownAndRestoreFocus('sort');
                          } else {
                            setOpenDropdown(null);
                          }
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer focus:bg-[#f1edff] focus:text-[#5B44BA] focus:outline-none ${
                          isSelected
                            ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                            : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isSelected && (
                          <svg
                            width="14"
                            height="14"
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
            </KeyboardPopup>

            {/* CLEAR FILTERS BUTTON */}
            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasActiveFilters}
              className="min-h-11 w-full sm:w-auto shrink-0 rounded-xl border border-[#cfc9e8] bg-white px-4 py-2 text-[13px] font-medium text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] focus-visible:border-[#5B44BA] focus-visible:ring-2 focus-visible:ring-[#5B44BA]/25 focus-visible:outline-none cursor-pointer disabled:cursor-not-allowed disabled:border-[#e4e0f2] disabled:bg-[#fafafa] disabled:text-[#b5b2c2]"
            >
              Clear filters
            </button>
          </div>
        </div>

        {/* ACTIVE SCOPE / FILTER BANNERS */}
        {isProjectScope && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#cfc9e8] bg-[#f4f1ff] px-4 py-2.5 text-[12.5px] text-[#4a33a8]">
            <span className="font-medium">
              Showing all tasks across projects you are a member of
            </span>
            <button
              type="button"
              onClick={() => {
                setProjectFilter('ALL');
                setOpenDropdown(null);
                updateQueryParams({ scope: 'mine' });
              }}
              className="min-h-11 inline-flex items-center font-bold underline hover:text-[#231942] cursor-pointer"
            >
              Show my assigned tasks only
            </button>
          </div>
        )}

        {excludeDone && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-800">
            <span className="font-medium">
              Showing unfinished tasks only (Done tasks hidden)
            </span>
            <button
              type="button"
              onClick={() => updateQueryParams({ excludeDone: false })}
              className="font-bold underline hover:text-amber-950 cursor-pointer"
            >
              Include Done tasks
            </button>
          </div>
        )}

        {overdueOnly && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-[12.5px] text-red-700">
            <span className="font-medium">Showing overdue tasks only</span>
            <button
              type="button"
              onClick={() => updateQueryParams({ overdue: false })}
              className="font-bold underline hover:text-red-900 cursor-pointer"
            >
              Show all due dates
            </button>
          </div>
        )}

        {actionError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[13px] font-medium text-red-700"
          >
            {actionError}
          </div>
        )}

        {/* MAIN TASKS TABLE CARD WITH DASHBOARD-STYLE PURPLE TOP HEADER */}
        <section className="min-w-0 rounded-[24px] border border-[#e2daff] bg-white shadow-[0_8px_26px_rgba(91,68,186,0.06)]">
          {/* PURPLE GRADIENT TOP HEADER BAR */}
          <div className="relative overflow-hidden rounded-t-[23px] flex flex-wrap gap-2 items-center justify-between bg-gradient-to-r from-[#5B44BA] via-[#7A61D4] to-[#9B86EE] px-4 py-4 sm:px-6 sm:py-4.5 text-white">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10"
            />
            <div className="relative z-[1] flex items-center gap-3">
              <span className="w-9 h-9 shrink-0 rounded-2xl bg-white text-[#5B44BA] shadow-sm flex items-center justify-center">
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="8" y="2" width="8" height="4" rx="1" />
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                  <path d="M9 12h6" />
                  <path d="M9 16h6" />
                </svg>
              </span>

              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-[18px] font-extrabold text-white">
                    {isProjectScope ? 'All Project Tasks' : 'Assigned Tasks'}
                  </h2>
                  <span className="inline-flex items-center rounded-full bg-white/20 border border-white/30 px-2.5 py-0.5 text-[11.5px] font-bold text-white tabular-nums">
                    {filteredTasks.length}
                  </span>
                </div>
                <p className="text-[11px] text-white/80">
                  {isProjectScope
                    ? 'Track & update tasks across your projects'
                    : 'Track progress, priority & due dates'}
                </p>
              </div>
            </div>
          </div>

          {/* CARD BODY */}
          <div className="p-4 sm:p-6 pt-4 sm:pt-5">
            {/* DESKTOP TABLE HEADER */}
            <div
              aria-hidden="true"
              className="hidden xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1.15fr)_96px_142px_148px_40px] items-center gap-3 rounded-xl border border-[#e5e0f5] bg-[#f7f5fd] px-4 py-2.5 text-[12px] font-semibold text-[#6e6b7b]"
            >
              <div>Task name</div>
              <div>Project</div>
              <div>Assignee</div>
              <div className="text-center">Priority</div>
              <div className="text-center">Status</div>
              <div>Due Date</div>
              <div />
            </div>

            {/* ROWS */}
            <div className="mt-1 divide-y divide-[#ece8f8]">
              {filteredTasks.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1edff] text-[#5B44BA]">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="4" y="3" width="16" height="18" rx="2" />
                      <line x1="4" y1="8" x2="20" y2="8" />
                    </svg>
                  </div>

                  <p className="text-[14.5px] font-bold text-[#1f1f1f]">
                    {hasNoTasksInScope
                      ? isProjectScope
                        ? 'No tasks in your projects.'
                        : 'You have no assigned tasks.'
                      : 'No tasks found.'}
                  </p>

                  <p className="mt-1 text-[12.5px] text-[#777777]">
                    {hasNoTasksInScope
                      ? isProjectScope
                        ? 'Tasks created in your projects will appear here.'
                        : 'Tasks assigned to you will appear here.'
                      : 'Try changing your search or filters.'}
                  </p>

                  {!hasNoTasksInScope && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-[#c7bbf5] bg-[#f1edff] hover:bg-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#5B44BA] hover:text-white transition-colors cursor-pointer"
                    >
                      Clear filters
                    </button>
                  )}
                </div>
              ) : (
                filteredTasks.map((row) => {
                  const rowKey = `${row.projectId}-${row.taskId}`;
                  const isStatusOpen = openStatusRowKey === rowKey;
                  const assigneeNames =
                    row.assignees?.map((assignee) => assignee.userName) ?? [];

                  const isUpdating = updatingTaskId === row.taskId;

                  return (
                    <div
                      key={rowKey}
                      className="group relative grid min-w-0 grid-cols-1 items-start gap-3 rounded-xl px-3.5 py-3.5 hover:bg-[#f7f5ff] transition-colors sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(0,1.25fr)_minmax(0,1.15fr)_96px_142px_148px_40px] xl:items-center [&>div]:min-w-0 [overflow-wrap:anywhere]"
                    >
                      {/* TASK NAME & DESCRIPTION */}
                      <div className="flex min-w-0 flex-col sm:col-span-2 xl:col-span-1">
                        <Link
                          href={`/projects/${row.projectId}/tasks/${row.taskId}`}
                          className="text-[13.5px] font-bold text-[#1f1f1f] hover:text-[#5B44BA] hover:underline transition-colors [overflow-wrap:anywhere]"
                        >
                          {row.taskTitle}
                        </Link>

                        <span className="mt-0.5 truncate text-[11.5px] text-[#7c788c]">
                          {row.taskDescription || 'No description'}
                        </span>
                      </div>

                      {/* PROJECT */}
                      <div className="flex items-start gap-2 text-[12.5px] text-[#3d3a4b]">
                        <span className="shrink-0 font-semibold text-[#888888] xl:sr-only">
                          Project:
                        </span>

                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f4f1ff] text-[#5B44BA]">
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                        </span>

                        <Link
                          href={`/projects/${row.projectId}`}
                          className="min-w-0 flex-1 whitespace-normal break-words [overflow-wrap:anywhere] leading-snug font-medium hover:text-[#5B44BA] hover:underline transition-colors"
                        >
                          {row.projectName}
                        </Link>
                      </div>

                      {/* ASSIGNEE (ONE NAME PER LINE WHEN EXPANDED) */}
                      <div className="flex items-start gap-2 text-[12.5px] text-[#3d3a4b]">
                        <span className="shrink-0 font-semibold text-[#888888] xl:sr-only">
                          Assignee:
                        </span>

                        <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </div>

                        <div className="min-w-0 flex-1">
                          {assigneeNames.length > 0 ? (
                            <span className="block font-medium leading-snug">
                              {assigneeNames.slice(0, 2).join(', ')}
                              {assigneeNames.length > 2 &&
                                ` +${assigneeNames.length - 2}`}
                            </span>
                          ) : (
                            <span className="block leading-7 text-[#7c788c]">
                              Unassigned
                            </span>
                          )}

                          {assigneeNames.length > 2 && (
                            <details className="mt-0.5 text-[11px] text-[#5B44BA]">
                              <summary className="flex min-h-6 cursor-pointer items-center font-semibold hover:underline">
                                Show all assignees
                              </summary>
                              <div className="mt-1 flex flex-col gap-0.5 text-[11.5px] text-[#555266]">
                                {assigneeNames.map((name, idx) => (
                                  <span
                                    key={`${name}-${idx}`}
                                    className="block leading-snug"
                                  >
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      </div>

                      {/* PRIORITY */}
                      <div className="flex items-center xl:justify-center">
                        <span className="mr-2 text-[12px] font-semibold text-[#888888] xl:sr-only">
                          Priority:
                        </span>

                        <span
                          className={`inline-flex items-center justify-center rounded-full border px-3 py-0.5 text-[11.5px] font-semibold ${getPriorityBadgeClass(
                            row.priority,
                          )}`}
                        >
                          {getPriorityLabel(row.priority)}
                        </span>
                      </div>

                      {/* STATUS (CUSTOM STYLED DROPDOWN) */}
                      <div
                        data-status-dropdown="true"
                        className="flex flex-wrap items-center gap-1.5 xl:justify-center"
                      >
                        <span className="text-[12px] font-semibold text-[#888888] xl:sr-only">
                          Status:
                        </span>

                        {canEditTask(row) ? (
                          <KeyboardPopup
                            open={isStatusOpen}
                            onClose={() => {
                              setOpenStatusRowKey(null);
                              requestAnimationFrame(() =>
                                statusRowTriggerRefs.current[rowKey]?.focus(),
                              );
                            }}
                            className="relative inline-block"
                          >
                            <button
                              ref={(el) => {
                                statusRowTriggerRefs.current[rowKey] = el;
                              }}
                              type="button"
                              aria-label={`Change status for ${row.taskTitle}`}
                              aria-haspopup="listbox"
                              aria-expanded={isStatusOpen}
                              disabled={updatingTaskId !== null}
                              onClick={() =>
                                setOpenStatusRowKey((prev) =>
                                  prev === rowKey ? null : rowKey,
                                )
                              }
                              onKeyDown={(e) => {
                                if (
                                  (e.key === 'ArrowDown' ||
                                    e.key === 'ArrowUp') &&
                                  !isStatusOpen
                                ) {
                                  e.preventDefault();
                                  setOpenStatusRowKey(rowKey);
                                }
                              }}
                              className={`inline-flex min-h-8 items-center justify-between gap-2 rounded-full border px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap outline-none transition-all cursor-pointer focus-visible:ring-2 focus-visible:ring-[#5B44BA]/35 disabled:cursor-not-allowed disabled:opacity-60 ${getStatusButtonClass(
                                row.status,
                                isStatusOpen,
                              )}`}
                            >
                              <span>{row.status}</span>
                              <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.4"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                                className={`shrink-0 transition-transform duration-150 ${
                                  isStatusOpen ? 'rotate-180' : 'opacity-80'
                                }`}
                              >
                                <polyline points="6 9 12 15 18 9" />
                              </svg>
                            </button>

                            {isStatusOpen && (
                              <div
                                role="listbox"
                                aria-label={`Status options for ${row.taskTitle}`}
                                className="absolute left-0 xl:left-1/2 xl:-translate-x-1/2 top-full mt-1.5 z-30 min-w-[156px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.16)]"
                              >
                                {STATUS_OPTIONS.map((option) => {
                                  const isSelected = row.status === option;
                                  return (
                                    <button
                                      key={option}
                                      type="button"
                                      role="option"
                                      tabIndex={-1}
                                      aria-selected={isSelected}
                                      onClick={(e) => {
                                        setOpenStatusRowKey(null);
                                        void handleStatusChange(row, option);
                                        if (e.detail === 0) {
                                          requestAnimationFrame(() =>
                                            statusRowTriggerRefs.current[
                                              rowKey
                                            ]?.focus(),
                                          );
                                        }
                                      }}
                                      className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[12.5px] transition-colors cursor-pointer focus:bg-[#f1edff] focus:text-[#5B44BA] focus:outline-none ${
                                        isSelected
                                          ? 'bg-[#f1edff] font-semibold text-[#5B44BA]'
                                          : 'font-medium text-[#333042] hover:bg-[#f7f5ff] hover:text-[#5B44BA]'
                                      }`}
                                    >
                                      <span className="flex items-center gap-2">
                                        <span
                                          className={`h-2 w-2 rounded-full ${
                                            option === 'Done'
                                              ? 'bg-emerald-500'
                                              : option === 'In progress'
                                                ? 'bg-blue-500'
                                                : 'bg-neutral-400'
                                          }`}
                                        />
                                        <span>{option}</span>
                                      </span>

                                      {isSelected && (
                                        <svg
                                          width="13"
                                          height="13"
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
                          </KeyboardPopup>
                        ) : (
                          <span
                            className={`inline-flex items-center justify-center rounded-full border px-3 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${getStatusBadgeClass(
                              row.status,
                            )}`}
                          >
                            {row.status}
                          </span>
                        )}

                        {isUpdating && (
                          <span className="text-[10.5px] font-medium text-[#7c788c]">
                            Saving...
                          </span>
                        )}
                      </div>

                      {/* DUE DATE */}
                      <div
                        title={row.dueDate}
                        className={`flex items-center gap-2 text-[12px] ${
                          row.isOverdue && row.status !== 'Done'
                            ? 'font-semibold text-rose-600'
                            : 'text-[#555266]'
                        }`}
                      >
                        <span className="font-semibold text-[#888888] xl:sr-only">
                          Due:
                        </span>

                        <span
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                            row.isOverdue && row.status !== 'Done'
                              ? 'border-rose-200 bg-rose-50 text-rose-500'
                              : 'border-[#dcd4fa] bg-[#f4f1ff] text-[#5B44BA]'
                          }`}
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                        </span>

                        <span className="truncate">
                          {formatShortDate(row.dueDate)}
                        </span>

                        {row.isOverdue && row.status !== 'Done' && (
                          <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-600">
                            Overdue
                          </span>
                        )}
                      </div>

                      {/* FAR-RIGHT COLORED ACTION BUTTON TO TASK DETAIL */}
                      <div className="flex items-center justify-end sm:col-span-2 xl:col-span-1">
                        <Link
                          href={`/projects/${row.projectId}/tasks/${row.taskId}`}
                          aria-label={`View task ${row.taskTitle}`}
                          title="View task details"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] text-[#452ea0] shadow-[0_2px_8px_rgba(91,68,186,0.14)] hover:bg-[#5B44BA] hover:border-[#5B44BA] hover:text-white hover:shadow-[0_4px_12px_rgba(91,68,186,0.28)] transition-all"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}