'use client';

import KeyboardPopup from '@/components/ui/KeyboardPopup';
import { getNextItemIndex } from '@/lib/keyboardNavigation';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import {
  notFound,
  useParams,
  useRouter,
} from 'next/navigation';

import {
  ApiRequestError,
  projectApi,
} from '@/lib/projectApi';
import {
  parseRouteId,
  taskApi,
  tryParseRouteId,
} from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import { useSession } from '@/lib/SessionProvider';
import ProtectedState from '@/components/ProtectedState';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';

import type {
  ProjectItem,
  ProjectMember,
  Task,
  TaskStatus,
} from '@/types';

const emptySubscribe = () => () => {};

type DetailTab = 'overview' | 'tasks' | 'members';
const detailTabs: DetailTab[] = ['overview', 'tasks', 'members'];

// ต้องตรงกับ OVERVIEW_TASK_LIMIT ของ backend (GET /api/projects/:projectId/overview/tasks)
const OVERVIEW_TASK_LIMIT = 5;

type ProjectOverviewBundle = {
  project: ProjectItem;
  tasks: Task[];
  overviewTasks: Task[];
  members: ProjectMember[];
};

// ใช้เมื่อเรียก endpoint overview ไม่สำเร็จ (เช่น backend ยังเป็นเวอร์ชันเก่า) เรียงแบบเดียวกับฝั่ง backend
function pickOverviewTasks(tasks: Task[]): Task[] {
  return [...tasks]
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.taskId - b.taskId,
    )
    .slice(0, OVERVIEW_TASK_LIMIT);
}

type DeleteTarget = {
  scope: string;
  projectIdParam: string;
  userId: number | string;
  projectId: number;
};

type ScopedPageNotice = {
  scope: string;
  message: string;
};

type LatestProjectOverride = {
  scope: string;
  baseProject: ProjectItem;
  project: ProjectItem;
};

