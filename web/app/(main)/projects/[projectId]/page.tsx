'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import {
  ApiRequestError,
  projectApi,
} from '@/lib/projectApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import { useSession } from '@/lib/SessionProvider';
import ProtectedState from '@/components/ProtectedState';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';
import type { ProjectItem } from '@/types';

type DeleteContext = {
  scope: string;
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

  const {
    session,
    refreshSession,
  } = useSession();

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [permissionNotice, setPermissionNotice] =
    useState<ScopedPageNotice | null>(null);
  const [latestProjectOverride, setLatestProjectOverride] =
    useState<LatestProjectOverride | null>(null);

  const currentScope = `${String(session.user?.userId ?? '')}:${params.projectId}`;

  const mountedRef = useRef(false);
  const sessionRef = useRef(session);
  const currentScopeRef = useRef(currentScope);
  const requestSequenceRef = useRef(0);
  const activeDeleteRef = useRef<DeleteContext | null>(null);

  const load = useCallback(async () => {
    const projectId = Number(params.projectId);

    if (!Number.isSafeInteger(projectId) || projectId <= 0) {
      throw new ApiRequestError('Invalid project ID.', 400);
    }

    return projectApi.getProjectById(projectId);
  }, [params.projectId]);

  const {
    status,
    data: project,
    httpStatus,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: true,
  });

  const displayedProject =
    project !== null &&
    latestProjectOverride !== null &&
    latestProjectOverride.scope === currentScope &&
    latestProjectOverride.baseProject === project
      ? latestProjectOverride.project
      : project;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      activeDeleteRef.current = null;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
    currentScopeRef.current = currentScope;
  }, [currentScope, session]);

  // ปิด Dialog และยกเลิก response เดิมเมื่อเปลี่ยนบัญชีหรือออกจากระบบ
  useEffect(() => {
    const context = activeDeleteRef.current;

    if (!context) return;

    const accountChanged =
      session.status === 'ready' &&
      session.user?.userId !== context.userId;

    const sessionEnded =
      session.status === 'login-required' ||
      session.status === 'no-profile';

    if (accountChanged || sessionEnded) {
      requestSequenceRef.current += 1;
      activeDeleteRef.current = null;
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
      setDeleteError('');
    }
  }, [
    session.status,
    session.user?.userId,
  ]);

  // ปิด Dialog หาก Project เปลี่ยน, โหลดข้อมูลไม่ได้
  // หรือผู้ใช้ไม่ได้เป็น Owner แล้ว
  useEffect(() => {
    const context = activeDeleteRef.current;

    if (!context) return;

    if (
      status === 'error' ||
      (status === 'ready' &&
        (displayedProject === null ||
          displayedProject.projectId !== context.projectId ||
          displayedProject.myRole !== 'Owner'))
    ) {
      requestSequenceRef.current += 1;
      activeDeleteRef.current = null;
      setIsDeleteDialogOpen(false);
      setIsDeleting(false);
      setDeleteError('');
    }
  }, [displayedProject, status]);

  const isDeleteRequestCurrent = useCallback(
    async (
      requestId: number,
      context: DeleteContext,
    ): Promise<boolean> => {
      const activeContext = activeDeleteRef.current;

      if (
        !mountedRef.current ||
        requestSequenceRef.current !== requestId ||
        currentScopeRef.current !== context.scope ||
        activeContext === null ||
        activeContext.scope !== context.scope ||
        activeContext.userId !== context.userId ||
        activeContext.projectId !== context.projectId
      ) {
        return false;
      }

      const latestSession = sessionRef.current;

      if (latestSession.status === 'loading') {
        const verifiedSession = await refreshSession();
        const postRefreshContext = activeDeleteRef.current;

        return (
          mountedRef.current &&
          requestSequenceRef.current === requestId &&
          currentScopeRef.current === context.scope &&
          postRefreshContext !== null &&
          postRefreshContext.scope === context.scope &&
          postRefreshContext.userId === context.userId &&
          postRefreshContext.projectId === context.projectId &&
          verifiedSession.status === 'ready' &&
          verifiedSession.user?.userId === context.userId
        );
      }

      return (
        latestSession.status === 'ready' &&
        latestSession.user?.userId === context.userId
      );
    },
    [refreshSession],
  );

  const openDeleteDialog = () => {
    if (
      !displayedProject ||
      displayedProject.myRole !== 'Owner' ||
      session.status !== 'ready' ||
      !session.user ||
      isDeleting
    ) {
      return;
    }

    const projectId = Number(params.projectId);

    if (
      !Number.isSafeInteger(projectId) ||
      projectId <= 0 ||
      displayedProject.projectId !== projectId
    ) {
      return;
    }

    activeDeleteRef.current = {
      scope: currentScope,
      userId: session.user.userId,
      projectId,
    };

    setDeleteError('');
    setPermissionNotice(null);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;

    requestSequenceRef.current += 1;
    activeDeleteRef.current = null;

    setIsDeleteDialogOpen(false);
    setDeleteError('');
  };

  const handleDeleteProject = async () => {
    if (
      !project ||
      !displayedProject ||
      isDeleting ||
      !isDeleteDialogOpen
    ) {
      return;
    }

    const context = activeDeleteRef.current;

    if (!context) {
      setIsDeleteDialogOpen(false);
      return;
    }

    // ตรวจสอบข้อมูลก่อนเริ่มคำขอ
    if (
      session.status !== 'ready' ||
      !session.user ||
      session.user.userId !== context.userId ||
      currentScope !== context.scope ||
      displayedProject.projectId !== context.projectId ||
      displayedProject.myRole !== 'Owner'
    ) {
      requestSequenceRef.current += 1;
      activeDeleteRef.current = null;
      setIsDeleteDialogOpen(false);
      setDeleteError('');
      return;
    }

    const requestId = requestSequenceRef.current + 1;
    requestSequenceRef.current = requestId;

    setIsDeleting(true);
    setDeleteError('');
    setPermissionNotice(null);

    try {
      // โหลดข้อมูล Project ล่าสุดก่อน DELETE
      const latestProject = await projectApi.getProjectById(
        context.projectId,
      );

      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      // หากข้อมูลล่าสุดไม่ใช่ Owner ห้ามส่ง DELETE
      if (
        latestProject.projectId !== context.projectId ||
        latestProject.myRole !== 'Owner'
      ) {
        activeDeleteRef.current = null;
        setIsDeleting(false);
        setIsDeleteDialogOpen(false);
        setDeleteError('');

        setLatestProjectOverride({
          scope: context.scope,
          baseProject: project,
          project: latestProject,
        });

        setPermissionNotice({
          scope: context.scope,
          message:
            'Your Owner permission has changed. You can no longer delete this project.',
        });

        // โหลด Project ใหม่เพื่ออัปเดตข้อมูลให้ตรงกัน
        retry();

        return;
      }

      // ตรวจ Session และสิทธิ์อีกครั้งก่อนส่ง DELETE
      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      await projectApi.deleteProject(context.projectId);

      if (!(await isDeleteRequestCurrent(requestId, context))) {
        return;
      }

      activeDeleteRef.current = null;
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
          activeDeleteRef.current = null;
          setIsDeleteDialogOpen(false);
          setIsDeleting(false);
          router.replace('/login');
          return;
        }

        if (error.status === 403) {
          activeDeleteRef.current = null;
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
        setIsDeleting(false);
      }
    }
  };

  const visiblePermissionNotice =
    permissionNotice?.scope === currentScope
      ? permissionNotice.message
      : '';

  if (status === 'error') {
    const canRetry = httpStatus !== 400 && httpStatus !== 404;

    return (
      <>
        {visiblePermissionNotice && (
          <div
            role="alert"
            className="mx-auto mb-4 max-w-4xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {visiblePermissionNotice}
          </div>
        )}

        <div className="mx-auto min-w-0 max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-4 sm:p-6 [overflow-wrap:anywhere]">
          <p role="alert" className="mb-4 text-[13px] text-red-600">
            {describeError(httpStatus)}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push('/projects')}
              className="min-h-11 rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px]"
            >
              Back to Projects
            </button>

            {canRetry && (
              <button
                type="button"
                onClick={retry}
                className="min-h-11 rounded-lg bg-[#222222] px-4 py-2 text-[12px] text-white"
              >
                Try again
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  if (status !== 'ready' || displayedProject === null) {
    return (
      <>
        {visiblePermissionNotice && (
          <div
            role="alert"
            className="mx-auto mb-4 max-w-4xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
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
  const isOwner = displayedProject.myRole === 'Owner';

  return (
    <>
      {visiblePermissionNotice && (
        <div
          role="alert"
          className="mx-auto mb-4 max-w-4xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {visiblePermissionNotice}
        </div>
      )}

      <div className="mx-auto min-w-0 w-full max-w-4xl [overflow-wrap:anywhere]">
        <Link
          href="/projects"
          className="mb-5 min-h-11 inline-flex items-center text-[13px] text-[#666666] hover:text-black"
        >
          ← Back to Projects
        </Link>

        <div className="rounded-2xl border border-[#e0e0e0] bg-white p-4 sm:p-6 md:p-8">
          <div className="mb-6">
            <p className="mb-2 text-[12px] text-[#777777]">
              Project details
            </p>

            <h1 className="mb-3 text-[30px] font-extrabold text-[#1f1f1f]">
              {displayedProject.projectName}
            </h1>

            <p className="whitespace-pre-wrap text-[14px] leading-6 text-[#666666]">
              {displayedProject.projectDescription ||
                'No description provided.'}
            </p>
          </div>

          <div className="grid gap-4 border-t border-[#eeeeee] pt-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-[11px] text-[#888888]">
                Start date
              </p>
              <p className="text-[13px] font-semibold">
                {formatDate(displayedProject.startDate)}
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] text-[#888888]">
                Due date
              </p>
              <p className="text-[13px] font-semibold">
                {formatDate(displayedProject.dueDate)}
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] text-[#888888]">
                Status
              </p>
              <p className="text-[13px] font-semibold">
                {displayedProject.derivedStatus}
              </p>
            </div>

            <div>
              <p className="mb-1 text-[11px] text-[#888888]">
                Your role
              </p>
              <p className="text-[13px] font-semibold">
                {displayedProject.myRole ?? '—'}
              </p>
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
              {displayedProject.completedTasks} of{' '}
              {displayedProject.totalTasks} tasks completed
            </p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3 border-t border-[#eeeeee] pt-6">
            <Link
              href={`/projects/${displayedProject.projectId}/tasks`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#222222] px-5 py-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#444444] sm:w-auto"
            >
              View Tasks →
            </Link>

            <Link
              href={`/projects/${displayedProject.projectId}/members`}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#dddddd] px-5 py-3 text-[13px] font-semibold text-[#333333] transition-colors hover:bg-[#f5f5f5] sm:w-auto"
            >
              Members
            </Link>

            {isOwner && (
              <>
                <Link
                  href={`/projects/${displayedProject.projectId}/settings`}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[#dddddd] px-5 py-3 text-[13px] font-semibold text-[#333333] transition-colors hover:bg-[#f5f5f5] sm:w-auto"
                >
                  <span className="mr-2">⚙</span>
                  Settings
                </Link>

                <button
                  type="button"
                  onClick={openDeleteDialog}
                  disabled={isDeleting}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-red-300 px-5 py-3 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  Delete Project
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmationDialog
        open={isDeleteDialogOpen}
        title="Delete Project?"
        description="Deleting this project will permanently delete all tasks in it, including their comments and assignments. All project memberships will also be deleted. This cannot be undone. Are you sure you want to continue?"
        itemName={displayedProject.projectName}
        confirmLabel="Delete Project"
        isLoading={isDeleting}
        error={deleteError}
        onCancel={closeDeleteDialog}
        onConfirm={() => void handleDeleteProject()}
      />
    </>
  );
}