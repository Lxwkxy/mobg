'use client';

import { handleResultKeys } from '@/lib/keyboardNavigation';

import { useEffect, useId, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedState from '@/components/ProtectedState';
import { getCurrentUser } from '@/lib/authService';
import { projectApi } from '@/lib/projectApi';
import { useSession } from '@/lib/SessionProvider';
import type { User } from '@/types';

type FormErrors = {
  projectName?: string;
  startDate?: string;
  dueDate?: string;
  members?: string;
  general?: string;
};

type ServerFieldError = {
  field?: string;
  message?: string;
};

type RequestError = Error & {
  status?: number;
  code?: string;
  details?: ServerFieldError[];
  isNetworkError?: boolean;
};

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

function getBangkokToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getTomorrow(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

function mapServerField(field: string): keyof FormErrors | null {
  const normalized = field
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  switch (normalized) {
    case 'projectname':
    case 'name':
      return 'projectName';

    case 'startdate':
      return 'startDate';

    case 'duedate':
    case 'enddate':
      return 'dueDate';

    case 'memberids':
    case 'members':
      return 'members';

    default:
      return null;
  }
}

export default function CreateProjectPage() {
  const router = useRouter();
  const { clearSession, replaceSession } = useSession();

  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const memberSearchId = useId();
  const memberResultsId = useId();
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] =
    useState(false);

  const [authStatus, setAuthStatus] = useState<
    'loading' | 'ready' | 'login-required'
  >('loading');
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  function resetForm() {
    setProjectName('');
    setDescription('');
    setStartDate(getBangkokToday());
    setDueDate('');
    setMemberIds([]);
    setMemberSearch('');
    setIsMemberDropdownOpen(false);
    setErrors({});
  }

  useEffect(() => {
    let active = true;

    async function initialize() {
      if (!active) return;

      setStartDate(getBangkokToday());

      try {
        const currentUser = await getCurrentUser();

        if (!active) return;

        if (!currentUser) {
          clearSession();
          setAuthStatus('login-required');
          return;
        }

        replaceSession(currentUser, 'ready');

        const availableUsers = await projectApi.getUsers();

        if (!active) return;

        setUsers(
          availableUsers.filter(
            (user) =>
              String(user.userId) !== String(currentUser.userId),
          ),
        );
        setAuthStatus('ready');
      } catch (error) {
        console.error('Failed to initialize project form:', error);

        if (active) {
          const requestError = error as RequestError;

          if (requestError.status === 401) {
            clearSession();
            setAuthStatus('login-required');
            return;
          }

          setErrors({
            general:
              requestError.message ||
              'Unable to load members. Please refresh and try again.',
          });
          setAuthStatus('ready');
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [clearSession, replaceSession]);

  function toggleMember(userId: number) {
    setMemberIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );

    setErrors((current) => {
      const next = { ...current };
      delete next.members;
      delete next.general;
      return next;
    });
  }

  function clearFieldError(field: keyof FormErrors) {
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.general;
      return next;
    });
  }

  const filteredUsers = users.filter((user) => {
    const query = memberSearch.trim().toLowerCase();

    return (
      !memberIds.includes(Number(user.userId)) &&
      (user.userName.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query))
    );
  });

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (isSaving) return;

    const nextErrors: FormErrors = {};
    const trimmedName = projectName.trim();

    if (!trimmedName) {
      nextErrors.projectName = 'Please enter a project name.';
    } else if (trimmedName.length > 150) {
      nextErrors.projectName =
        'Project name must not exceed 150 characters.';
    }

    if (!startDate) {
      nextErrors.startDate = 'Please select a start date.';
    }

    if (!dueDate) {
      nextErrors.dueDate = 'Please select an end date.';
    } else if (startDate && dueDate <= startDate) {
      nextErrors.dueDate =
        'End date must be later than the start date.';
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      await projectApi.createProject({
        projectName: trimmedName,
        projectDescription: description.trim() || null,
        startDate,
        dueDate,
        memberIds,
      });

      resetForm();
      router.push('/projects');
    } catch (error) {
      console.error('Failed to create project:', error);

      const requestError = error as RequestError;
      const nextServerErrors: FormErrors = {};

      for (const detail of requestError.details ?? []) {
        if (!detail.field || !detail.message) continue;

        const mappedField = mapServerField(detail.field);

        if (mappedField) {
          nextServerErrors[mappedField] = detail.message;
        }
      }

      if (requestError.status === 401) {
        clearSession();
        setAuthStatus('login-required');
        return;
      }

      if (requestError.status === 403) {
        nextServerErrors.general =
          'You do not have permission to create a project.';
      } else if (Object.keys(nextServerErrors).length > 0) {
        nextServerErrors.general =
          requestError.message ||
          'Please check the highlighted fields and try again.';
      } else {
        nextServerErrors.general =
          requestError.message ||
          'Unable to create project. Please try again.';
      }

      setErrors(nextServerErrors);
    } finally {
      setIsSaving(false);
    }
  }

  if (authStatus !== 'ready') {
    return (
      <ProtectedState
        status={authStatus}
        onRetry={() => window.location.reload()}
      />
    );
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

      <div className="relative z-[1] mx-auto min-w-0 w-full max-w-6xl">
        {/* PURPLE HEADER BANNER */}
        <div className="relative mb-6 overflow-hidden rounded-[26px] bg-gradient-to-r from-[#755FD9] via-[#7F68E2] to-[#8C76E8] px-6 py-6 sm:px-9 sm:py-7 shadow-[0_10px_28px_rgba(91,68,186,0.18)]">
          {/* Decorative soft circles */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-12 -bottom-20 h-56 w-56 rounded-full bg-white/[0.07]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-8 -top-12 h-60 w-60 rounded-full bg-white/[0.08]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-44 bottom-2 h-36 w-36 rounded-full bg-white/[0.06]"
          />

          {/* Decorative vector doodles */}
          <svg
            aria-hidden="true"
            viewBox="0 0 1152 180"
            fill="none"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <path
              d="M320 185 C420 115, 545 135, 650 76 C755 18, 885 48, 1015 -15"
              stroke="#FFFFFF"
              strokeOpacity="0.09"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <g
              stroke="#FFFFFF"
              strokeOpacity="0.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d="M420 32L422.4 39.6L430 42L422.4 44.4L420 52L417.6 44.4L410 42L417.6 39.6L420 32Z"
                strokeWidth="1.7"
              />
              <path
                d="M846 38L848.6 46.4L857 49L848.6 51.6L846 60L843.4 51.6L835 49L843.4 46.4L846 38Z"
                strokeWidth="1.7"
              />
              <path d="M554 26V38M548 32H560" strokeWidth="1.9" />
              <path d="M936 126V138M930 132H942" strokeWidth="1.9" />
              <rect
                x="662"
                y="96"
                width="13"
                height="13"
                rx="3.5"
                transform="rotate(45 668.5 102.5)"
                strokeWidth="1.8"
              />
              <g transform="translate(1032 46)">
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
              <circle cx="764" cy="54" r="5" strokeWidth="1.8" />
            </g>
            <g fill="#FFFFFF" fillOpacity="0.24">
              <circle cx="486" cy="128" r="2.3" />
              <circle cx="495" cy="123" r="2.3" />
              <circle cx="994" cy="76" r="2.3" />
            </g>
          </svg>

          <div className="relative z-[1]">
            {/* BREADCRUMB */}
            <nav
              aria-label="Breadcrumb"
              className="mb-3.5 flex flex-wrap items-center gap-1.5 text-[13px] text-white/80"
            >
              <Link
                href="/projects"
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                  }
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`font-medium hover:text-white transition-colors ${
                  isSaving ? 'pointer-events-none opacity-60' : ''
                }`}
              >
                Projects
              </Link>
              <span aria-hidden="true" className="text-white/55">
                &gt;
              </span>
              <span className="font-bold text-white">
                Create Project
              </span>
            </nav>

            {/* BACK BUTTON + TITLE */}
            <div className="flex min-w-0 items-start gap-4">
              <Link
                href="/projects"
                aria-label="Back to Projects"
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                  }
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 hover:border-white/40 transition-colors ${
                  isSaving ? 'pointer-events-none opacity-50' : ''
                }`}
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
                  Start your project
                </h1>

                <p className="mt-1 text-[13.5px] sm:text-[14px] text-white/85">
                  Add the basics and invite members now. You can add tasks next.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN 2-COLUMN LAYOUT */}
        <div className="grid grid-cols-1 items-start gap-6 md:gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
          {/* LEFT COLUMN: FORM CARD */}
          <form
            onSubmit={handleSubmit}
            noValidate
            className="min-w-0 rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 shadow-[0_6px_24px_rgba(35,25,66,0.06)] sm:p-7 md:p-8"
          >
            {errors.general && (
              <div
                role="alert"
                className="mb-6 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="min-w-0">{errors.general}</p>
              </div>
            )}

            {/* SECTION HEADER */}
            <div className="mb-6 flex items-center gap-3 border-b border-[#ece8f8] pb-4">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[#5B44BA]">
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
                  <line x1="12" y1="11" x2="12" y2="17" />
                  <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
              </span>

              <div>
                <h2 className="text-[17px] font-extrabold text-[#1f1f1f]">
                  Project details
                </h2>
                <p className="text-[12.5px] text-[#6e6b7b]">
                  Enter the basics to get started.
                </p>
              </div>
            </div>

            {/* PROJECT NAME */}
            <div className="mb-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <label
                  htmlFor="projectName"
                  className="block text-[13px] font-bold text-[#2b2838]"
                >
                  Project name <span className="text-rose-500">*</span>
                </label>

                <span className="shrink-0 text-[11.5px] font-medium text-[#8f89a6] tabular-nums">
                  {projectName.length}/150
                </span>
              </div>

              <input
                id="projectName"
                type="text"
                maxLength={150}
                required
                disabled={isSaving}
                value={projectName}
                onChange={(event) => {
                  setProjectName(event.target.value);
                  clearFieldError('projectName');
                }}
                placeholder="e.g. Web Programming"
                className={`min-h-11 w-full rounded-xl border px-4 py-2.5 text-[13.5px] text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                  errors.projectName
                    ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                    : 'border-[#cfc9e8] bg-[#f8f6fe] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15'
                }`}
                aria-invalid={Boolean(errors.projectName)}
                aria-describedby={
                  errors.projectName ? 'projectName-error' : undefined
                }
              />

              {errors.projectName && (
                <p
                  id="projectName-error"
                  role="alert"
                  className="mt-1.5 text-[12px] font-medium text-rose-600"
                >
                  {errors.projectName}
                </p>
              )}
            </div>

            {/* DESCRIPTION */}
            <div className="mb-5">
              <label
                htmlFor="description"
                className="mb-2 block text-[13px] font-bold text-[#2b2838]"
              >
                Project description
              </label>

              <textarea
                id="description"
                rows={4}
                disabled={isSaving}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  clearFieldError('general');
                }}
                placeholder="Briefly describe the project goal or scope"
                className="w-full resize-y rounded-xl border border-[#cfc9e8] bg-[#f8f6fe] px-4 py-3 text-[13.5px] leading-relaxed text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15 disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c]"
              />
            </div>

            {/* DATES SECTION */}
            <div className="mb-6 rounded-xl border border-[#e2dcf5] bg-[#f7f5fd]/80 p-4 sm:p-5">
              <div className="mb-3.5 flex items-center gap-2 text-[12.5px] font-bold text-[#4c35ab]">
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
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span>Project Schedule</span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 [&>div]:min-w-0">
                <div>
                  <label
                    htmlFor="startDate"
                    className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                  >
                    Start date <span className="text-rose-500">*</span>
                  </label>

                  <input
                    id="startDate"
                    type="date"
                    required
                    disabled={isSaving}
                    value={startDate}
                    onChange={(event) => {
                      setStartDate(event.target.value);
                      clearFieldError('startDate');
                      clearFieldError('dueDate');
                    }}
                    className={`min-h-11 min-w-0 max-w-full w-full rounded-xl border px-3.5 py-2 text-base sm:text-[13.5px] text-[#1f1f1f] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                      errors.startDate
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                        : 'border-[#cfc9e8] bg-white focus:border-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/15'
                    }`}
                    aria-invalid={Boolean(errors.startDate)}
                    aria-describedby={
                      errors.startDate ? 'startDate-error' : undefined
                    }
                  />

                  {errors.startDate && (
                    <p
                      id="startDate-error"
                      role="alert"
                      className="mt-1.5 text-[12px] font-medium text-rose-600"
                    >
                      {errors.startDate}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="dueDate"
                    className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                  >
                    End date <span className="text-rose-500">*</span>
                  </label>

                  <input
                    id="dueDate"
                    type="date"
                    required
                    disabled={isSaving}
                    min={startDate ? getTomorrow(startDate) : undefined}
                    value={dueDate}
                    onChange={(event) => {
                      setDueDate(event.target.value);
                      clearFieldError('dueDate');
                    }}
                    className={`min-h-11 min-w-0 max-w-full w-full rounded-xl border px-3.5 py-2 text-base sm:text-[13.5px] text-[#1f1f1f] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                      errors.dueDate
                        ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                        : 'border-[#cfc9e8] bg-white focus:border-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/15'
                    }`}
                    aria-invalid={Boolean(errors.dueDate)}
                    aria-describedby={
                      errors.dueDate ? 'dueDate-error' : undefined
                    }
                  />

                  {errors.dueDate && (
                    <p
                      id="dueDate-error"
                      role="alert"
                      className="mt-1.5 text-[12px] font-medium text-rose-600"
                    >
                      {errors.dueDate}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* PROJECT MEMBERS */}
            <div className="mb-7">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                  htmlFor={memberSearchId}
                  className="block text-[13px] font-bold text-[#2b2838]"
                >
                  Project members
                </label>

                {memberIds.length > 0 && (
                  <span className="rounded-full border border-[#cfc5f7] bg-[#f3f0ff] px-2.5 py-0.5 text-[11px] font-bold text-[#5B44BA] tabular-nums">
                    {memberIds.length} selected
                  </span>
                )}
              </div>

              <p className="mb-3 text-[12.5px] text-[#6e6b7b]">
                Search by name or email and select the people you want to add.
              </p>

              {/* SELECTED MEMBER CHIPS */}
              {memberIds.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {memberIds.map((memberId) => {
                    const member = users.find(
                      (user) => Number(user.userId) === memberId,
                    );

                    if (!member) return null;

                    const initials = member.userName
                      .split(' ')
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase();

                    return (
                      <span
                        key={member.userId}
                        className="min-w-0 max-w-full inline-flex items-center gap-2 rounded-full border border-[#cfc5f7] bg-[#f3f0ff] py-1 pl-1.5 pr-2 text-[12.5px] font-semibold text-[#3f2b96] shadow-[0_1px_3px_rgba(91,68,186,0.06)]"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#5B44BA] text-[10px] font-bold text-white">
                          {initials}
                        </span>

                        <span className="min-w-0 truncate">{member.userName}</span>

                        <button
                          type="button"
                          disabled={isSaving}
                          aria-label={`Remove ${member.userName}`}
                          onClick={() => toggleMember(Number(member.userId))}
                          className="shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full text-[#6a57b8] transition-colors hover:bg-[#ded4ff] hover:text-[#35208a] cursor-pointer disabled:pointer-events-none disabled:opacity-50"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* SEARCH INPUT & DROPDOWN */}
              <div
                className="relative"
                data-member-picker
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing && isMemberDropdownOpen && !isSaving && event.target instanceof HTMLInputElement) {
                    event.preventDefault();
                    return;
                  }
                  handleResultKeys(event, memberResultsId, () => setIsMemberDropdownOpen(false));
                }}
                onBlur={(event) => {
                  if (isMemberDropdownOpen && !isSaving && !event.currentTarget.contains(event.relatedTarget)) setIsMemberDropdownOpen(false);
                }}
              >
                <div
                  className={`flex min-h-11 items-center gap-2.5 rounded-xl border px-3.5 transition-all ${
                    errors.members
                      ? 'border-rose-400 bg-rose-50/40 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/15'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] focus-within:border-[#5B44BA] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#5B44BA]/15'
                  }`}
                >
                  <svg
                    className="h-4 w-4 shrink-0 text-[#7d7696]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <circle cx="11" cy="11" r="7" strokeWidth={2.1} />
                    <path
                      strokeLinecap="round"
                      strokeWidth={2.1}
                      d="m16 16 4 4"
                    />
                  </svg>

                  <input
                    id={memberSearchId}
                    aria-controls={isMemberDropdownOpen && !isSaving ? memberResultsId : undefined}
                    type="text"
                    disabled={isSaving}
                    value={memberSearch}
                    onFocus={() => setIsMemberDropdownOpen(true)}
                    onChange={(event) => {
                      setMemberSearch(event.target.value);
                      setIsMemberDropdownOpen(true);
                      clearFieldError('members');
                    }}
                    placeholder="Search members by name or email..."
                    autoComplete="off"
                    className="min-w-0 w-full border-0 bg-transparent py-2.5 text-base sm:text-[13.5px] text-[#1f1f1f] outline-none placeholder:text-[#8f89a6] disabled:cursor-not-allowed"
                  />

                  {memberSearch && (
                    <button
                      type="button"
                      onClick={() => setMemberSearch('')}
                      aria-label="Clear member search"
                      className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full text-[#7d7696] hover:bg-[#ece8fa] hover:text-[#5B44BA] transition-colors cursor-pointer"
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
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>

                {isMemberDropdownOpen && !isSaving && (
                  <>
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-hidden="true"
                      aria-label="Close member search results"
                      onClick={() => setIsMemberDropdownOpen(false)}
                      className="fixed inset-0 z-10 cursor-default"
                    />

                    <div
                      id={memberResultsId}
                      className="absolute z-20 mt-2 max-h-64 w-full overflow-y-auto overscroll-contain rounded-2xl border border-[#cfc9e8] bg-white p-1.5 shadow-[0_12px_30px_rgba(52,37,112,0.14)]"
                    >
                      {filteredUsers.length === 0 ? (
                        <p className="px-3.5 py-4 text-center text-[12.5px] text-[#7d7696]">
                          {users.length === 0
                            ? 'No other members available to select.'
                            : 'No members found.'}
                        </p>
                      ) : (
                        filteredUsers.map((user) => (
                          <button
                            key={user.userId}
                            type="button"
                            onClick={(event) => {
                              event.currentTarget.closest('[data-member-picker]')?.querySelector('input')?.focus();
                              toggleMember(Number(user.userId));
                              setMemberSearch('');
                              setIsMemberDropdownOpen(true);
                            }}
                            className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#f6f3ff] cursor-pointer"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#dcd4fa] bg-[#f1edff] text-[11.5px] font-bold text-[#5B44BA] group-hover:bg-[#5B44BA] group-hover:border-[#5B44BA] group-hover:text-white transition-colors">
                              {user.userName
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join('')
                                .toUpperCase()}
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-semibold text-[#1f1f1f] group-hover:text-[#5B44BA] transition-colors">
                                {user.userName}
                              </span>
                              <span className="block truncate text-[11.5px] text-[#7d7696]">
                                {user.email}
                              </span>
                            </span>

                            <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#dcd4fa] bg-[#f8f6fe] text-[#5B44BA] group-hover:bg-[#5B44BA] group-hover:border-[#5B44BA] group-hover:text-white transition-colors">
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
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </>
                )}
              </div>

              {errors.members && (
                <p
                  role="alert"
                  className="mt-2 text-[12px] font-medium text-rose-600"
                >
                  {errors.members}
                </p>
              )}

              <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-[#7d7696]">
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
                  className="shrink-0 text-[#5B44BA]"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span>
                  The project creator is automatically added as Owner.
                </span>
              </p>
            </div>

            {/* FORM ACTIONS */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3 border-t border-[#ece8f8] pt-6">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  resetForm();
                  router.push('/projects');
                }}
                className="min-h-11 rounded-xl border border-[#cfc9e8] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-[#5B44BA] px-6 py-2.5 text-[13.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.28)] transition-all hover:bg-[#4934a3] hover:shadow-[0_6px_20px_rgba(91,68,186,0.36)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isSaving && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="animate-spin"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                )}
                <span>{isSaving ? 'Creating...' : 'Create project'}</span>
              </button>
            </div>
          </form>

          {/* RIGHT COLUMN: WHAT HAPPENS NEXT */}
          <aside className="w-full rounded-2xl border border-[#cfc9e8] bg-white/95 p-6 shadow-[0_6px_24px_rgba(35,25,66,0.06)]">
            <div className="mb-5 border-b border-[#ece8f8] pb-4">
              <h2 className="text-[16px] font-extrabold text-[#1f1f1f]">
                What happens next
              </h2>

              <p className="mt-1 text-[12.5px] text-[#6e6b7b]">
                Next, you can:
              </p>
            </div>

            <div className="space-y-5">
              <div className="flex items-start gap-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[12.5px] font-extrabold text-[#5B44BA]">
                  1
                </div>
                <div className="pt-0.5">
                  <strong className="block text-[13.5px] font-bold text-[#1f1f1f]">
                    Add tasks
                  </strong>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#6e6b7b]">
                    Break work into steps
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[12.5px] font-extrabold text-[#5B44BA]">
                  2
                </div>
                <div className="pt-0.5">
                  <strong className="block text-[13.5px] font-bold text-[#1f1f1f]">
                    Assign work
                  </strong>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#6e6b7b]">
                    Assign each task
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-[#dcd4fa] bg-[#f1edff] text-[12.5px] font-extrabold text-[#5B44BA]">
                  3
                </div>
                <div className="pt-0.5">
                  <strong className="block text-[13.5px] font-bold text-[#1f1f1f]">
                    View priorities
                  </strong>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-[#6e6b7b]">
                    Start with the top priority
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
