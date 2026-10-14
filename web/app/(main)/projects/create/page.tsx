
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getCurrentUser } from '@/lib/authService';
import { projectApi } from '@/lib/projectApi';
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

  const [projectName, setProjectName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const [users, setUsers] = useState<User[]>([]);
  const [memberIds, setMemberIds] = useState<number[]>([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [isMemberDropdownOpen, setIsMemberDropdownOpen] =
    useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // รีเซ็ตข้อมูลฟอร์มทั้งหมด
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

      // กำหนดวันที่ใน Browser หลัง Component ทำงานแล้ว
      setStartDate(getBangkokToday());

      try {
        const currentUser = await getCurrentUser();

        if (!active) return;

        if (!currentUser) {
          router.replace('/login');
          return;
        }

        const availableUsers = await projectApi.getUsers();

        if (!active) return;

        setUsers(
          availableUsers.filter(
            (user) =>
              String(user.userId) !== String(currentUser.userId),
          ),
        );
      } catch (error) {
        console.error('Failed to initialize project form:', error);

        if (active) {
          const requestError = error as RequestError;

          if (requestError.status === 401) {
            router.replace('/login');
            return;
          }

          setErrors({
            general:
              requestError.message ||
              'Unable to load members. Please refresh and try again.',
          });
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      active = false;
    };
  }, [router]);

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

    if (dueDate && startDate && dueDate <= startDate) {
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
        dueDate: dueDate || null,
        memberIds,
      });

      // ล้างข้อมูลหลังสร้าง Project สำเร็จ
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
        router.replace('/login');
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

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] w-full items-center justify-center">
        <p className="text-[13px] text-[#888888]">
          Loading project form...
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <p className="mb-1 text-[13px] font-medium text-[#777777]">
          Create a new project
        </p>

        <h1 className="mb-2 text-[32px] font-extrabold text-[#111111]">
          Start your project
        </h1>

        <p className="text-[14px] text-[#666666]">
          Add the basics and invite members now. You can add tasks next.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 md:gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="min-w-0 rounded-2xl border border-[#e0e0e0] bg-white p-6 shadow-sm md:p-8"
        >
          {errors.general && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3.5 text-[13px] text-red-700"
            >
              <span aria-hidden="true" className="font-bold">
                !
              </span>
              <p>{errors.general}</p>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-[18px] font-bold text-[#111111]">
              Project details
            </h2>
            <p className="mt-1 text-[13px] text-[#777777]">
              Enter the basics to get started.
            </p>
          </div>

          {/* PROJECT NAME */}
          <div className="mb-5">
            <label
              htmlFor="projectName"
              className="mb-2 block text-[13px] font-semibold text-[#333333]"
            >
              Project name <span className="text-red-500">*</span>
            </label>

            <input
              id="projectName"
              type="text"
              maxLength={150}
              required
              value={projectName}
              onChange={(event) => {
                setProjectName(event.target.value);
                clearFieldError('projectName');
              }}
              placeholder="e.g. Web Programming"
              className={`w-full rounded-xl border px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#555555] ${
                errors.projectName
                  ? 'border-red-500 bg-red-50 focus:border-red-500'
                  : 'border-[#dcdcdc]'
              }`}
              aria-invalid={Boolean(errors.projectName)}
              aria-describedby={
                errors.projectName ? 'projectName-error' : undefined
              }
            />

            <div className="mt-1.5 flex justify-between gap-3">
              {errors.projectName ? (
                <p
                  id="projectName-error"
                  role="alert"
                  className="text-[12px] text-red-600"
                >
                  {errors.projectName}
                </p>
              ) : (
                <span />
              )}

              <span className="text-[11px] text-[#999999]">
                {projectName.length}/150
              </span>
            </div>
          </div>

          {/* DESCRIPTION */}
          <div className="mb-5">
            <label
              htmlFor="description"
              className="mb-2 block text-[13px] font-semibold text-[#333333]"
            >
              Project description
            </label>

            <textarea
              id="description"
              rows={4}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                clearFieldError('general');
              }}
              placeholder="Briefly describe the project goal or scope"
              className="w-full resize-y rounded-xl border border-[#dcdcdc] px-4 py-3 text-[13px] outline-none transition-colors focus:border-[#555555]"
            />
          </div>

          {/* DATES */}
          <div className="mb-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="mb-2 block text-[13px] font-semibold text-[#333333]"
              >
                Start date <span className="text-red-500">*</span>
              </label>

              <input
                id="startDate"
                type="date"
                required
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value);
                  clearFieldError('startDate');
                  clearFieldError('dueDate');
                }}
                className={`w-full rounded-xl border px-4 py-3 text-[13px] text-[#333333] outline-none transition-colors focus:border-[#555555] ${
                  errors.startDate
                    ? 'border-red-500 bg-red-50 focus:border-red-500'
                    : 'border-[#dcdcdc]'
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
                  className="mt-1.5 text-[12px] text-red-600"
                >
                  {errors.startDate}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="dueDate"
                className="mb-2 block text-[13px] font-semibold text-[#333333]"
              >
                End date
              </label>

              <input
                id="dueDate"
                type="date"
                min={startDate ? getTomorrow(startDate) : undefined}
                value={dueDate}
                onChange={(event) => {
                  setDueDate(event.target.value);
                  clearFieldError('dueDate');
                }}
                className={`w-full rounded-xl border px-4 py-3 text-[13px] text-[#333333] outline-none transition-colors focus:border-[#555555] ${
                  errors.dueDate
                    ? 'border-red-500 bg-red-50 focus:border-red-500'
                    : 'border-[#dcdcdc]'
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
                  className="mt-1.5 text-[12px] text-red-600"
                >
                  {errors.dueDate}
                </p>
              )}
            </div>
          </div>

          {/* PROJECT MEMBERS */}
          <div className="mb-8">
            <label
              htmlFor="memberSearch"
              className="mb-2 block text-[13px] font-semibold text-[#333333]"
            >
              Project members
            </label>

            <p className="mb-2 text-[12px] text-[#777777]">
              Search by name or email and select the people you want to add.
            </p>

            {memberIds.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {memberIds.map((memberId) => {
                  const member = users.find(
                    (user) => Number(user.userId) === memberId,
                  );

                  if (!member) return null;

                  return (
                    <span
                      key={member.userId}
                      className="inline-flex items-center gap-2 rounded-full border border-[#e0e0e0] bg-[#f7f7f7] py-1.5 pl-3 pr-2 text-[12px] text-[#333333]"
                    >
                      {member.userName}

                      <button
                        type="button"
                        aria-label={`Remove ${member.userName}`}
                        onClick={() => toggleMember(Number(member.userId))}
                        className="flex h-5 w-5 items-center justify-center rounded-full text-[#777777] transition-colors hover:bg-[#e5e5e5] hover:text-[#111111]"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl border border-[#dcdcdc] bg-white px-3.5 transition-colors focus-within:border-[#555555]">
                <svg
                  className="h-4 w-4 shrink-0 text-[#888888]"
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
                  id="memberSearch"
                  type="text"
                  value={memberSearch}
                  onFocus={() => setIsMemberDropdownOpen(true)}
                  onChange={(event) => {
                    setMemberSearch(event.target.value);
                    setIsMemberDropdownOpen(true);
                    clearFieldError('members');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setIsMemberDropdownOpen(false);
                    }
                  }}
                  placeholder="Search members by name or email..."
                  autoComplete="off"
                  className="w-full border-0 bg-transparent py-3 text-[13px] text-[#222222] outline-none placeholder:text-[#888888]"
                />

                {memberSearch && (
                  <button
                    type="button"
                    onClick={() => setMemberSearch('')}
                    aria-label="Clear member search"
                    className="text-lg leading-none text-[#888888] hover:text-[#222222]"
                  >
                    ×
                  </button>
                )}
              </div>

              {isMemberDropdownOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close member search results"
                    onClick={() => setIsMemberDropdownOpen(false)}
                    className="fixed inset-0 z-10 cursor-default"
                  />

                  <div
                    id="member-search-results"
                    className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-[#e0e0e0] bg-white p-2 shadow-lg"
                  >
                    {filteredUsers.length === 0 ? (
                      <p className="p-3 text-[12px] text-[#777777]">
                        {users.length === 0
                          ? 'No other members available to select.'
                          : 'No members found.'}
                      </p>
                    ) : (
                      filteredUsers.map((user) => (
                        <button
                          key={user.userId}
                          type="button"
                          onClick={() => {
                            toggleMember(Number(user.userId));
                            setMemberSearch('');
                            setIsMemberDropdownOpen(true);
                          }}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-[#f5f5f5]"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[11px] font-semibold text-[#555555]">
                            {user.userName
                              .split(' ')
                              .filter(Boolean)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join('')
                              .toUpperCase()}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-[#222222]">
                              {user.userName}
                            </span>
                            <span className="block truncate text-[11px] text-[#888888]">
                              {user.email}
                            </span>
                          </span>

                          <span className="text-lg text-[#777777]">+</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            {errors.members && (
              <p role="alert" className="mt-2 text-[12px] text-red-600">
                {errors.members}
              </p>
            )}

            <p className="mt-2 text-[11px] text-[#888888]">
              The project creator is automatically added as Owner.
            </p>
          </div>

          {/* FORM ACTIONS */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={() => {
                resetForm();
                router.push('/projects');
              }}
              className="rounded-xl border border-[#dcdcdc] bg-white px-6 py-2.5 text-[13px] font-semibold text-[#333333] transition-colors hover:bg-[#f4f4f4] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-xl bg-[#2a2a2a] px-6 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#111111] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Creating...' : 'Create project'}
            </button>
          </div>
        </form>

        {/* RIGHT COLUMN */}
        <aside className="w-full rounded-2xl border border-[#e0e0e0] bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-[16px] font-bold text-[#111111]">
            What happens next
          </h2>

          <p className="mb-6 text-[12px] text-[#777777]">
            Next, you can:
          </p>

          <div className="space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[12px] font-bold text-[#444444]">
                1
              </div>
              <div>
                <strong className="block text-[13px] font-bold text-[#222222]">
                  Add tasks
                </strong>
                <p className="mt-0.5 text-[12px] text-[#777777]">
                  Break work into steps
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[12px] font-bold text-[#444444]">
                2
              </div>
              <div>
                <strong className="block text-[13px] font-bold text-[#222222]">
                  Assign work
                </strong>
                <p className="mt-0.5 text-[12px] text-[#777777]">
                  Assign each task
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f0f0f0] text-[12px] font-bold text-[#444444]">
                3
              </div>
              <div>
                <strong className="block text-[13px] font-bold text-[#222222]">
                  View priorities
                </strong>
                <p className="mt-0.5 text-[12px] text-[#777777]">
                  Start with the top priority
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