const TASK_PRIORITY_OPTIONS: { value: 'ALL' | 1 | 2 | 3; label: string }[] = [
  { value: 'ALL', label: 'All priority' },
  { value: 1, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Low' },
];

const TASK_STATUS_OPTIONS: { value: TaskStatus | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All status' },
  { value: 'To do', label: 'To do' },
  { value: 'In progress', label: 'In progress' },
  { value: 'Done', label: 'Done' },
];

const TASK_SORT_OPTIONS: {
  value: 'DEFAULT' | 'DUE_DATE' | 'PRIORITY' | 'NAME';
  label: string;
}[] = [
  { value: 'DEFAULT', label: 'Sort by' },
  { value: 'DUE_DATE', label: 'Due date' },
  { value: 'PRIORITY', label: 'Priority' },
  { value: 'NAME', label: 'Name' },
];

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

function formatLongDate(value: string | null | undefined) {
  if (!value) return 'Not set';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
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

function getPriorityLabel(priority: Task['priority']) {
  if (priority === 1) return 'High';
  if (priority === 2) return 'Medium';
  return 'Low';
}

function getPriorityBadgeClass(priority: Task['priority']) {
  if (priority === 1) return 'bg-red-50 text-red-600 border-red-200';
  if (priority === 2) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-cyan-50 text-cyan-700 border-cyan-200';
}

function getStatusBadgeClass(status: TaskStatus) {
  if (status === 'Done') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'In progress') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-neutral-200 text-neutral-700 border-neutral-300';
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isInvalidId = tryParseRouteId(params.projectId, 'project ID') === null;

  const {
    session,
    getLatestSession,
    refreshSession,
  } = useSession();

  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const tabIdPrefix = useId();
  const tabId = (tab: DetailTab) => `${tabIdPrefix}-tab-${tab}`;
  const panelId = (tab: DetailTab) => `${tabIdPrefix}-panel-${tab}`;

  function selectAndFocusTab(tab: DetailTab) {
    document.getElementById(tabId(tab))?.focus();
    setActiveTab(tab);
  }
  const [taskSearch, setTaskSearch] = useState('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<'ALL' | 1 | 2 | 3>('ALL');
  const [taskStatusFilter, setTaskStatusFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [taskSortBy, setTaskSortBy] = useState<'DEFAULT' | 'DUE_DATE' | 'PRIORITY' | 'NAME'>('DEFAULT');
  const [openTaskDropdown, setOpenTaskDropdown] = useState<
    'priority' | 'status' | 'sort' | null
  >(null);
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState<DeleteTarget | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [permissionNotice, setPermissionNotice] =
    useState<ScopedPageNotice | null>(null);
  const [latestProjectOverride, setLatestProjectOverride] =
    useState<LatestProjectOverride | null>(null);

  const currentScope = `${String(session.user?.userId ?? '')}:${params.projectId}`;

  const mountedRef = useRef(false);
  const projectIdParamRef = useRef(params.projectId);
  const isDeletingRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeDeleteRef = useRef<DeleteTarget | null>(null);
  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const taskFilterBarRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async (): Promise<ProjectOverviewBundle> => {
    const id = parseRouteId(params.projectId, 'project ID');

    const [project, tasks, overviewTasks, members] = await Promise.all([
      projectApi.getProjectById(id),
      taskApi.getTasks(id),
      // ไม่ให้ทั้งหน้าพังถ้าส่วน preview นี้โหลดไม่ได้
      taskApi.getOverviewTasks(id).catch((error: unknown) => {
        console.warn('Falling back to client-side overview tasks', error);
        return null;
      }),
      projectApi.getProjectMembers(id),
    ]);

    return {
      project,
      tasks,
      overviewTasks: overviewTasks ?? pickOverviewTasks(tasks),
      members,
    };
  }, [params.projectId]);

  const {
    status,
    data: bundle,
    httpStatus,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: false,
  });

  const isNotFound =
    isInvalidId ||
    (status === 'error' && (httpStatus === 400 || httpStatus === 404));

  useEffect(() => {
    if (isNotFound && isClient) {
      notFound();
    }
  }, [isNotFound, isClient]);

  // ปิด Dropdown ของตัวกรอง Tasks เมื่อคลิกด้านนอกหรือกด Escape
  useEffect(() => {
    if (openTaskDropdown === null) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        taskFilterBarRef.current &&
        !taskFilterBarRef.current.contains(event.target as Node)
      ) {
        setOpenTaskDropdown(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenTaskDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openTaskDropdown]);

  // ปิดเมนู ••• มุมขวาบนเมื่อคลิกด้านนอกหรือกด Escape
  useEffect(() => {
    if (!isHeaderMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        headerMenuRef.current &&
        !headerMenuRef.current.contains(event.target as Node)
      ) {
        setIsHeaderMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsHeaderMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHeaderMenuOpen]);

  const baseProject = bundle?.project ?? null;

  const displayedProject =
    baseProject !== null &&
    latestProjectOverride !== null &&
    latestProjectOverride.scope === currentScope &&
    latestProjectOverride.baseProject === baseProject
      ? latestProjectOverride.project
      : baseProject;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      isDeletingRef.current = false;
      activeDeleteRef.current = null;
    };
  }, []);

  useEffect(() => {
    projectIdParamRef.current = params.projectId;
  }, [params.projectId]);

  useEffect(() => {
    const context = activeDeleteRef.current;

    if (!context) return;

    const routeChanged = params.projectId !== context.projectIdParam;

    const accountChanged =
      session.status === 'ready' &&
      session.user?.userId !== context.userId;

    const sessionEnded =
      session.status === 'login-required' ||
      session.status === 'no-profile';

    if (routeChanged || accountChanged || sessionEnded) {
      requestSequenceRef.current += 1;
      isDeletingRef.current = false;
      activeDeleteRef.current = null;
      setDeleteTarget(null);
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
      setDeleteError('');
    }
  }, [
    params.projectId,
    session.status,
    session.user?.userId,
  ]);

  useEffect(() => {
    const context = activeDeleteRef.current;

    if (!context || isDeletingRef.current) return;

    if (
      status === 'error' ||
      (status === 'ready' &&
        (displayedProject === null ||
          displayedProject.projectId !== context.projectId ||
          displayedProject.myRole?.toLowerCase() !== 'owner'))
    ) {
      const lostOwnerRole =
        status === 'ready' &&
        displayedProject !== null &&
        displayedProject.projectId === context.projectId &&
        displayedProject.myRole?.toLowerCase() !== 'owner';

      requestSequenceRef.current += 1;
      activeDeleteRef.current = null;
      setDeleteTarget(null);
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
      setDeleteError('');

      if (lostOwnerRole) {
        setPermissionNotice({
          scope: context.scope,
          message:
            'Your Owner permission has changed. You can no longer delete this project.',
        });
      }
    }
  }, [displayedProject, status]);

  const isDeleteRequestCurrent = useCallback(
    async (
      requestId: number,
      context: DeleteTarget,
    ): Promise<boolean> => {
      const activeContext = activeDeleteRef.current;

      if (
        !mountedRef.current ||
        requestSequenceRef.current !== requestId ||
        projectIdParamRef.current !== context.projectIdParam ||
        activeContext === null ||
        activeContext.projectIdParam !== context.projectIdParam ||
        activeContext.userId !== context.userId ||
        activeContext.projectId !== context.projectId
      ) {
        return false;
      }

      let resolvedSession = getLatestSession();

      if (resolvedSession.status === 'loading') {
        await refreshSession();

        const postRefreshContext = activeDeleteRef.current;

        if (
          !mountedRef.current ||
          requestSequenceRef.current !== requestId ||
          projectIdParamRef.current !== context.projectIdParam ||
          postRefreshContext === null ||
          postRefreshContext.projectIdParam !== context.projectIdParam ||
          postRefreshContext.userId !== context.userId ||
          postRefreshContext.projectId !== context.projectId
        ) {
          return false;
        }

        resolvedSession = getLatestSession();
      }

      return (
        resolvedSession.status === 'ready' &&
        resolvedSession.user?.userId === context.userId
      );
    },
    [getLatestSession, refreshSession],
  );

  // ตัวเลขสรุปสถานะงาน 4 กล่องบน Overview
  const taskStats = useMemo(() => {
    const list = bundle?.tasks ?? [];
    let highPriority = 0;
    let inProgress = 0;
    let completed = 0;
    let todo = 0;

    for (const task of list) {
      if (task.priority === 1) highPriority += 1;
      if (task.status === 'In progress') inProgress += 1;
      else if (task.status === 'Done') completed += 1;
      else if (task.status === 'To do') todo += 1;
    }

    return {
      highPriority,
      inProgress,
      completed,
      todo,
    };
  }, [bundle?.tasks]);

  // รายการงานที่ผ่านการค้นหา กรองระดับความสำคัญ กรองสถานะ และจัดเรียง
  const filteredTasks = useMemo(() => {
    const list = bundle?.tasks ?? [];
    const keyword = taskSearch.trim().toLowerCase();

    const filtered = list.filter((task) => {
      const matchesStatus =
        taskStatusFilter === 'ALL' || task.status === taskStatusFilter;

      const matchesPriority =
        taskPriorityFilter === 'ALL' || task.priority === taskPriorityFilter;

      const matchesSearch =
        !keyword ||
        task.taskTitle.toLowerCase().includes(keyword) ||
        (task.taskDescription ?? '').toLowerCase().includes(keyword);

      return matchesStatus && matchesPriority && matchesSearch;
    });

    if (taskSortBy === 'NAME') {
      return [...filtered].sort((a, b) =>
        a.taskTitle.localeCompare(b.taskTitle),
      );
    }

    if (taskSortBy === 'DUE_DATE') {
      return [...filtered].sort((a, b) =>
        a.dueDate.localeCompare(b.dueDate),
      );
    }

    if (taskSortBy === 'PRIORITY') {
      return [...filtered].sort((a, b) => a.priority - b.priority);
    }

    return filtered;
  }, [bundle?.tasks, taskSearch, taskPriorityFilter, taskStatusFilter, taskSortBy]);

  const hasActiveTaskFilters =
    taskSearch.trim() !== '' ||
    taskPriorityFilter !== 'ALL' ||
    taskStatusFilter !== 'ALL' ||
    taskSortBy !== 'DEFAULT';

  const handleClearTaskFilters = () => {
    setTaskSearch('');
    setTaskPriorityFilter('ALL');
    setTaskStatusFilter('ALL');
    setTaskSortBy('DEFAULT');
    setOpenTaskDropdown(null);
  };

  const isDeleteTargetVerified =
    deleteTarget !== null &&
    session.status === 'ready' &&
    session.user !== null &&
    session.user.userId === deleteTarget.userId &&
    params.projectId === deleteTarget.projectIdParam &&
    status === 'ready' &&
    displayedProject !== null &&
    displayedProject.projectId === deleteTarget.projectId &&
    displayedProject.myRole?.toLowerCase() === 'owner';

  const isDeleteDialogVisible =
    isDeleteDialogOpen && isDeleteTargetVerified;

  if (isNotFound) {
    return null;
  }

  const openDeleteDialog = () => {
    if (
      !displayedProject ||
      displayedProject.myRole?.toLowerCase() !== 'owner' ||
      session.status !== 'ready' ||
      !session.user ||
      isDeleting ||
      isDeletingRef.current
    ) {
      return;
    }

    const projectId = tryParseRouteId(params.projectId, 'project ID');

    if (
      projectId === null ||
      displayedProject.projectId !== projectId
    ) {
      return;
    }

    const nextTarget: DeleteTarget = {
      scope: currentScope,
      projectIdParam: params.projectId,
      userId: session.user.userId,
      projectId,
    };

    activeDeleteRef.current = nextTarget;
    setDeleteTarget(nextTarget);
    setDeleteError('');
    setPermissionNotice(null);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting || isDeletingRef.current) return;

    requestSequenceRef.current += 1;
    isDeletingRef.current = false;
    activeDeleteRef.current = null;

    setDeleteTarget(null);
    setIsDeleteDialogOpen(false);
    setDeleteError('');
  };

  const handleDeleteProject = async () => {
    if (
      !baseProject ||
      !displayedProject ||
      isDeleting ||
      isDeletingRef.current ||
      !isDeleteDialogOpen
    ) {
      return;
    }

    const context = activeDeleteRef.current;

    if (!context) {
      setDeleteTarget(null);
      setIsDeleteDialogOpen(false);
      return;
    }

    if (
      session.status !== 'ready' ||
      !session.user ||
      session.user.userId !== context.userId ||
      params.projectId !== context.projectIdParam ||
      displayedProject.projectId !== context.projectId ||
      displayedProject.myRole?.toLowerCase() !== 'owner'
    ) {
      requestSequenceRef.current += 1;
      isDeletingRef.current = false;
      activeDeleteRef.current = null;
      setDeleteTarget(null);
      setIsDeleteDialogOpen(false);
      setDeleteError('');
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;
    isDeletingRef.current = true;

    setIsDeleting(true);
    setDeleteError('');
    setPermissionNotice(null);

    try {
      const latestProject = await projectApi.getProjectById(
        context.projectId,
      );

      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      if (
        latestProject.projectId !== context.projectId ||
        latestProject.myRole?.toLowerCase() !== 'owner'
      ) {
        isDeletingRef.current = false;
        activeDeleteRef.current = null;
        setDeleteTarget(null);
        setIsDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeleteError('');

        setLatestProjectOverride({
          scope: context.scope,
          baseProject,
          project: latestProject,
        });

        setPermissionNotice({
          scope: context.scope,
          message:
            'Your Owner permission has changed. You can no longer delete this project.',
        });

        retry();

        return;
      }

      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      await projectApi.deleteProject(context.projectId);

      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      isDeletingRef.current = false;
      activeDeleteRef.current = null;
      setDeleteTarget(null);
      setIsDeleting(false);
      setIsDeleteDialogOpen(false);

      router.push('/projects');
      router.refresh();
    } catch (error) {
      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          isDeletingRef.current = false;
          activeDeleteRef.current = null;
          setDeleteTarget(null);
          setIsDeleteDialogOpen(false);
          setIsDeleting(false);
          router.replace('/login');
          return;
        }

        if (error.status === 403) {
          isDeletingRef.current = false;
          activeDeleteRef.current = null;
          setDeleteTarget(null);
          setIsDeleteDialogOpen(false);
          setIsDeleting(false);
          setDeleteError('');
          setPermissionNotice({
            scope: context.scope,
            message:
              'Your Owner permission has changed. You can no longer delete this project.',
          });
          retry();
          return;
        }

        if (error.status === 404) {
          setDeleteError(
            'This project could not be found. It may have already been deleted.',
          );
          return;
        }

        setDeleteError(error.message);
        return;
      }

      setDeleteError(
        'Unable to delete this project. Please try again.',
      );
    } finally {
      if (
        mountedRef.current &&
        requestSequenceRef.current === requestId
      ) {
        isDeletingRef.current = false;
        setIsDeleting(false);
      }
    }
  };

  const visiblePermissionNotice =
    permissionNotice?.scope === currentScope
      ? permissionNotice.message
      : '';

  if (status === 'error') {
    return (
      <>
        {visiblePermissionNotice && (
          <div
            role="alert"
            className="mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {visiblePermissionNotice}
          </div>
        )}

        <div className="mx-auto min-w-0 max-w-3xl rounded-2xl border border-[#cfc9e8] bg-white p-5 sm:p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)] [overflow-wrap:anywhere]">
          <p role="alert" className="mb-4 text-[13.5px] font-medium text-red-600">
            Unable to load the project. Please try again.
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push('/projects')}
              className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white hover:bg-[#f6f3ff] hover:text-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#333333] transition-colors cursor-pointer"
            >
              Back to Projects
            </button>

            <button
              type="button"
              onClick={retry}
              className="min-h-10 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-4 py-2 text-[12.5px] font-bold text-[#452ea0] hover:text-white transition-colors cursor-pointer"
            >
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  if (status !== 'ready' || bundle === null || displayedProject === null) {
    return (
      <>
        {visiblePermissionNotice && (
          <div
            role="alert"
            className="mx-auto mb-4 max-w-6xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {visiblePermissionNotice}
          </div>
        )}

        <ProtectedState
          status={status === 'ready' ? 'loading' : status}
          onRetry={retry}
        />
      </>
    );
  }

  const progress = Math.max(
    0,
    Math.min(100, displayedProject.progressPercent),
  );
  const isOwner =
    displayedProject.myRole !== undefined && displayedProject.myRole !== null
      ? displayedProject.myRole.toLowerCase() === 'owner'
      : bundle.members.some(
          (m) =>
            session.user?.userId !== undefined &&
            String(m.userId) === String(session.user.userId) &&
            m.role?.toLowerCase() === 'owner',
        );
  const projectId = displayedProject.projectId;
  const members = bundle.members;
  const visibleMembersPreview = members.slice(0, 3);
  const extraMembersCount = Math.max(0, members.length - 3);

  const currentPriorityLabel =
    TASK_PRIORITY_OPTIONS.find((opt) => opt.value === taskPriorityFilter)
      ?.label ?? 'All priority';
  const currentStatusLabel =
    TASK_STATUS_OPTIONS.find((opt) => opt.value === taskStatusFilter)?.label ??
    'All status';
  const currentSortLabel =
    TASK_SORT_OPTIONS.find((opt) => opt.value === taskSortBy)?.label ??
    'Sort by';

  const renderTasksTable = (compact = false) => {
    // Overview แสดงเฉพาะงานจาก endpoint overview (5 งาน, เรียงฝั่ง backend); แท็บ Tasks ใช้ตัวกรองเต็ม
    const rows = compact ? bundle.overviewTasks : filteredTasks;

    return (
      <section className="min-w-0 rounded-[24px] border border-[#e2daff] bg-white shadow-[0_8px_26px_rgba(91,68,186,0.06)]">
        {/* PURPLE GRADIENT TOP HEADER BAR (DASHBOARD STYLE) */}
        <div className="relative overflow-hidden rounded-t-[23px] flex flex-wrap gap-3 items-center justify-between bg-gradient-to-r from-[#5B44BA] via-[#7A61D4] to-[#9B86EE] px-4 py-4 sm:px-6 sm:py-4.5 text-white">
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
                  Tasks
                </h2>
                <span className="inline-flex items-center rounded-full bg-white/20 border border-white/30 px-2.5 py-0.5 text-[11.5px] font-bold text-white tabular-nums">
                  {bundle.tasks.length}
                </span>
              </div>
              <p className="text-[11px] text-white/80">
                {compact
                  ? 'Top priority & upcoming tasks'
                  : 'Manage all tasks in this project'}
              </p>
            </div>
          </div>

          {!compact && isOwner && (
            <Link
              href={`/projects/${projectId}/tasks/new`}
              className="relative z-[1] min-h-9 rounded-full bg-white hover:bg-[#f3efff] px-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#5B44BA] shadow-sm transition-colors duration-150"
            >
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
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Create Task</span>
            </Link>
          )}
        </div>

        {/* CARD BODY */}
        <div className="p-4 sm:p-6 pt-4 sm:pt-5">
          {!compact && (
            /* FILTER BAR ROW */
            <div
              ref={taskFilterBarRef}
              className="mb-5 flex flex-wrap items-center gap-2.5"
            >
              {/* SEARCH INPUT */}
              <div className="flex min-h-10 min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-[#cfc9e8] focus-within:border-[#5B44BA] bg-[#f8f6fe] focus-within:bg-white px-3.5 py-2 transition-colors">
                <svg
                  width="14"
                  height="14"
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
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  placeholder="Search task..."
                  aria-label="Search task"
                  className="w-full min-w-0 border-none bg-transparent text-[13px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6]"
                />

                {taskSearch && (
                  <button
                    type="button"
                    onClick={() => setTaskSearch('')}
                    aria-label="Clear task search"
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

              {/* CUSTOM PRIORITY DROPDOWN */}
              <KeyboardPopup
                open={openTaskDropdown === 'priority'}
                onClose={() => setOpenTaskDropdown(null)}
                className="relative shrink-0"
              >
                <button
                  type="button"
                  aria-label="Filter tasks by priority"
                  aria-haspopup="listbox"
                  aria-expanded={openTaskDropdown === 'priority'}
                  onClick={() =>
                    setOpenTaskDropdown((prev) =>
                      prev === 'priority' ? null : 'priority',
                    )
                  }
                  className={`min-h-10 min-w-[135px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all ${
                    openTaskDropdown === 'priority'
                      ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                      : taskPriorityFilter !== 'ALL'
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
                      openTaskDropdown === 'priority'
                        ? 'rotate-180 text-[#5B44BA]'
                        : 'text-[#6e6b7b]'
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openTaskDropdown === 'priority' && (
                  <div
                    role="listbox"
                    aria-label="Task priority options"
                    className="absolute left-0 top-full mt-1.5 z-30 min-w-[165px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                  >
                    {TASK_PRIORITY_OPTIONS.map((option) => {
                      const isSelected = taskPriorityFilter === option.value;
                      return (
                        <button
                          key={String(option.value)}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          onClick={() => {
                            setTaskPriorityFilter(option.value);
                            setOpenTaskDropdown(null);
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
              </KeyboardPopup>

              {/* CUSTOM STATUS DROPDOWN */}
              <KeyboardPopup
                open={openTaskDropdown === 'status'}
                onClose={() => setOpenTaskDropdown(null)}
                className="relative shrink-0"
              >
                <button
                  type="button"
                  aria-label="Filter tasks by status"
                  aria-haspopup="listbox"
                  aria-expanded={openTaskDropdown === 'status'}
                  onClick={() =>
                    setOpenTaskDropdown((prev) =>
                      prev === 'status' ? null : 'status',
                    )
                  }
                  className={`min-h-10 min-w-[135px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all ${
                    openTaskDropdown === 'status'
                      ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                      : taskStatusFilter !== 'ALL'
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
                      openTaskDropdown === 'status'
                        ? 'rotate-180 text-[#5B44BA]'
                        : 'text-[#6e6b7b]'
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openTaskDropdown === 'status' && (
                  <div
                    role="listbox"
                    aria-label="Task status options"
                    className="absolute left-0 top-full mt-1.5 z-30 min-w-[170px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                  >
                    {TASK_STATUS_OPTIONS.map((option) => {
                      const isSelected = taskStatusFilter === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          onClick={() => {
                            setTaskStatusFilter(option.value);
                            setOpenTaskDropdown(null);
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
              </KeyboardPopup>

              {/* CUSTOM SORT DROPDOWN */}
              <KeyboardPopup
                open={openTaskDropdown === 'sort'}
                onClose={() => setOpenTaskDropdown(null)}
                className="relative shrink-0"
              >
                <button
                  type="button"
                  aria-label="Sort tasks"
                  aria-haspopup="listbox"
                  aria-expanded={openTaskDropdown === 'sort'}
                  onClick={() =>
                    setOpenTaskDropdown((prev) =>
                      prev === 'sort' ? null : 'sort',
                    )
                  }
                  className={`min-h-10 min-w-[125px] inline-flex items-center justify-between gap-2.5 rounded-xl border px-3.5 py-2 text-[13px] font-medium outline-none cursor-pointer transition-all ${
                    openTaskDropdown === 'sort'
                      ? 'border-[#5B44BA] bg-white text-[#5B44BA] ring-2 ring-[#5B44BA]/15'
                      : taskSortBy !== 'DEFAULT'
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
                      openTaskDropdown === 'sort'
                        ? 'rotate-180 text-[#5B44BA]'
                        : 'text-[#6e6b7b]'
                    }`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {openTaskDropdown === 'sort' && (
                  <div
                    role="listbox"
                    aria-label="Sort task options"
                    className="absolute right-0 top-full mt-1.5 z-30 min-w-[165px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                  >
                    {TASK_SORT_OPTIONS.map((option) => {
                      const isSelected = taskSortBy === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          tabIndex={-1}
                          aria-selected={isSelected}
                          onClick={() => {
                            setTaskSortBy(option.value);
                            setOpenTaskDropdown(null);
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
              </KeyboardPopup>

              {/* CLEAR FILTER BUTTON */}
              <button
                type="button"
                onClick={handleClearTaskFilters}
                disabled={!hasActiveTaskFilters}
                className="min-h-10 shrink-0 rounded-xl border border-[#cfc9e8] bg-white px-4 py-2 text-[13px] font-medium text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] cursor-pointer disabled:cursor-not-allowed disabled:border-[#e4e0f2] disabled:bg-[#fafafa] disabled:text-[#b5b2c2]"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* TABLE HEADER */}
          <div
            aria-hidden="true"
            className="hidden md:grid md:grid-cols-[minmax(0,2fr)_96px_minmax(0,1.15fr)_116px_136px] items-center gap-3 rounded-xl bg-[#f7f5fd] border border-[#e5e0f5] px-3.5 py-2.5 text-[12px] font-semibold text-[#6e6b7b]"
          >
            <div>Tasks name</div>
            <div className="text-center">Priority</div>
            <div>Assignee</div>
            <div className="text-center">Status</div>
            <div>Due Date</div>
          </div>

          {/* ROWS */}
          {rows.length === 0 ? (
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
                {bundle.tasks.length === 0
                  ? 'No tasks in this project yet.'
                  : 'No tasks match your filters.'}
              </p>
              <p className="mt-1 text-[12.5px] text-[#777777]">
                {bundle.tasks.length === 0
                  ? isOwner
                    ? 'Create a task to start tracking progress.'
                    : 'No tasks have been created in this project yet.'
                  : 'Try adjusting your search or filter selection.'}
              </p>
              {bundle.tasks.length === 0 ? (
                isOwner && (
                  <Link
                    href={`/projects/${projectId}/tasks/new`}
                    className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-4 py-2 text-[12.5px] font-bold text-[#452ea0] hover:text-white transition-colors"
                  >
                    <span>+ Create Task</span>
                  </Link>
                )
              ) : (
                <button
                  type="button"
                  onClick={handleClearTaskFilters}
                  className="mt-4 inline-flex min-h-10 items-center rounded-xl border border-[#c7bbf5] bg-[#f1edff] hover:bg-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#5B44BA] hover:text-white transition-colors cursor-pointer"
                >
                  Clear filter
                </button>
              )}
            </div>
          ) : (
            <div className="mt-1 divide-y divide-[#ece8f8]">
              {rows.map((task) => {
                const assignees = task.assignees ?? [];
                const firstAssignee = assignees[0];
                const extraAssignees = Math.max(0, assignees.length - 1);

                return (
                  <div
                    key={task.taskId}
                    className="group relative grid grid-cols-1 gap-2.5 rounded-xl px-3.5 py-3.5 md:grid-cols-[minmax(0,2fr)_96px_minmax(0,1.15fr)_116px_136px] md:items-center md:gap-3 hover:bg-[#f7f5ff] transition-colors cursor-pointer"
                  >
                    {/* TASK NAME & DESCRIPTION */}
                    <div className="min-w-0">
                      <Link
                        href={`/projects/${projectId}/tasks/${task.taskId}`}
                        className="block truncate text-[13.5px] font-bold text-[#1f1f1f] group-hover:text-[#5B44BA] transition-colors after:absolute after:inset-0 focus:outline-none focus-visible:underline"
                      >
                        {task.taskTitle}
                      </Link>
                      <p className="mt-0.5 truncate text-[11.5px] text-[#7c788c]">
                        {task.taskDescription || 'No description'}
                      </p>
                    </div>

                    {/* PRIORITY */}
                    <div className="flex items-center md:justify-center">
                      <span className="mr-2 text-[11px] font-semibold text-[#888888] md:hidden">
                        Priority:
                      </span>
                      <span
                        className={`inline-flex items-center justify-center rounded-full border px-3 py-0.5 text-[11.5px] font-semibold ${getPriorityBadgeClass(
                          task.priority,
                        )}`}
                      >
                        {getPriorityLabel(task.priority)}
                      </span>
                    </div>

                    {/* ASSIGNEE */}
                    <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-[#333333]">
                      <span className="shrink-0 w-7 h-7 rounded-full border border-[#dcd4fa] bg-[#f1edff] inline-flex items-center justify-center text-[#5B44BA]">
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
                      </span>

                      <span className="truncate font-medium">
                        {firstAssignee ? firstAssignee.userName : 'Unassigned'}
                        {extraAssignees > 0 ? ` +${extraAssignees}` : ''}
                      </span>
                    </div>

                    {/* STATUS */}
                    <div className="flex items-center md:justify-center">
                      <span className="mr-2 text-[11px] font-semibold text-[#888888] md:hidden">
                        Status:
                      </span>
                      <span
                        className={`inline-flex items-center justify-center rounded-full border px-3 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${getStatusBadgeClass(
                          task.status,
                        )}`}
                      >
                        {task.status}
                      </span>
                    </div>

                    {/* DUE DATE */}
                    <div
                      className={`flex items-center gap-2 text-[12px] ${
                        task.isOverdue && task.status !== 'Done'
                          ? 'font-semibold text-rose-600'
                          : 'text-[#555266]'
                      }`}
                    >
                      <span
                        className={`shrink-0 w-7 h-7 rounded-full border inline-flex items-center justify-center ${
                          task.isOverdue && task.status !== 'Done'
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
                      <span className="truncate">{formatShortDate(task.dueDate)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {compact && bundle.tasks.length > rows.length && (
            <div className="mt-4 border-t border-[#ece8f8] pt-3.5 text-center">
              <button
                type="button"
                onClick={() => {
                  // ล้างคำค้นและตัวกรองเดิมของแท็บ Tasks ก่อน เพื่อให้เห็นงานครบทั้งหมด
                  handleClearTaskFilters();
                  selectAndFocusTab('tasks');
                }}
                className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#5B44BA] hover:text-[#422c9c] transition-colors cursor-pointer"
              >
                <span>View all {bundle.tasks.length} tasks</span>
                <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
      </section>
    );
  };

  return (
    <>
      <div className="relative min-w-0 pb-8 [overflow-wrap:anywhere]">
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
          {visiblePermissionNotice && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            >
              {visiblePermissionNotice}
            </div>
          )}

          {/* FRAMED PURPLE HEADER BANNER */}
          <div className="relative mb-6 rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 pt-6 pb-4 sm:px-9 sm:pt-7 sm:pb-5 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
            {/* Inner clipped background layer so header dropdowns never clip */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-[26px]"
            >
              {/* Soft decorative circles */}
              <div className="absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-white/[0.07]" />
              <div className="absolute right-8 -top-12 h-60 w-60 rounded-full bg-white/[0.08]" />
              <div className="absolute right-44 bottom-2 h-36 w-36 rounded-full bg-white/[0.06]" />

              {/* Decorative celestial & workspace pattern (no character) */}
              <svg
                viewBox="0 0 1152 210"
                fill="none"
                preserveAspectRatio="xMidYMid slice"
                className="h-full w-full"
              >
                <path
                  d="M280 218 C380 140, 505 162, 610 96 C715 30, 845 64, 975 -12"
                  stroke="#FFFFFF"
                  strokeOpacity="0.09"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M365 224 C465 154, 575 178, 685 116 C790 56, 895 86, 1040 16"
                  stroke="#FFFFFF"
                  strokeOpacity="0.06"
                  strokeWidth="1.6"
                  strokeDasharray="5 7"
                  strokeLinecap="round"
                />

                <g
                  stroke="#FFFFFF"
                  strokeOpacity="0.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {/* 4-point sparkles */}
                  <path
                    d="M342 36L344.6 44.4L353 47L344.6 49.6L342 58L339.4 49.6L331 47L339.4 44.4L342 36Z"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M642 126L644.4 133.6L652 136L644.4 138.4L642 146L639.6 138.4L632 136L639.6 133.6L642 126Z"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M846 42L848.8 51.2L858 54L848.8 56.8L846 66L843.2 56.8L834 54L843.2 51.2L846 42Z"
                    strokeWidth="1.7"
                  />
                  <path
                    d="M1044 128L1046.4 135.6L1054 138L1046.4 140.4L1044 148L1041.6 140.4L1034 138L1041.6 135.6L1044 128Z"
                    strokeWidth="1.7"
                  />

                  {/* Plus signs */}
                  <path d="M474 28V40M468 34H480" strokeWidth="1.9" />
                  <path d="M532 144V156M526 150H538" strokeWidth="1.9" />
                  <path d="M746 32V42M741 37H751" strokeWidth="1.8" />
                  <path d="M936 146V158M930 152H942" strokeWidth="1.9" />

                  {/* Rotated rounded diamonds */}
                  <rect
                    x="412"
                    y="116"
                    width="13"
                    height="13"
                    rx="3.5"
                    transform="rotate(45 418.5 122.5)"
                    strokeWidth="1.8"
                  />
                  <rect
                    x="602"
                    y="44"
                    width="12"
                    height="12"
                    rx="3.2"
                    transform="rotate(45 608 50)"
                    strokeWidth="1.8"
                  />
                  <rect
                    x="788"
                    y="108"
                    width="14"
                    height="14"
                    rx="3.8"
                    transform="rotate(45 795 115)"
                    strokeWidth="1.8"
                  />

                  {/* Mini check-squares */}
                  <g transform="translate(524 68)">
                    <rect x="0" y="0" width="17" height="17" rx="4.5" strokeWidth="1.8" />
                    <path d="M5 8.5L7.6 11.1L12.2 6.2" strokeWidth="1.8" />
                  </g>
                  <g transform="translate(888 86)">
                    <rect x="0" y="0" width="16" height="16" rx="4.2" strokeWidth="1.8" />
                    <path d="M4.6 8L7 10.4L11.4 5.8" strokeWidth="1.8" />
                  </g>

                  {/* Tilted pill capsules & rings */}
                  <rect
                    x="676"
                    y="76"
                    width="18"
                    height="8"
                    rx="4"
                    transform="rotate(-24 685 80)"
                    strokeWidth="1.8"
                  />
                  <circle cx="456" cy="82" r="5.5" strokeWidth="1.8" />
                  <circle cx="984" cy="68" r="5.5" strokeWidth="1.8" />
                </g>

                {/* Starry constellation dots */}
                <g fill="#FFFFFF" fillOpacity="0.24">
                  <circle cx="316" cy="148" r="2.4" />
                  <circle cx="325" cy="143" r="2.4" />
                  <circle cx="324" cy="153" r="2.4" />

                  <circle cx="578" cy="162" r="2.3" />
                  <circle cx="718" cy="152" r="2.4" />
                  <circle cx="727" cy="147" r="2.4" />

                  <circle cx="822" cy="162" r="2.3" />
                  <circle cx="964" cy="122" r="2.4" />
                  <circle cx="1084" cy="96" r="2.3" />
                </g>
              </svg>
            </div>

            <div className="relative z-[1]">
              {/* TOP ROW: BREADCRUMB + TITLE + DESCRIPTION */}
              <div className="min-w-0">
                <nav
                  aria-label="Breadcrumb"
                  className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-white/80"
                >
                  <Link
                    href="/projects"
                    className="font-medium hover:text-white transition-colors"
                  >
                    Projects
                  </Link>
                  <span aria-hidden="true" className="text-white/55">
                    &gt;
                  </span>
                  {activeTab === 'overview' ? (
                    <span className="min-w-0 max-w-full font-bold text-white [overflow-wrap:anywhere]">
                      {displayedProject.projectName}
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => selectAndFocusTab('overview')}
                        className="min-w-0 max-w-full text-left font-medium hover:text-white transition-colors cursor-pointer [overflow-wrap:anywhere]"
                      >
                        {displayedProject.projectName}
                      </button>
                      <span aria-hidden="true" className="text-white/55">
                        &gt;
                      </span>
                      <span className="font-bold text-white">
                        {activeTab === 'tasks' ? 'Tasks' : 'Members'}
                      </span>
                    </>
                  )}
                </nav>

                <div className="flex min-w-0 items-start gap-4">
                  <Link
                    href="/projects"
                    aria-label="Back to Projects"
                    className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#5B44BA] shadow-[0_4px_14px_rgba(35,25,66,0.16)] hover:bg-[#f4f0ff] hover:text-[#452ea0] transition-all"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                  </Link>

                  <div className="min-w-0">
                    <h1 className="text-[28px] sm:text-[34px] font-extrabold leading-tight tracking-tight text-white [overflow-wrap:anywhere]">
                      {displayedProject.projectName}
                    </h1>
                    <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-white/85">
                      {displayedProject.projectDescription ||
                        'No description provided.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* BOTTOM ROW: TABS (LEFT) + EDIT PROJECT & MORE MENU (RIGHT) ABOVE FULL-WIDTH LINE */}
              <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-b border-white/30">
                <div
                  role="tablist"
                  aria-label="Project sections"
                  onKeyDown={(event) => {
                    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                    const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
                    const current = tabs.findIndex((tab) => tab === event.target);
                    if (current < 0) return;
                    event.preventDefault();
                    const next = tabs[getNextItemIndex(event.key, current, tabs.length)];
                    next?.focus();
                    next?.click();
                  }}
                  className="flex min-w-0 max-w-full items-center gap-4 overflow-x-auto sm:gap-7"
                >
                  {(
                    [
                      { id: 'overview', label: 'Overview' },
                      { id: 'tasks', label: 'Tasks', count: bundle.tasks.length },
                      { id: 'members', label: 'Members', count: members.length },
                    ] as const
                  ).map((tab) => {
                    const isSelected = activeTab === tab.id;

                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={tabId(tab.id)}
                        aria-controls={panelId(tab.id)}
                        aria-selected={isSelected}
                        tabIndex={isSelected ? 0 : -1}
                        onClick={() => setActiveTab(tab.id)}
                        className={`relative inline-flex items-center gap-2 whitespace-nowrap px-0.5 pb-3 text-[14.5px] transition-colors cursor-pointer ${
                          isSelected
                            ? 'font-bold text-white'
                            : 'font-medium text-white/75 hover:text-white'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {'count' in tab && (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums transition-colors ${
                              isSelected
                                ? 'bg-white text-[#5B44BA]'
                                : 'bg-white/20 text-white/90'
                            }`}
                          >
                            {tab.count}
                          </span>
                        )}

                        {isSelected && (
                          <span
                            aria-hidden="true"
                            className="absolute inset-x-0 bottom-0 h-[2.5px] bg-white"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* RIGHT ACTIONS ALIGNED ABOVE BOTTOM LINE (OWNER ONLY) */}
                {isOwner && (
                  <div className="flex shrink-0 items-center gap-2.5 pb-2.5">
                    <Link
                      href={`/projects/${projectId}/settings`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white hover:bg-[#f4f0ff] px-4.5 py-2 text-[13px] font-bold text-[#452ea0] shadow-[0_4px_14px_rgba(32,19,84,0.16)] transition-all"
                    >
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
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      <span>Edit Project</span>
                    </Link>

                    <KeyboardPopup open={isHeaderMenuOpen} onClose={() => setIsHeaderMenuOpen(false)} ref={headerMenuRef} className="relative">
                      <button
                        type="button"
                        aria-label="Project options"
                        aria-haspopup="menu"
                        aria-expanded={isHeaderMenuOpen}
                        onClick={() => setIsHeaderMenuOpen((prev) => !prev)}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition-colors cursor-pointer ${
                          isHeaderMenuOpen
                            ? 'border-white bg-white text-[#5B44BA]'
                            : 'border-white/25 bg-white/15 text-white hover:bg-white/25 hover:border-white/40'
                        }`}
                      >
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>

                      {isHeaderMenuOpen && (
                        <div
                          role="menu"
                          aria-label="Project actions"
                          className="absolute right-0 top-full z-30 mt-2 min-w-[186px] rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_14px_34px_rgba(35,25,66,0.2)]"
                        >
                          <Link
                            role="menuitem"
                            tabIndex={-1}
                            href={`/projects/${projectId}/members`}
                            onClick={() => setIsHeaderMenuOpen(false)}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-[#2b2b2b] hover:bg-[#f6f3ff] hover:text-[#5B44BA] transition-colors"
                          >
                            <span>Manage Members</span>
                          </Link>

                          <div className="my-1 border-t border-[#ece8f8]" />

                          <button
                            type="button"
                            role="menuitem"
                            tabIndex={-1}
                            disabled={isDeleting}
                            onClick={() => {
                              setIsHeaderMenuOpen(false);
                              openDeleteDialog();
                            }}
                            className="flex w-full items-center gap-2.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <span>Delete Project</span>
                          </button>
                        </div>
                      )}
                    </KeyboardPopup>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2-COLUMN LAYOUT ON OVERVIEW; FULL WIDTH ON TASKS & MEMBERS */}
          {detailTabs.filter((tab) => tab !== activeTab).map((tab) => (
            <div key={tab} role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} hidden />
          ))}
          <div
            role="tabpanel"
            id={panelId(activeTab)}
            aria-labelledby={tabId(activeTab)}
            tabIndex={0}
            className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_316px]"
          >
            {/* LEFT / MAIN TAB CONTENT */}
            <div
              className={`min-w-0 ${
                activeTab === 'overview' ? 'lg:col-start-1' : 'lg:col-span-2'
              }`}
            >
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <div className="min-w-0 space-y-5">
                  {/* PROGRESS + 4 STATUS CARDS */}
                  <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 sm:p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)]">
                    <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1.12fr_1fr]">
                      {/* LEFT: PROGRESS */}
                      <div className="rounded-xl border border-[#e2dcf5] bg-[#f7f5fd] p-4 sm:p-5">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[12.5px] font-semibold text-[#5a5470]">
                            Progress
                          </p>
                          <span className="text-[12.5px] font-semibold text-[#6e6b7b] tabular-nums">
                            {displayedProject.completedTasks}/
                            {displayedProject.totalTasks} Tasks
                          </span>
                        </div>

                        <p className="mt-1 text-[30px] font-extrabold leading-tight text-[#1f1f1f] tabular-nums">
                          {progress}%
                        </p>

                        <div className="mt-3.5 h-2.5 w-full overflow-hidden rounded-full bg-[#e2dcf3]">
                          <div
                            className="h-full rounded-full bg-[#65c300] transition-[width] duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      {/* RIGHT: 2x2 STAT MINI-CARDS */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* High priority */}
                        <div className="flex items-center gap-3 rounded-xl border border-[#d8d1f0] bg-[#f7f5fd] px-3.5 py-3.5">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
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
                          <div className="min-w-0">
                            <p className="text-[15px] font-extrabold leading-tight text-[#1f1f1f] tabular-nums">
                              {taskStats.highPriority}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#6e6b7b]">
                              High priority
                            </p>
                          </div>
                        </div>

                        {/* In progress */}
                        <div className="flex items-center gap-3 rounded-xl border border-[#d8d1f0] bg-[#f7f5fd] px-3.5 py-3.5">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-blue-600">
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
                              <polyline points="12 7 12 12 15 14" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className="text-[15px] font-extrabold leading-tight text-[#1f1f1f] tabular-nums">
                              {taskStats.inProgress}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#6e6b7b]">
                              In progress
                            </p>
                          </div>
                        </div>

                        {/* Completed */}
                        <div className="flex items-center gap-3 rounded-xl border border-[#d8d1f0] bg-[#f7f5fd] px-3.5 py-3.5">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <polyline points="9 11 12 14 22 4" />
                              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className="text-[15px] font-extrabold leading-tight text-[#1f1f1f] tabular-nums">
                              {taskStats.completed}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#6e6b7b]">
                              Completed
                            </p>
                          </div>
                        </div>

                        {/* To do */}
                        <div className="flex items-center gap-3 rounded-xl border border-[#d8d1f0] bg-[#f7f5fd] px-3.5 py-3.5">
                          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-neutral-200 text-neutral-700">
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                            >
                              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className="text-[15px] font-extrabold leading-tight text-[#1f1f1f] tabular-nums">
                              {taskStats.todo}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-medium text-[#6e6b7b]">
                              To do
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TASKS TABLE CARD */}
                  {renderTasksTable(true)}
                </div>
              )}

              {/* TAB 2: TASKS */}
              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  {renderTasksTable(false)}
                </div>
              )}

              {/* TAB 3: MEMBERS */}
              {activeTab === 'members' && (
                <section className="mx-auto w-full max-w-3xl overflow-hidden rounded-[24px] border border-[#e2daff] bg-white shadow-[0_8px_26px_rgba(91,68,186,0.06)]">
                  {/* PURPLE GRADIENT TOP HEADER BAR (DASHBOARD STYLE) */}
                  <div className="relative overflow-hidden flex flex-wrap gap-3 items-center justify-between bg-gradient-to-r from-[#5B44BA] via-[#7A61D4] to-[#9B86EE] px-4 py-4 sm:px-6 sm:py-4.5 text-white">
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
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                      </span>

                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-[18px] font-extrabold text-white">
                            Project Members
                          </h2>
                          <span className="inline-flex items-center rounded-full bg-white/20 border border-white/30 px-2.5 py-0.5 text-[11.5px] font-bold text-white tabular-nums">
                            {members.length}
                          </span>
                        </div>
                        <p className="text-[11px] text-white/80">
                          People who have access to this project
                        </p>
                      </div>
                    </div>

                    {isOwner && (
                      <Link
                        href={`/projects/${projectId}/members`}
                        className="relative z-[1] min-h-9 rounded-full bg-white hover:bg-[#f3efff] px-4 inline-flex items-center gap-1.5 text-[12px] font-bold text-[#5B44BA] shadow-sm transition-colors duration-150"
                      >
                        <span>Manage Members</span>
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
                        >
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      </Link>
                    )}
                  </div>

                  {/* CARD BODY */}
                  <div className="p-4 sm:p-6 pt-4 sm:pt-5">
                    {members.length === 0 ? (
                      <p className="py-8 text-center text-[13px] text-[#777777]">
                        No members found in this project.
                      </p>
                    ) : (
                      <div className="divide-y divide-[#ece8f8] rounded-xl border border-[#dcd5f5] bg-white">
                        {members.map((member) => (
                          <div
                            key={member.userId}
                            className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-[#f9f7ff] transition-colors"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
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
                                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                  <circle cx="12" cy="7" r="4" />
                                </svg>
                              </span>

                              <div className="min-w-0">
                                <p className="truncate text-[14px] font-bold text-[#1f1f1f]">
                                  {member.userName}
                                </p>
                                <p className="truncate text-[12px] text-[#6e6b7b]">
                                  {member.email} · Joined {formatShortDate(member.joinDate)}
                                </p>
                              </div>
                            </div>

                            <span
                              className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
                                member.role?.toLowerCase() === 'owner'
                                  ? 'bg-[#5B44BA] text-white'
                                  : 'border border-[#dcd4fa] bg-[#f1edff] text-[#4c35ab]'
                              }`}
                            >
                              {member.role}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* RIGHT SIDEBAR (OVERVIEW TAB ONLY) */}
            {activeTab === 'overview' && (
              <aside className="min-w-0 space-y-5 lg:col-start-2">
                {/* PROJECT INFO CARD */}
                <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 shadow-[0_4px_18px_rgba(35,25,66,0.05)]">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-[16px] font-extrabold text-[#1f1f1f]">
                      Project info
                    </h2>
                  </div>

                  <div className="space-y-3.5">
                    <div>
                      <p className="text-[11px] font-medium text-[#7c788c]">
                        Project name
                      </p>
                      <p className="mt-0.5 text-[13.5px] font-bold text-[#1f1f1f] break-words">
                        {displayedProject.projectName}
                      </p>
                    </div>

                    <div>
                      <p className="text-[11px] font-medium text-[#7c788c]">
                        Description
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] font-medium leading-relaxed text-[#3d3a4b]">
                        {displayedProject.projectDescription ||
                          'No description provided.'}
                      </p>
                    </div>

                    <div className="space-y-3 rounded-xl border border-[#e2dcf5] bg-[#f7f5fd] p-3.5">
                      {/* Start Date */}
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-white text-[#5B44BA]">
                          <svg
                            width="15"
                            height="15"
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
                        <div>
                          <p className="text-[11px] text-[#7c788c]">
                            Start Date
                          </p>
                          <p className="text-[12.5px] font-bold text-[#1f1f1f]">
                            {formatLongDate(displayedProject.startDate)}
                          </p>
                        </div>
                      </div>

                      <div className="border-t border-[#e5dff7]" />

                      {/* End Date */}
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-white text-[#5B44BA]">
                          <svg
                            width="15"
                            height="15"
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
                        <div>
                          <p className="text-[11px] text-[#7c788c]">
                            End Date
                          </p>
                          <p className="text-[12.5px] font-bold text-[#1f1f1f]">
                            {formatLongDate(displayedProject.dueDate)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* MEMBERS PREVIEW CARD (3 NAMES + ... WHEN > 3) */}
                <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 shadow-[0_4px_18px_rgba(35,25,66,0.05)]">
                  <div className="mb-3.5 flex items-center justify-between">
                    <h2 className="text-[16px] font-extrabold text-[#1f1f1f]">
                      Members
                    </h2>

                    <button
                      type="button"
                      onClick={() => selectAndFocusTab('members')}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#5B44BA] hover:text-[#422c9c] transition-colors cursor-pointer"
                    >
                      <span>View all</span>
                      <span aria-hidden="true">→</span>
                    </button>
                  </div>

                  {members.length === 0 ? (
                    <p className="text-[12.5px] text-[#777777]">
                      No members found.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {visibleMembersPreview.map((member) => (
                        <div
                          key={member.userId}
                          className="flex items-center justify-between gap-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
                              <svg
                                width="14"
                                height="14"
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
                            </span>

                            <span className="truncate text-[13px] font-semibold text-[#1f1f1f]">
                              {member.userName}
                            </span>
                          </div>

                          <span
                            className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${
                              member.role?.toLowerCase() === 'owner'
                                ? 'bg-[#5B44BA] text-white'
                                : 'border border-[#dcd4fa] bg-[#f1edff] text-[#4c35ab]'
                            }`}
                          >
                            {member.role}
                          </span>
                        </div>
                      ))}

                      {extraMembersCount > 0 && (
                        <button
                          type="button"
                          onClick={() => selectAndFocusTab('members')}
                          className="flex w-full items-center gap-2.5 pt-0.5 text-left text-[12.5px] font-semibold text-[#5B44BA] hover:text-[#422c9c] transition-colors cursor-pointer"
                        >
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f6f3ff] text-[13px] font-bold tracking-wider text-[#5B44BA]">
                            ...
                          </span>
                          <span>+{extraMembersCount} more</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      <ConfirmationDialog
        open={isDeleteDialogVisible}
        title="Delete project?"
        itemName={`Remove “${displayedProject.projectName}” from your projects?`}
        description="Deleting this project will permanently delete all tasks in it, including their comments and assignments. All project memberships will also be deleted."
        confirmLabel="Delete project"
        isLoading={isDeleting}
        error={deleteError}
        onCancel={closeDeleteDialog}
        onConfirm={() => void handleDeleteProject()}
      />
    </>
  );
}