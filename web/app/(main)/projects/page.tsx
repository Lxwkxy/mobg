'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { projectApi } from '@/lib/projectApi';
import { taskApi } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

import type { ProjectItem } from '@/types';

type ProjectStatusFilter = ProjectItem['derivedStatus'] | 'ALL';

type ProjectCardItem = ProjectItem & {
  highPriorityTasks: number;
};

const ITEMS_PER_PAGE = 10;

const STATUS_OPTIONS: { value: ProjectStatusFilter; label: string }[] = [
  { value: 'ALL', label: 'All status' },
  { value: 'To do', label: 'To do' },
  { value: 'In progress', label: 'In progress' },
  { value: 'Done', label: 'Done' },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'DEFAULT', label: 'Sort by' },
  { value: 'NAME', label: 'Name' },
  { value: 'DUE_DATE', label: 'Due date' },
];

const MONTH_SHORT_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function getProjectStatusBadgeClass(status: ProjectItem['derivedStatus']) {
  if (status === 'Done') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (status === 'In progress') {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }
  return 'bg-neutral-200 text-neutral-700 border-neutral-300';
}

const formatDate = (date: string) => {
  const dateOnly = date.slice(0, 10);
  const [year, month, day] = dateOnly.split('-');
  const monthIndex = Number(month) - 1;
  const monthLabel = MONTH_SHORT_NAMES[monthIndex];

  if (!year || !day || !monthLabel) {
    return date;
  }

  return `${Number(day)} ${monthLabel} ${year}`;
};

// ดึงโปรเจกต์ทั้งหมดของผู้ใช้ พร้อมนับจำนวนงาน High priority (priority === 1) ในแต่ละโปรเจกต์
async function loadAllProjects(
  status: ProjectStatusFilter,
): Promise<ProjectCardItem[]> {
  const allProjects: ProjectItem[] = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const result = await projectApi.getProjects({
      page,
      pageSize,
      ...(status !== 'ALL' ? { status } : {}),
    });

    allProjects.push(...result.projects);

    if (result.projects.length < pageSize) {
      break;
    }

    page += 1;
  }

  if (allProjects.length === 0) {
    return [];
  }

  return Promise.all(
    allProjects.map(async (project) => {
      if (project.totalTasks === 0) {
        return {
          ...project,
          highPriorityTasks: 0,
        };
      }

      const tasks = await taskApi.getTasks(project.projectId);
      const highPriorityTasks = tasks.filter(
        (task) => task.priority === 1,
      ).length;

      return {
        ...project,
        highPriorityTasks,
      };
    }),
  );
}

// พื้นหลังลายแพตเทิร์นชุดเดียวกับหน้า Dashboard (GPU-cached Data URI)
const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

