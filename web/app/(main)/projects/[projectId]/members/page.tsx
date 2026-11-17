'use client';

import {
  useCallback,
  useEffect,
  useMemo,
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

import type {
  ProjectItem,
  ProjectMember,
  UserProfile,
} from '@/types';

type MembersData = {
  project: ProjectItem;
  members: ProjectMember[];
  users: UserProfile[];
};

type MembersFeedback = {
  scope: string;
  message: string;
  taskNames: string[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return 'Your session has expired. Please log in again.';
    }

    if (error.status === 403) {
      return 'You do not have permission to perform this action.';
    }

    if (error.status === 404) {
      return 'The project or member could not be found.';
    }

    return error.message;
  }

  return 'Something went wrong. Please try again.';
}

function getRemovalError(error: unknown) {
  if (!(error instanceof ApiRequestError)) {
    return {
      message: getErrorMessage(error),
      taskNames: [] as string[],
    };
  }

  const details = error.details ?? [];

  const reasons = new Set(
    details.map((detail) => detail.reason).filter(Boolean),
  );

  const taskNames = [
    ...new Set(
      details
        .filter((detail) => detail.reason === 'SOLE_ASSIGNEE')
        .map((detail) => detail.taskTitle)
        .filter((title): title is string => Boolean(title)),
    ),
  ];

  if (reasons.has('LAST_OWNER')) {
    return {
      message:
        'This member cannot be removed because the project must have at least one Owner.',
      taskNames,
    };
  }

  if (reasons.has('SOLE_ASSIGNEE')) {
    return {
      message:
        'This member cannot be removed because they are the only assignee of the following tasks.',
      taskNames,
    };
  }

  return {
    message: error.message,
    taskNames,
  };
}

