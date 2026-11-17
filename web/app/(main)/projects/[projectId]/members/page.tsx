
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
import ProtectedState from '@/components/ProtectedState';

import type {
  ProjectItem,
  ProjectMember,
  UserProfile,
} from '@/types';

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

export default function ProjectMembersPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();

  const projectId = Number(params.projectId);

  const isValidProjectId =
    Number.isSafeInteger(projectId) && projectId > 0;

  const mountedRef = useRef(false);

  const [project, setProject] = useState<ProjectItem | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);

  const [status, setStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');

  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [blockingTasks, setBlockingTasks] = useState<string[]>([]);

  const [selectedUserId, setSelectedUserId] = useState('');
  const [isMutating, setIsMutating] = useState(false);

  const isOwner = project?.myRole === 'Owner';

  const loadData = useCallback(async () => {
    if (!isValidProjectId) {
      setLoadError('Invalid project ID.');
      setStatus('error');
      return;
    }

    setStatus('loading');
    setLoadError('');

    try {
      const projectData = await projectApi.getProjectById(projectId);

      const [memberData, userData] = await Promise.all([
        projectApi.getProjectMembers(projectId),
        projectData.myRole === 'Owner'
          ? projectApi.getUsers()
          : Promise.resolve([]),
      ]);

      if (!mountedRef.current) return;

      setProject(projectData);
      setMembers(memberData);
      setUsers(userData);
      setStatus('ready');
    } catch (error) {
      if (!mountedRef.current) return;

      if (
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        router.replace('/login');
        return;
      }

      setLoadError(getErrorMessage(error));
      setStatus('error');
    }
  }, [isValidProjectId, projectId, router]);

  useEffect(() => {
    mountedRef.current = true;

    void loadData();

    return () => {
      mountedRef.current = false;
    };
  }, [loadData]);

  const availableUsers = useMemo(() => {
    const memberIds = new Set(
      members.map((member) => member.userId),
    );

    return users.filter(
      (user) => !memberIds.has(user.userId),
    );
  }, [members, users]);

  async function handleAddMember() {
    const userId = Number(selectedUserId);

    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      isMutating ||
      !isOwner
    ) {
      return;
    }

    setIsMutating(true);
    setActionError('');
    setBlockingTasks([]);

    try {
      await projectApi.addProjectMember(projectId, { userId });

      setSelectedUserId('');

      // Reload members and available users after adding.
      await loadData();

      router.refresh();
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        router.replace('/login');
        return;
      }

      setActionError(getErrorMessage(error));

      // Refresh the list if the user was already added elsewhere.
      if (
        error instanceof ApiRequestError &&
        error.details?.some(
          (detail) => detail.reason === 'ALREADY_MEMBER',
        )
      ) {
        await loadData();
      }
    } finally {
      setIsMutating(false);
    }
  }

  async function handleRemoveMember(member: ProjectMember) {
    if (isMutating || !isOwner) return;

    const confirmed = window.confirm(
      `Remove ${member.userName} from this project?`,
    );

    if (!confirmed) return;

    setIsMutating(true);
    setActionError('');
    setBlockingTasks([]);

    try {
      await projectApi.removeProjectMember(
        projectId,
        member.userId,
      );

      await loadData();

      router.refresh();
    } catch (error) {
      if (
        error instanceof ApiRequestError &&
        error.status === 401
      ) {
        router.replace('/login');
        return;
      }

      const result = getRemovalError(error);

      setActionError(result.message);
      setBlockingTasks(result.taskNames);

      // Refresh membership state after a failed removal.
      await loadData();
    } finally {
      setIsMutating(false);
    }
  }

  if (status === 'error') {
    return (
      <div className="mx-auto w-full max-w-4xl rounded-xl border border-[#e0e0e0] bg-white p-5">
        <p role="alert" className="mb-4 text-sm text-red-600">
          {loadError}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="min-h-11 rounded-lg border border-[#dddddd] px-4 text-sm"
          >
            Back to Project
          </button>

          <button
            type="button"
            onClick={() => void loadData()}
            className="min-h-11 rounded-lg bg-[#222222] px-4 text-sm text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (status !== 'ready' || !project) {
    return (
      <ProtectedState
        status="loading"
        onRetry={() => void loadData()}
      />
    );
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
                    setSelectedUserId(event.target.value)
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
                  onClick={handleAddMember}
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
                {blockingTasks.map((taskName) => (
                  <li key={taskName}>{taskName}</li>
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
                        onClick={() => void handleRemoveMember(member)}
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
