'use client';

import { handleResultKeys } from '@/lib/keyboardNavigation';
import ConfirmationDialog from '@/components/ui/ConfirmationDialog';

import {
  useCallback,
  useEffect,
  useId,
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

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

function formatJoinDate(value: string | null | undefined) {
  if (!value) return '';

  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getInitials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase() || '?'
  );
}

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
  onRemoveMember: (member: ProjectMember) => Promise<void>;
}) {
  const { project, members, users } = data;

  const [searchState, setSearchState] = useState<{
    resetKey: number;
    query: string;
    isOpen: boolean;
  }>({
    resetKey: selectionResetKey,
    query: '',
    isOpen: false,
  });

  const [memberToRemove, setMemberToRemove] =
    useState<ProjectMember | null>(null);
  const memberResultsId = useId();

  const memberSearch =
    searchState.resetKey === selectionResetKey ? searchState.query : '';

  const isMemberDropdownOpen =
    searchState.resetKey === selectionResetKey &&
    searchState.isOpen &&
    !isMutating;

  const isOwner = project.myRole === 'Owner';

  const actionError = feedback?.message ?? '';
  const blockingTasks = feedback?.taskNames ?? [];

  function closeMemberPicker() {
    setSearchState({ resetKey: selectionResetKey, query: memberSearch, isOpen: false });
  }

  const availableUsers = useMemo(() => {
    const memberIds = new Set(
      members.map((member) => member.userId),
    );

    return users.filter(
      (user) => !memberIds.has(user.userId),
    );
  }, [members, users]);

  const filteredUsers = useMemo(() => {
    const query = memberSearch.trim().toLowerCase();

    if (!query) return availableUsers;

    return availableUsers.filter(
      (user) =>
        user.userName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query),
    );
  }, [availableUsers, memberSearch]);

  function handleSelectUser(rawUserId: number | string) {
    const userId = Number(rawUserId);

    if (
      !Number.isSafeInteger(userId) ||
      userId <= 0 ||
      isMutating ||
      !isOwner
    ) {
      return;
    }

    setSearchState({
      resetKey: selectionResetKey,
      query: memberSearch,
      isOpen: false,
    });

    onAddMember(userId);
  }

  async function handleConfirmRemove() {
    if (!memberToRemove || isMutating) return;

    try {
      await onRemoveMember(memberToRemove);
    } finally {
      setMemberToRemove(null);
    }
  }

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

      <div className="relative z-[1] mx-auto w-full min-w-0 max-w-4xl">
        {/* FRAMED PURPLE HEADER BANNER */}
        <div className="relative mb-6 overflow-hidden rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 py-6 sm:px-9 sm:py-7 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-white/[0.07]" />
            <div className="absolute right-8 -top-12 h-60 w-60 rounded-full bg-white/[0.08]" />
            <div className="absolute right-44 bottom-2 h-36 w-36 rounded-full bg-white/[0.06]" />

            <svg
              viewBox="0 0 900 180"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
              className="h-full w-full"
            >
              <g
                stroke="#FFFFFF"
                strokeOpacity="0.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M642 36L644.6 44.4L653 47L644.6 49.6L642 58L639.4 49.6L631 47L639.4 44.4L642 36Z"
                  strokeWidth="1.7"
                />
                <path d="M532 124V136M526 130H538" strokeWidth="1.9" />
                <path d="M746 32V42M741 37H751" strokeWidth="1.8" />
                <rect
                  x="788"
                  y="108"
                  width="14"
                  height="14"
                  rx="3.8"
                  transform="rotate(45 795 115)"
                  strokeWidth="1.8"
                />
                <g transform="translate(836 52)">
                  <rect
                    x="0"
                    y="0"
                    width="17"
                    height="17"
                    rx="4.5"
                    strokeWidth="1.8"
                  />
                  <path d="M5 8.5L7.6 11.1L12.2 6.2" strokeWidth="1.8" />
                </g>
                <circle cx="584" cy="68" r="5.5" strokeWidth="1.8" />
              </g>
            </svg>
          </div>

          <div className="relative z-[1]">
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
              <Link
                href={`/projects/${projectId}`}
                className="font-medium hover:text-white transition-colors break-words"
              >
                {project.projectName}
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <span className="font-bold text-white">Manage Members</span>
            </nav>

            <div className="flex min-w-0 items-start gap-4">
              <Link
                href={`/projects/${projectId}`}
                aria-label="Back to Project"
                className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 hover:border-white/40 transition-colors"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
              </Link>

              <div className="min-w-0">
                <h1 className="text-[26px] sm:text-[32px] font-extrabold leading-tight tracking-tight text-white">
                  Manage Members
                </h1>
                <p className="mt-1 text-[13.5px] leading-relaxed text-white/85">
                  Manage people who can access {project.projectName}.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN CARD */}
        <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 shadow-[0_4px_18px_rgba(35,25,66,0.05)] sm:p-7 md:p-8">
          {/* ADD A MEMBER SECTION (OWNER ONLY) */}
          {isOwner && (
            <section className="mb-7 rounded-2xl border border-[#dcd4fa] bg-[#f7f5fd] p-4 sm:p-5">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#d6ccf8] bg-white text-[#5B44BA]">
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
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                </span>
                <label
                  htmlFor="memberSearch"
                  className="text-[14.5px] font-extrabold text-[#1f1f1f]"
                >
                  Add a member
                </label>
              </div>

              {availableUsers.length > 0 ? (
                <>
                  <p className="mb-3 text-[12.5px] text-[#6e6b7b]">
                    Search by name or email and select the people you want to add.
                  </p>

                  <div
                    className="relative"
                    data-member-picker
                    tabIndex={-1}
                    onKeyDown={(event) => handleResultKeys(event, memberResultsId, closeMemberPicker)}
                    onBlur={(event) => {
                      if (isMemberDropdownOpen && !event.currentTarget.contains(event.relatedTarget)) closeMemberPicker();
                    }}
                  >
                    <div
                      className={`flex items-center gap-2.5 rounded-xl border bg-white px-3.5 transition-all ${
                        isMutating
                          ? 'border-[#dcd4fa] bg-[#f4f2fa] opacity-75'
                          : 'border-[#cfc9e8] focus-within:border-[#5B44BA] focus-within:ring-2 focus-within:ring-[#5B44BA]/15'
                      }`}
                    >
                      <svg
                        className="h-4 w-4 shrink-0 text-[#7c788c]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        aria-hidden="true"
                      >
                        <circle cx="11" cy="11" r="7" strokeWidth={2} />
                        <path
                          strokeLinecap="round"
                          strokeWidth={2}
                          d="m16 16 4 4"
                        />
                      </svg>

                      <input
                        aria-label="Search members"
                        aria-controls={isMemberDropdownOpen ? memberResultsId : undefined}
                        type="text"
                        disabled={isMutating}
                        value={memberSearch}
                        onFocus={() =>
                          setSearchState({
                            resetKey: selectionResetKey,
                            query: memberSearch,
                            isOpen: true,
                          })
                        }
                        onChange={(event) =>
                          setSearchState({
                            resetKey: selectionResetKey,
                            query: event.target.value,
                            isOpen: true,
                          })
                        }
                        placeholder="Search members by name or email..."
                        autoComplete="off"
                        className="min-w-0 w-full border-0 bg-transparent py-3 text-[13.5px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6] disabled:cursor-not-allowed"
                      />

                      {isMutating && !memberToRemove ? (
                        <span className="shrink-0 text-[12px] font-semibold text-[#5B44BA]">
                          Adding...
                        </span>
                      ) : (
                        memberSearch && (
                          <button
                            type="button"
                            onClick={() =>
                              setSearchState({
                                resetKey: selectionResetKey,
                                query: '',
                                isOpen: true,
                              })
                            }
                            aria-label="Clear member search"
                            className="shrink-0 min-h-9 min-w-9 text-lg leading-none text-[#8f89a6] hover:text-[#1f1f1f] cursor-pointer"
                          >
                            ×
                          </button>
                        )
                      )}
                    </div>

                    {isMemberDropdownOpen && (
                      <>
                        <button
                          type="button"
                          tabIndex={-1}
                          aria-hidden="true"
                          aria-label="Close member search results"
                          onClick={() =>
                            setSearchState({
                              resetKey: selectionResetKey,
                              query: memberSearch,
                              isOpen: false,
                            })
                          }
                          className="fixed inset-0 z-10 cursor-default"
                        />

                        <div
                          id={memberResultsId}
                          className="absolute left-0 right-0 z-20 mt-2 max-h-60 w-full overflow-y-auto overscroll-contain rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                        >
                          {filteredUsers.length === 0 ? (
                            <p className="p-3 text-[12.5px] text-[#6e6b7b]">
                              No members found.
                            </p>
                          ) : (
                            filteredUsers.map((user) => (
                              <button
                                key={user.userId}
                                type="button"
                                disabled={isMutating}
                                onClick={(event) => {
                                  event.currentTarget.closest<HTMLElement>('[data-member-picker]')?.focus();
                                  handleSelectUser(user.userId);
                                }}
                                className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#f6f3ff] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[11.5px] font-bold text-[#5B44BA]">
                                  {getInitials(user.userName)}
                                </span>

                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[13px] font-semibold text-[#1f1f1f] group-hover:text-[#5B44BA]">
                                    {user.userName}
                                  </span>
                                  <span className="block truncate text-[11.5px] text-[#6e6b7b]">
                                    {user.email}
                                  </span>
                                </span>

                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[17px] font-medium text-[#7c788c] group-hover:bg-[#ebe4ff] group-hover:text-[#5B44BA]">
                                  +
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </>
              ) : (
                <p className="mt-1 text-[13px] text-[#6e6b7b]">
                  There are no other users available to add.
                </p>
              )}
            </section>
          )}

          {/* ACTION FEEDBACK / ERROR ALERT */}
          {actionError && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-[13px] text-red-700"
            >
              <div className="flex items-start gap-2.5">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div className="min-w-0">
                  <p className="font-semibold">{actionError}</p>

                  {blockingTasks.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-1 text-[12.5px]">
                      {blockingTasks.map((taskName, index) => (
                        <li key={`${index}-${taskName}`}>{taskName}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MEMBERS LIST */}
          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[17px] font-extrabold text-[#1f1f1f]">
                  Members
                </h2>
                <span className="inline-flex items-center rounded-full border border-[#dcd4fa] bg-[#f1edff] px-2.5 py-0.5 text-[11.5px] font-bold text-[#5B44BA] tabular-nums">
                  {members.length}{' '}
                  {members.length === 1 ? 'member' : 'members'}
                </span>
              </div>
            </div>

            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#cfc9e8] bg-[#faf9fe] p-8 text-center text-[13.5px] text-[#6e6b7b]">
                No members found.
              </div>
            ) : (
              <div className="divide-y divide-[#ece8f8] overflow-hidden rounded-xl border border-[#dcd5f5] bg-white">
                {members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-[#f9f7ff] transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-3.5">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[12px] font-bold text-[#5B44BA]">
                        {getInitials(member.userName)}
                      </span>

                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-bold text-[#1f1f1f]">
                          {member.userName}
                        </p>

                        <p className="mt-0.5 break-all text-[12px] text-[#6e6b7b]">
                          {member.email}
                        </p>

                        {member.joinDate && (
                          <p className="mt-0.5 text-[11px] text-[#8f89a6]">
                            Joined {formatJoinDate(member.joinDate)}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 self-end sm:self-center">
                      <span
                        className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${
                          member.role === 'Owner'
                            ? 'bg-[#5B44BA] text-white'
                            : 'border border-[#dcd4fa] bg-[#f1edff] text-[#4c35ab]'
                        }`}
                      >
                        {member.role}
                      </span>

                      {isOwner && (
                        <button
                          type="button"
                          aria-label={`Remove ${member.userName}`}
                          onClick={() => setMemberToRemove(member)}
                          disabled={isMutating}
                          className="min-h-9 rounded-xl border border-rose-200 bg-white px-3.5 text-[12px] font-semibold text-rose-600 transition-colors hover:border-rose-300 hover:bg-rose-50 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
            <p className="mt-5 text-[12px] text-[#7c788c]">
              Only project Owners can add or remove members.
            </p>
          )}
        </div>
      </div>

      <ConfirmationDialog
        open={memberToRemove !== null}
        title="Remove member"
        itemName={memberToRemove?.userName ?? ''}
        description={`They will immediately lose access to ${project.projectName}.`}
        confirmLabel="Remove member"
        pendingLabel="Removing..."
        irreversible={false}
        isLoading={isMutating && memberToRemove !== null}
        onCancel={() => setMemberToRemove(null)}
        onConfirm={() => void handleConfirmRemove()}
      />
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
    while (activeLoadsRef.current.size > 0) {
      await Promise.allSettled([
        ...activeLoadsRef.current,
      ]);
    }

    retryRef.current();
  }, []);

  const isMutationStillCurrent = useCallback(
    async (
      requestId: number,
      requestProjectId: string,
      requestUserId: number | string,
    ): Promise<boolean> => {
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
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-[#cfc9e8] bg-white p-5 sm:p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)]">
        <p role="alert" className="mb-4 text-[13.5px] font-medium text-red-600">
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
            className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white hover:bg-[#f6f3ff] hover:text-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#333333] transition-colors cursor-pointer"
          >
            Back to Project
          </button>

          {httpStatus !== 400 &&
            httpStatus !== 403 &&
            httpStatus !== 404 && (
              <button
                type="button"
                onClick={retry}
                className="min-h-10 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-4 py-2 text-[12.5px] font-bold text-[#452ea0] hover:text-white transition-colors cursor-pointer"
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
      onRemoveMember={handleRemoveMember}
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