function ProjectMembersContent({
  projectId,
  data,
  isMutating,
  selectionResetKey,
  feedback,
  onAddMember,
  onRemoveMember,
}: {
  projectId: number;
  data: MembersData;
  isMutating: boolean;
  selectionResetKey: number;
  feedback: MembersFeedback | null;
  onAddMember: (userId: number) => void;
  onRemoveMember: (member: ProjectMember) => void;
}) {
  const { project, members, users } = data;

  const [selection, setSelection] = useState<{
    resetKey: number;
    userId: string;
  }>({
    resetKey: selectionResetKey,
    userId: '',
  });

  const selectedUserId =
    selection.resetKey === selectionResetKey ? selection.userId : '';

  const isOwner = project.myRole === 'Owner';

  const actionError = feedback?.message ?? '';
  const blockingTasks = feedback?.taskNames ?? [];

  const availableUsers = useMemo(() => {
    const memberIds = new Set(
      members.map((member) => member.userId),
    );

    return users.filter(
      (user) => !memberIds.has(user.userId),
    );
  }, [members, users]);

  function handleAddClick() {
    const userId = Number(selectedUserId);

    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      isMutating ||
      !isOwner
    ) {
      return;
    }

    onAddMember(userId);
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-4xl [overflow-wrap:anywhere]">
      <Link
        href={`/projects/${projectId}`}
        className="mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black"
      >
        ← Back to Project
      </Link>

      <div className="rounded-2xl border border-[#e0e0e0] bg-white p-4 sm:p-6 md:p-8">
        <div className="mb-6">
          <p className="mb-2 text-[12px] text-[#777777]">
            Project members
          </p>

          <h1 className="text-2xl font-extrabold text-[#1f1f1f]">
            {project.projectName}
          </h1>

          <p className="mt-2 text-sm text-[#777777]">
            Manage people who can access this project.
          </p>
        </div>

        {isOwner && (
          <section className="mb-7 rounded-xl border border-[#eeeeee] bg-[#fafafa] p-4">
            <h2 className="mb-3 text-sm font-bold text-[#222222]">
              Add a member
            </h2>

            {availableUsers.length > 0 ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedUserId}
                  onChange={(event) =>
                    setSelection({
                      resetKey: selectionResetKey,
                      userId: event.target.value,
                    })
                  }
                  disabled={isMutating}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-[#dddddd] bg-white px-3 text-sm outline-none focus:border-[#777777] disabled:bg-[#f5f5f5]"
                >
                  <option value="">Select a user</option>

                  {availableUsers.map((user) => (
                    <option
                      key={user.userId}
                      value={user.userId}
                    >
                      {user.userName} ({user.email})
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={handleAddClick}
                  disabled={!selectedUserId || isMutating}
                  className="min-h-11 rounded-lg bg-[#222222] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isMutating ? 'Please wait...' : 'Add member'}
                </button>
              </div>
            ) : (
              <p className="text-sm text-[#777777]">
                There are no other users available to add.
              </p>
            )}
          </section>
        )}

        {actionError && (
          <div
            role="alert"
            className="mb-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            <p>{actionError}</p>

            {blockingTasks.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1">
                {blockingTasks.map((taskName, index) => (
                  <li key={`${index}-${taskName}`}>{taskName}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-[#222222]">
              Members
            </h2>

            <span className="text-xs text-[#777777]">
              {members.length}{' '}
              {members.length === 1 ? 'member' : 'members'}
            </span>
          </div>

          {members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#dddddd] p-6 text-center text-sm text-[#777777]">
              No members found.
            </div>
          ) : (
            <div className="divide-y divide-[#eeeeee] rounded-xl border border-[#eeeeee]">
              {members.map((member) => (
                <div
                  key={member.userId}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#222222]">
                      {member.userName}
                    </p>

                    <p className="mt-1 break-all text-xs text-[#777777]">
                      {member.email}
                    </p>

                    <p className="mt-1 text-[11px] text-[#999999]">
                      Joined {member.joinDate}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        member.role === 'Owner'
                          ? 'bg-[#222222] text-white'
                          : 'bg-[#eeeeee] text-[#555555]'
                      }`}
                    >
                      {member.role}
                    </span>

                    {isOwner && (
                      <button
                        type="button"
                        onClick={() => onRemoveMember(member)}
                        disabled={isMutating}
                        className="min-h-10 rounded-lg border border-[#e5baba] px-3 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {!isOwner && (
          <p className="mt-5 text-xs text-[#888888]">
            Only project Owners can add or remove members.
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectMembersLoader({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const { session, getLatestSession, refreshSession } = useSession();

  const [feedback, setFeedback] = useState<MembersFeedback | null>(null);
  const [mutatingScope, setMutatingScope] = useState<string | null>(null);
  const [selectionResetKey, setSelectionResetKey] = useState(0);

  const activeLoadsRef = useRef<Set<Promise<MembersData>>>(
    new Set(),
  );

  const currentScope = `${String(session.user?.userId ?? '')}:${projectId}`;

  const mountedRef = useRef(false);
  const projectIdRef = useRef(projectId);
  const mutationSequenceRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  const load = useCallback((): Promise<MembersData> => {
    const request = (async (): Promise<MembersData> => {
      const parsedProjectId = Number(projectId);

      if (
        !Number.isSafeInteger(parsedProjectId) ||
        parsedProjectId <= 0
      ) {
        throw new ApiRequestError('Invalid project ID.', 400);
      }

      const project = await projectApi.getProjectById(parsedProjectId);

      const [members, users] = await Promise.all([
        projectApi.getProjectMembers(parsedProjectId),
        project.myRole === 'Owner'
          ? projectApi.getUsers()
          : Promise.resolve([]),
      ]);

      return {
        project,
        members,
        users,
      };
    })();

    activeLoadsRef.current.add(request);

    void request.then(
      () => activeLoadsRef.current.delete(request),
      () => activeLoadsRef.current.delete(request),
    );

    return request;
  }, [projectId]);

  const {
    status,
    data,
    httpStatus,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: true,
  });

  const retryRef = useRef(retry);

  useEffect(() => {
    retryRef.current = retry;
  }, [retry]);

  const refreshAfterMutation = useCallback(async () => {
    // รอ request ที่เริ่มจาก focus หรือการโหลดก่อนหน้าจบทั้งหมด
    while (activeLoadsRef.current.size > 0) {
      await Promise.allSettled([
        ...activeLoadsRef.current,
      ]);
    }

    // โหลดข้อมูลใหม่หลัง request เก่าจบแล้ว
    retryRef.current();
  }, []);

  const isMutationStillCurrent = useCallback(
    async (
      requestId: number,
      requestProjectId: string,
      requestUserId: number | string,
    ): Promise<boolean> => {
      // ตรวจ route และคำขอก่อน เพราะช่วง session loading ค่า userId จะว่างชั่วคราว
      if (
        !mountedRef.current ||
        mutationSequenceRef.current !== requestId ||
        projectIdRef.current !== requestProjectId
      ) {
        return false;
      }

      let resolvedSession = getLatestSession();

      if (resolvedSession.status === 'loading') {
        await refreshSession();

        if (
          !mountedRef.current ||
          mutationSequenceRef.current !== requestId ||
          projectIdRef.current !== requestProjectId
        ) {
          return false;
        }

        resolvedSession = getLatestSession();
      }

      return (
        resolvedSession.status === 'ready' &&
        resolvedSession.user?.userId === requestUserId
      );
    },
    [getLatestSession, refreshSession],
  );

  const handleAddMember = useCallback(
    async (userId: number) => {
      const parsedProjectId = Number(projectId);

      if (
        !Number.isSafeInteger(parsedProjectId) ||
        parsedProjectId <= 0 ||
        mutatingScope === currentScope ||
        session.status !== 'ready' ||
        !session.user
      ) {
        return;
      }

      const requestUserId = session.user.userId;
      const requestProjectId = projectId;
      const requestScope = currentScope;
      const requestId = mutationSequenceRef.current + 1;

      mutationSequenceRef.current = requestId;
      setMutatingScope(requestScope);
      setFeedback(null);

      try {
        await projectApi.addProjectMember(parsedProjectId, { userId });

        const isCurrent = await isMutationStillCurrent(
          requestId,
          requestProjectId,
          requestUserId,
        );

        if (!isCurrent) {
          return;
        }

        setSelectionResetKey((value) => value + 1);
        await refreshAfterMutation();
      } catch (error) {
        const isCurrent = await isMutationStillCurrent(
          requestId,
          requestProjectId,
          requestUserId,
        );

        if (!isCurrent) {
          return;
        }

        if (
          error instanceof ApiRequestError &&
          error.status === 401
        ) {
          router.replace('/login');
          return;
        }

        setFeedback({
          scope: requestScope,
          message: getErrorMessage(error),
          taskNames: [],
        });

        if (
          error instanceof ApiRequestError &&
          error.details?.some(
            (detail) => detail.reason === 'ALREADY_MEMBER',
          )
        ) {
          await refreshAfterMutation();
        }
      } finally {
        if (
          mountedRef.current &&
          mutationSequenceRef.current === requestId
        ) {
          setMutatingScope((current) =>
            current === requestScope ? null : current,
          );
        }
      }
    },
    [
      currentScope,
      isMutationStillCurrent,
      mutatingScope,
      projectId,
      refreshAfterMutation,
      router,
      session.status,
      session.user,
    ],
  );

  const handleRemoveMember = useCallback(
    async (member: ProjectMember) => {
      const parsedProjectId = Number(projectId);

      if (
        !Number.isSafeInteger(parsedProjectId) ||
        parsedProjectId <= 0 ||
        mutatingScope === currentScope ||
        session.status !== 'ready' ||
        !session.user
      ) {
        return;
      }

      const confirmed = window.confirm(
        `Remove ${member.userName} from this project?`,
      );

      if (!confirmed) return;

      const requestUserId = session.user.userId;
      const requestProjectId = projectId;
      const requestScope = currentScope;
      const requestId = mutationSequenceRef.current + 1;

      mutationSequenceRef.current = requestId;
      setMutatingScope(requestScope);
      setFeedback(null);

      try {
        await projectApi.removeProjectMember(
          parsedProjectId,
          member.userId,
        );

        const isCurrent = await isMutationStillCurrent(
          requestId,
          requestProjectId,
          requestUserId,
        );

        if (!isCurrent) {
          return;
        }

        await refreshAfterMutation();
      } catch (error) {
        const isCurrent = await isMutationStillCurrent(
          requestId,
          requestProjectId,
          requestUserId,
        );

        if (!isCurrent) {
          return;
        }

        if (
          error instanceof ApiRequestError &&
          error.status === 401
        ) {
          router.replace('/login');
          return;
        }

        const result = getRemovalError(error);

        setFeedback({
          scope: requestScope,
          message: result.message,
          taskNames: result.taskNames,
        });

        await refreshAfterMutation();
      } finally {
        if (
          mountedRef.current &&
          mutationSequenceRef.current === requestId
        ) {
          setMutatingScope((current) =>
            current === requestScope ? null : current,
          );
        }
      }
    },
    [
      currentScope,
      isMutationStillCurrent,
      mutatingScope,
      projectId,
      refreshAfterMutation,
      router,
      session.status,
      session.user,
    ],
  );

  const visibleFeedback =
    feedback?.scope === currentScope ? feedback : null;

  const isMutating = mutatingScope === currentScope;

  if (status === 'error') {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-xl border border-[#e0e0e0] bg-white p-5">
        <p role="alert" className="mb-4 text-sm text-red-600">
          {httpStatus === 400
            ? 'Invalid project ID.'
            : httpStatus === 403
              ? 'You do not have permission to view this project.'
              : httpStatus === 404
                ? 'Project not found.'
                : 'Unable to load project members. Please try again.'}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="min-h-11 rounded-lg border border-[#dddddd] px-4 text-sm"
          >
            Back to Project
          </button>

          {httpStatus !== 400 &&
            httpStatus !== 403 &&
            httpStatus !== 404 && (
              <button
                type="button"
                onClick={retry}
                className="min-h-11 rounded-lg bg-[#222222] px-4 text-sm text-white"
              >
                Try again
              </button>
            )}
        </div>
      </div>
    );
  }

  if (status !== 'ready' || data === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  return (
    <ProjectMembersContent
      key={currentScope}
      projectId={Number(projectId)}
      data={data}
      isMutating={isMutating}
      selectionResetKey={selectionResetKey}
      feedback={visibleFeedback}
      onAddMember={(userId) => void handleAddMember(userId)}
      onRemoveMember={(member) => void handleRemoveMember(member)}
    />
  );
}

export default function ProjectMembersPage() {
  const params = useParams<{ projectId: string }>();

  return (
    <ProjectMembersLoader
      key={params.projectId}
      projectId={params.projectId}
    />
  );
}