export default function ProjectsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('ALL');
  const [sortBy, setSortBy] = useState('DEFAULT');
  const [openFilterDropdown, setOpenFilterDropdown] = useState<
    'status' | 'sort' | null
  >(null);

  // State สำหรับเมนู ••• และหน้าต่างยืนยันการลบโปรเจกต์
  const [openMenuProjectId, setOpenMenuProjectId] = useState<number | null>(null);
  const [projectToDelete, setProjectToDelete] =
    useState<ProjectCardItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const statusDropdownRef = useRef<HTMLDivElement | null>(null);
  const sortDropdownRef = useRef<HTMLDivElement | null>(null);
  const router = useRouter();

  // ปิดเมนู Dropdown ของ Filter เมื่อคลิกด้านนอกหรือกด Escape
  useEffect(() => {
    if (openFilterDropdown === null) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        openFilterDropdown === 'status' &&
        statusDropdownRef.current &&
        !statusDropdownRef.current.contains(target)
      ) {
        setOpenFilterDropdown(null);
      }
      if (
        openFilterDropdown === 'sort' &&
        sortDropdownRef.current &&
        !sortDropdownRef.current.contains(target)
      ) {
        setOpenFilterDropdown(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenFilterDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openFilterDropdown]);

  // ปิดเมนู Dropdown ••• เมื่อคลิกด้านนอกหรือกด Escape
  useEffect(() => {
    if (openMenuProjectId === null) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenuProjectId(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenuProjectId(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuProjectId]);

  // ปิด Modal ยืนยันการลบเมื่อกด Escape (ถ้าไม่ได้กำลังลบอยู่)
  useEffect(() => {
    if (!projectToDelete || isDeleting) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProjectToDelete(null);
        setDeleteError('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectToDelete, isDeleting]);

  const load = useCallback(
    () => loadAllProjects(statusFilter),
    [statusFilter],
  );

  const {
    status,
    data,
    isRefreshing,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: false,
    revalidateOnRoute: '/projects',
  });

  const allProjects = useMemo(() => data ?? [], [data]);

  // Search และ Sort กรองข้อมูลฝั่ง Client ครบทุกโปรเจกต์เหมือนหน้า My Tasks
  const filteredProjects = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    const filtered = allProjects.filter((item) => {
      const matchesStatus =
        statusFilter === 'ALL' || item.derivedStatus === statusFilter;

      const matchesSearch =
        !keyword ||
        item.projectName.toLowerCase().includes(keyword) ||
        (item.projectDescription ?? '').toLowerCase().includes(keyword);

      return matchesStatus && matchesSearch;
    });

    if (sortBy === 'NAME') {
      return [...filtered].sort((a, b) =>
        a.projectName.localeCompare(b.projectName),
      );
    }

    if (sortBy === 'DUE_DATE') {
      return [...filtered].sort((a, b) => {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return (
          new Date(a.dueDate).getTime() -
          new Date(b.dueDate).getTime()
        );
      });
    }

    return filtered;
  }, [allProjects, search, statusFilter, sortBy]);

  const handleConfirmDelete = async () => {
    if (
      !projectToDelete ||
      projectToDelete.myRole !== 'Owner' ||
      isDeleting
    ) {
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      await projectApi.deleteProject(projectToDelete.projectId);
      setProjectToDelete(null);
      retry();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : 'Unable to delete project. Please try again.',
      );
    } finally {
      setIsDeleting(false);
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

  const totalPages = Math.max(
    1,
    Math.ceil(filteredProjects.length / ITEMS_PER_PAGE),
  );
  const currentPage = Math.min(page, totalPages);
  const paginatedProjects = filteredProjects.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const hasActiveFilter =
    search.trim() !== '' ||
    statusFilter !== 'ALL' ||
    sortBy !== 'DEFAULT';

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('ALL');
    setSortBy('DEFAULT');
    setOpenFilterDropdown(null);
    setPage(1);
  };

  const currentStatusLabel =
    STATUS_OPTIONS.find((opt) => opt.value === statusFilter)?.label ??
    'All status';
  const currentSortLabel =
    SORT_OPTIONS.find((opt) => opt.value === sortBy)?.label ?? 'Sort by';

  return (
    <div className="relative min-w-0 pb-8 [overflow-wrap:anywhere]">
      {/* FULL-SCREEN GPU-CACHED PATTERN BACKGROUND */}
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
        {/* TOP DASHBOARD-STYLE BANNER + CHARACTER REACHING DOWN TO GRIP LOWER FILTER BAR */}
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
                Projects
              </h1>

              <p className="mt-1.5 text-[13.5px] sm:text-[14.5px] text-white/85">
                Manage all your projects here
              </p>
            </div>
          </div>

          {/* LARGER CHARACTER ILLUSTRATION OVERLAPPING BANNER & HOLDING THE TOP EDGE OF LOWER BAR */}
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
                <path d="M93 62 C93 35, 159 35, 159 62" />
                <rect x="85" y="54" width="11" height="22" rx="5.5" />
                <rect x="156" y="54" width="11" height="22" rx="5.5" />
                <path d="M92 64 C92 38, 160 38, 160 64 L163 102 C163 111, 155 117, 146 117 L106 117 C97 117, 89 111, 89 102 Z" />
                <path d="M92 135 C92 112, 111 103, 126 103 C141 103, 160 112, 160 135 Z" />
                <path d="M95 122 C90 131, 91 140, 96 146 L109 144 C106 138, 106 131, 108 124 Z" />
                <path d="M157 122 C162 131, 161 140, 156 146 L143 144 C146 138, 146 131, 144 124 Z" />
                <rect x="93" y="142" width="20" height="11" rx="5.5" />
                <rect x="139" y="142" width="20" height="11" rx="5.5" />
              </g>

              {/* Back hair */}
              <path
                d="M92 64 C92 38, 160 38, 160 64 L163 102 C163 111, 155 117, 146 117 L106 117 C97 117, 89 111, 89 102 Z"
                fill="#1E1B3A"
              />

              {/* Headphones */}
              <path
                d="M93 62 C93 35, 159 35, 159 62"
                stroke="#FFFFFF"
                strokeWidth="5"
                strokeLinecap="round"
              />
              <rect
                x="85"
                y="54"
                width="11"
                height="22"
                rx="5.5"
                fill="#FFFFFF"
              />
              <rect
                x="156"
                y="54"
                width="11"
                height="22"
                rx="5.5"
                fill="#FFFFFF"
              />

              {/* Neck & Sweater */}
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

              {/* Face */}
              <path
                d="M103 58 C103 45, 149 45, 149 58 L149 71 C149 85, 139 94, 126 94 C113 94, 103 85, 103 71 Z"
                fill="#F4C3A0"
              />

              {/* Front hair bangs */}
              <path
                d="M102 60 C104 44, 148 44, 150 60 C143 52, 133 50, 126 55 C119 50, 109 52, 102 60 Z"
                fill="#1E1B3A"
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
                stroke="#4C35AB"
                strokeWidth="2.8"
              />
              <rect
                x="129"
                y="61"
                width="16"
                height="13"
                rx="4.5"
                fill="#FFFFFF"
                fillOpacity="0.2"
                stroke="#4C35AB"
                strokeWidth="2.8"
              />
              <line
                x1="123"
                y1="67"
                x2="129"
                y2="67"
                stroke="#4C35AB"
                strokeWidth="2.8"
                strokeLinecap="round"
              />

              {/* Eyes, Cheeks & Smile */}
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

        {/* LOWER CONTROL BAR: SEARCH + STATUS + SORT + CLEAR FILTERS + CREATE PROJECT */}
        <div className="relative z-10 mb-6 rounded-2xl border border-[#cfc9e8] bg-white/95 p-3.5 shadow-[0_6px_22px_rgba(91,68,186,0.06)]">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3">
            {/* SEARCH INPUT */}
            <div className="min-w-0 min-h-10 flex items-center gap-2.5 bg-[#f8f6fe] border border-[#cfc9e8] focus-within:border-[#5B44BA] focus-within:bg-white rounded-xl px-3.5 py-2 w-full sm:w-[240px] sm:flex-1 transition-colors">
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
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search projects..."
                aria-label="Search projects"
                className="min-w-0 border-none bg-transparent outline-none w-full text-[13px] text-[#1f1f1f] placeholder:text-[#8f89a6]"
              />

              {search && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('');
                    setPage(1);
                  }}
                  aria-label="Clear search"
                  className="shrink-0 w-5 h-5 rounded-full hover:bg-[#ece8fa] inline-flex items-center justify-center text-[#777777] hover:text-[#5B44BA] cursor-pointer transition-colors"
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

            {/* CUSTOM STATUS DROPDOWN */}
            <div ref={statusDropdownRef} className="relative min-w-0">
              <button
                type="button"
                aria-label="Project status"
                aria-haspopup="listbox"
                aria-expanded={openFilterDropdown === 'status'}
                onClick={() =>
                  setOpenFilterDropdown((prev) =>
                    prev === 'status' ? null : 'status',
                  )
                }
                className={`w-full sm:w-auto min-w-[140px] min-h-10 inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all ${
                  openFilterDropdown === 'status'
                    ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                    : statusFilter !== 'ALL'
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
                    openFilterDropdown === 'status'
                      ? 'rotate-180 text-[#5B44BA]'
                      : 'text-[#6e6b7b]'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openFilterDropdown === 'status' && (
                <div
                  role="listbox"
                  aria-label="Project status options"
                  className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 z-30 min-w-[175px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                >
                  {STATUS_OPTIONS.map((option) => {
                    const isSelected = statusFilter === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setStatusFilter(option.value);
                          setOpenFilterDropdown(null);
                          setPage(1);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
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
            </div>

            {/* CUSTOM SORT BY DROPDOWN */}
            <div ref={sortDropdownRef} className="relative min-w-0">
              <button
                type="button"
                aria-label="Sort projects"
                aria-haspopup="listbox"
                aria-expanded={openFilterDropdown === 'sort'}
                onClick={() =>
                  setOpenFilterDropdown((prev) =>
                    prev === 'sort' ? null : 'sort',
                  )
                }
                className={`w-full sm:w-auto min-w-[130px] min-h-10 inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all ${
                  openFilterDropdown === 'sort'
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
                    openFilterDropdown === 'sort'
                      ? 'rotate-180 text-[#5B44BA]'
                      : 'text-[#6e6b7b]'
                  }`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {openFilterDropdown === 'sort' && (
                <div
                  role="listbox"
                  aria-label="Sort projects options"
                  className="absolute left-0 sm:right-0 sm:left-auto top-full mt-1.5 z-30 min-w-[165px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                >
                  {SORT_OPTIONS.map((option) => {
                    const isSelected = sortBy === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => {
                          setSortBy(option.value);
                          setOpenFilterDropdown(null);
                          setPage(1);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors cursor-pointer ${
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
            </div>

            {/* CLEAR FILTERS BUTTON */}
            <button
              type="button"
              disabled={!hasActiveFilter}
              onClick={handleResetFilters}
              className="min-h-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-[#cfc9e8] bg-white px-4 py-2 text-[13px] font-medium text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] cursor-pointer disabled:cursor-not-allowed disabled:border-[#e4e0f2] disabled:bg-[#fafafa] disabled:text-[#b5b2c2]"
            >
              Clear filters
            </button>

            {/* CREATE PROJECT BUTTON (MOVED INTO LOWER CONTROL BAR) */}
            <button
              type="button"
              onClick={() => router.push('/projects/create')}
              className="min-h-10 shrink-0 inline-flex items-center justify-center gap-2 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] text-[#452ea0] hover:text-white px-4.5 py-2 text-[13px] font-bold shadow-[0_2px_8px_rgba(91,68,186,0.12)] hover:shadow-[0_6px_16px_rgba(91,68,186,0.26)] transition-all cursor-pointer"
            >
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Project</span>
            </button>
          </div>
        </div>

        {/* PROJECTS GRID */}
        {paginatedProjects.length === 0 ? (
          <div className="rounded-2xl bg-white/95 border border-[#cfc9e8] py-16 px-4 text-center shadow-[0_6px_24px_rgba(91,68,186,0.05)]">
            <div className="mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f1edff] text-[#5B44BA]">
              <svg
                width="22"
                height="22"
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
            </div>

            <p className="text-[16px] font-bold text-[#1f1f1f]">
              {hasActiveFilter
                ? 'No projects match your current filters'
                : 'No projects yet'}
            </p>
            <p className="mt-1 text-[13px] text-[#777777]">
              {hasActiveFilter
                ? 'Try adjusting your search or filter criteria.'
                : 'Create your first project to organize tasks and collaborate with your team.'}
            </p>

            {hasActiveFilter ? (
              <button
                type="button"
                onClick={handleResetFilters}
                className="mt-5 min-h-10 rounded-xl border border-[#c7bbf5] bg-[#f1edff] hover:bg-[#5B44BA] px-5 py-2 text-[12.5px] font-semibold text-[#5B44BA] hover:text-white cursor-pointer transition-colors"
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                onClick={() => router.push('/projects/create')}
                className="mt-5 min-h-10 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-5 py-2 text-[12.5px] font-bold text-[#452ea0] hover:text-white cursor-pointer transition-colors"
              >
                + Create Project
              </button>
            )}
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 xl:grid-cols-2 gap-5 transition-opacity ${
              isRefreshing ? 'opacity-60' : ''
            }`}
          >
            {paginatedProjects.map((item) => {
              const progress = Math.max(
                0,
                Math.min(100, item.progressPercent),
              );
              const isOwner = item.myRole === 'Owner';
              const isMenuOpen =
                isOwner && openMenuProjectId === item.projectId;

              return (
                <article
                  key={item.projectId}
                  className="group min-w-0 bg-white rounded-2xl border border-[#cfc9e8] hover:border-[#9e8ce6] p-5 sm:p-6 flex flex-col justify-between shadow-[0_4px_18px_rgba(35,25,66,0.05)] hover:shadow-[0_10px_28px_rgba(91,68,186,0.1)] transition-all duration-200"
                >
                  {/* TOP SECTION: ICON + TITLE + DESCRIPTION + STATUS/MENU */}
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA] group-hover:bg-[#5B44BA] group-hover:border-[#5B44BA] group-hover:text-white transition-colors">
                          <svg
                            width="18"
                            height="18"
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

                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/projects/${item.projectId}`}
                            className="block text-[18px] font-extrabold text-[#1f1f1f] group-hover:text-[#5B44BA] leading-snug break-words transition-colors"
                          >
                            {item.projectName}
                          </Link>

                          <p className="mt-1 text-[13px] text-[#777777] leading-[1.55] line-clamp-2 break-words">
                            {item.projectDescription ?? 'No description'}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`inline-flex items-center justify-center rounded-full border px-3 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${getProjectStatusBadgeClass(
                            item.derivedStatus,
                          )}`}
                        >
                          {item.derivedStatus}
                        </span>

                        {/* MORE OPTIONS DROPDOWN (แสดงเฉพาะ Owner เท่านั้น) */}
                        {isOwner && (
                          <div
                            ref={isMenuOpen ? menuContainerRef : null}
                            className="relative"
                          >
                            <button
                              type="button"
                              aria-label={`More options for ${item.projectName}`}
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              onClick={() =>
                                setOpenMenuProjectId((prev) =>
                                  prev === item.projectId ? null : item.projectId,
                                )
                              }
                              className={`min-h-9 min-w-9 rounded-lg inline-flex items-center justify-center text-[#444444] cursor-pointer transition-colors ${
                                isMenuOpen
                                  ? 'bg-[#f1eeff] text-[#5B44BA]'
                                  : 'hover:bg-[#f4f3f9]'
                              }`}
                            >
                              <svg
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                aria-hidden="true"
                              >
                                <circle cx="5" cy="12" r="1.8" />
                                <circle cx="12" cy="12" r="1.8" />
                                <circle cx="19" cy="12" r="1.8" />
                              </svg>
                            </button>

                            {isMenuOpen && (
                              <div
                                role="menu"
                                aria-label={`Actions for ${item.projectName}`}
                                className="absolute right-0 top-full mt-1.5 z-20 min-w-[164px] rounded-xl border border-[#cfc9e8] bg-white py-1.5 shadow-[0_10px_28px_rgba(31,31,31,0.12)]"
                              >
                                <Link
                                  role="menuitem"
                                  href={`/projects/${item.projectId}/settings`}
                                  onClick={() => setOpenMenuProjectId(null)}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-[#2b2b2b] hover:bg-[#f6f3ff] hover:text-[#5B44BA] transition-colors"
                                >
                                  <span>Edit Project</span>
                                </Link>

                                <div className="my-1 border-t border-[#f0f0f4]" />

                                <button
                                  type="button"
                                  role="menuitem"
                                  onClick={() => {
                                    setOpenMenuProjectId(null);
                                    setDeleteError('');
                                    setProjectToDelete(item);
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                >
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* MIDDLE SECTION: PROGRESS PANEL + DUE DATE */}
                  <div className="my-5 rounded-xl border border-[#d8d1f0] bg-[#f7f5fd] p-3.5">
                    <div className="mb-2 flex items-center justify-between text-[12px]">
                      <span className="font-semibold text-[#4a465c]">
                        Completion progress
                      </span>

                      <strong className="font-extrabold tabular-nums text-[#1f1f1f]">
                        {progress}%
                      </strong>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#e2dcf3]">
                      <div
                        className="h-full rounded-full bg-[#65c300] transition-[width] duration-300"
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[#dfd8f3] pt-2.5 text-[12px]">
                      <span className="inline-flex items-center gap-1.5 text-[#6f6b80]">
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
                          className="text-[#5B44BA]"
                        >
                          <rect
                            x="3"
                            y="4"
                            width="18"
                            height="18"
                            rx="2"
                            ry="2"
                          />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        <span>Due date</span>
                      </span>

                      <strong className="font-bold text-[#222222]">
                        {item.dueDate
                          ? formatDate(item.dueDate)
                          : 'No due date'}
                      </strong>
                    </div>
                  </div>

                  {/* FOOTER: TASK METRICS (STACKED LABEL) & VIEW PROJECT CTA */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      {/* TOTAL TASKS */}
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dcd5f5] bg-[#f3f0ff] text-[#5B44BA]">
                          <svg
                            width="17"
                            height="17"
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
                        </span>

                        <div className="flex flex-col">
                          <strong className="text-[13px] font-extrabold text-[#1f1f1f] leading-tight tabular-nums">
                            {item.totalTasks}
                          </strong>
                          <span className="mt-0.5 text-[11px] text-[#777777] leading-tight">
                            Total tasks
                          </span>
                        </div>
                      </div>

                      <div className="h-8 w-px bg-[#dcd6f0]" />

                      {/* HIGH PRIORITY */}
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
                          <svg
                            width="17"
                            height="17"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <circle cx="12" cy="12" r="9" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                          </svg>
                        </span>

                        <div className="flex flex-col">
                          <strong className="text-[13px] font-extrabold text-[#1f1f1f] leading-tight tabular-nums">
                            {item.highPriorityTasks}
                          </strong>
                          <span className="mt-0.5 text-[11px] text-[#777777] leading-tight">
                            High priority
                          </span>
                        </div>
                      </div>
                    </div>

                    <Link
                      href={`/projects/${item.projectId}`}
                      className="min-h-10 inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#cfc5f7] bg-[#f3f0ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#5B44BA] hover:text-white transition-colors"
                    >
                      <span>View project</span>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3 text-[12.5px]">
            <button
              type="button"
              disabled={isRefreshing || currentPage <= 1}
              onClick={() => setPage(currentPage - 1)}
              className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white hover:bg-[#f6f3ff] hover:border-[#9e8ce6] px-4 py-2 font-semibold text-[#333333] hover:text-[#5B44BA] disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
            >
              ← Previous
            </button>

            <span className="rounded-xl border border-[#cfc9e8] bg-white/95 px-4 py-2 font-semibold text-[#4a465c] tabular-nums">
              Page {currentPage} of {totalPages}
            </span>

            <button
              type="button"
              disabled={isRefreshing || currentPage >= totalPages}
              onClick={() => setPage(currentPage + 1)}
              className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white hover:bg-[#f6f3ff] hover:border-[#9e8ce6] px-4 py-2 font-semibold text-[#333333] hover:text-[#5B44BA] disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {projectToDelete && projectToDelete.myRole === 'Owner' && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 backdrop-blur-[1px]"
          onClick={() => {
            if (!isDeleting) {
              setProjectToDelete(null);
              setDeleteError('');
            }
          }}
        >
          <div
            className="w-full max-w-[460px] rounded-2xl bg-white px-6 py-7 sm:px-8 sm:py-8 shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 text-[#222222]">
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>

              <h2
                id="delete-project-title"
                className="text-[22px] font-extrabold tracking-tight text-[#1f1f1f]"
              >
                Delete project?
              </h2>

              <p className="mt-2.5 text-[15px] font-medium text-[#333333] break-words">
                Remove “{projectToDelete.projectName}” from your projects?
              </p>

              <p className="mt-3 text-[13px] leading-relaxed text-[#777777]">
                Deleting this project will permanently delete all tasks in it,
                including their comments and assignments. All project memberships
                will also be deleted.{' '}
                <span className="text-red-500">
                  This action cannot be undone.
                </span>
              </p>

              {deleteError && (
                <p
                  role="alert"
                  className="mt-3 w-full rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-600"
                >
                  {deleteError}
                </p>
              )}

              <div className="mt-7 flex w-full items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setProjectToDelete(null);
                    setDeleteError('');
                  }}
                  className="min-h-11 rounded-xl border border-[#dcdcdc] bg-white px-6 py-2.5 text-[13.5px] font-semibold text-[#222222] hover:bg-[#f5f5f7] transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleConfirmDelete()}
                  className="min-h-11 rounded-xl bg-rose-600 px-6 py-2.5 text-[13.5px] font-semibold text-white hover:bg-rose-700 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeleting ? 'Deleting...' : 'Delete project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}