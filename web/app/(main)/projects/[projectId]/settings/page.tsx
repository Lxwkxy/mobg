'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type RefObject,
} from 'react';
import Link from 'next/link';
import { notFound, useParams, useRouter } from 'next/navigation';

import {
  ApiRequestError,
  projectApi,
} from '@/lib/projectApi';
import { parseRouteId, tryParseRouteId } from '@/lib/taskApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import { useSession } from '@/lib/SessionProvider';
import ProtectedState from '@/components/ProtectedState';

import type {
  ProjectItem,
  UpdateProjectRequest,
} from '@/types';

type ProjectForm = {
  projectName: string;
  projectDescription: string;
  startDate: string;
  dueDate: string;
};

type FieldErrors = Partial<Record<keyof ProjectForm, string>>;

type StoredProjectDraft = {
  baseline: ProjectForm;
  form: ProjectForm;
};

type SaveListener = () => void;

const WORKSPACE_PATTERN_BG = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='%235B44BA' stroke-opacity='0.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M24 18V30M18 24H30' stroke-width='1.7'/%3E%3Crect x='76' y='14' width='10' height='10' rx='2.5' transform='rotate(45 81 19)' stroke-width='1.6'/%3E%3Ccircle cx='122' cy='30' r='5' stroke-width='1.6'/%3E%3Cg transform='translate(14 70)'%3E%3Crect x='0' y='0' width='15' height='15' rx='4' stroke-width='1.6'/%3E%3Cpath d='M4.5 7.5L6.8 9.8L10.8 5.5' stroke-width='1.6'/%3E%3C/g%3E%3Cpath d='M70 58L72.2 64.8L79 67L72.2 69.2L70 76L67.8 69.2L61 67L67.8 64.8L70 58Z' stroke-width='1.5'/%3E%3Crect x='110' y='78' width='16' height='7' rx='3.5' transform='rotate(-28 118 81.5)' stroke-width='1.6'/%3E%3Cpath d='M82 113V123M77 118H87' stroke-width='1.7'/%3E%3C/g%3E%3Cg fill='%235B44BA' fill-opacity='0.1'%3E%3Ccircle cx='28' cy='118' r='2'/%3E%3Ccircle cx='36' cy='114' r='2'/%3E%3Ccircle cx='35' cy='123' r='2'/%3E%3Ccircle cx='124' cy='122' r='2.2'/%3E%3C/g%3E%3C/svg%3E")`;

const projectSaveLocks = new Map<string, symbol>();
const projectSaveListeners = new Map<string, Set<SaveListener>>();

function isProjectSavePending(key: string) {
  return key !== '' && projectSaveLocks.has(key);
}

function subscribeProjectSave(
  key: string,
  listener: SaveListener,
) {
  if (!key) {
    return () => {};
  }

  let listeners = projectSaveListeners.get(key);

  if (!listeners) {
    listeners = new Set();
    projectSaveListeners.set(key, listeners);
  }

  listeners.add(listener);

  return () => {
    listeners?.delete(listener);

    if (listeners?.size === 0) {
      projectSaveListeners.delete(key);
    }
  };
}

function notifyProjectSave(key: string) {
  projectSaveListeners.get(key)?.forEach((listener) => listener());
}

function acquireProjectSave(key: string) {
  if (!key || projectSaveLocks.has(key)) {
    return null;
  }

  const token = Symbol(key);
  projectSaveLocks.set(key, token);
  notifyProjectSave(key);

  return token;
}

function releaseProjectSave(key: string, token: symbol) {
  if (projectSaveLocks.get(key) !== token) {
    return;
  }

  projectSaveLocks.delete(key);
  notifyProjectSave(key);
}

function getDateInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function getNextDate(value: string) {
  if (!value) return undefined;

  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + 1);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function describeError(status: number | undefined) {
  if (status === 403) return 'You do not have permission to view this project.';
  return 'Unable to load project settings. Please try again.';
}

function createProjectForm(project: ProjectItem): ProjectForm {
  return {
    projectName: project.projectName ?? '',
    projectDescription: project.projectDescription ?? '',
    startDate: getDateInputValue(project.startDate),
    dueDate: getDateInputValue(project.dueDate),
  };
}

function isProjectForm(value: unknown): value is ProjectForm {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const form = value as Record<string, unknown>;

  return (
    typeof form.projectName === 'string' &&
    typeof form.projectDescription === 'string' &&
    typeof form.startDate === 'string' &&
    typeof form.dueDate === 'string'
  );
}

function readStoredDraft(
  key: string,
  initialForm: ProjectForm,
): StoredProjectDraft {
  if (typeof window === 'undefined' || !key) {
    return {
      baseline: initialForm,
      form: initialForm,
    };
  }

  try {
    const raw = window.sessionStorage.getItem(key);

    if (!raw) {
      return {
        baseline: initialForm,
        form: initialForm,
      };
    }

    const parsed: unknown = JSON.parse(raw);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !('baseline' in parsed) ||
      !('form' in parsed) ||
      !isProjectForm(parsed.baseline) ||
      !isProjectForm(parsed.form)
    ) {
      window.sessionStorage.removeItem(key);

      return {
        baseline: initialForm,
        form: initialForm,
      };
    }

    return {
      baseline: parsed.baseline,
      form: parsed.form,
    };
  } catch {
    return {
      baseline: initialForm,
      form: initialForm,
    };
  }
}

function removeStoredDraft(key: string) {
  if (typeof window === 'undefined' || !key) return;

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // ไม่ให้ปัญหา sessionStorage ขัดขวางการทำงานของหน้า
  }
}

function mergeProjectForm(
  currentForm: ProjectForm,
  previousBaseline: ProjectForm,
  latestForm: ProjectForm,
): ProjectForm {
  return {
    projectName:
      currentForm.projectName.trim() ===
      previousBaseline.projectName.trim()
        ? latestForm.projectName
        : currentForm.projectName,

    projectDescription:
      currentForm.projectDescription.trim() ===
      previousBaseline.projectDescription.trim()
        ? latestForm.projectDescription
        : currentForm.projectDescription,

    startDate:
      currentForm.startDate === previousBaseline.startDate
        ? latestForm.startDate
        : currentForm.startDate,

    dueDate:
      currentForm.dueDate === previousBaseline.dueDate
        ? latestForm.dueDate
        : currentForm.dueDate,
  };
}

function SettingsBannerHeader({
  project,
  disabled = false,
  onNavigateBack,
}: {
  project: ProjectItem;
  disabled?: boolean;
  onNavigateBack?: () => void;
}) {
  return (
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
              if (disabled) {
                event.preventDefault();
                return;
              }
              onNavigateBack?.();
            }}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            className={`font-medium hover:text-white transition-colors ${
              disabled ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            Projects
          </Link>
          <span aria-hidden="true" className="text-white/55">
            &gt;
          </span>
          <Link
            href={`/projects/${project.projectId}`}
            onClick={(event) => {
              if (disabled) {
                event.preventDefault();
                return;
              }
              onNavigateBack?.();
            }}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            className={`font-medium hover:text-white transition-colors break-words ${
              disabled ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            {project.projectName}
          </Link>
          <span aria-hidden="true" className="text-white/55">
            &gt;
          </span>
          <span className="font-bold text-white">
            Project Settings
          </span>
        </nav>

        {/* BACK BUTTON + TITLE */}
        <div className="flex min-w-0 items-start gap-4">
          <Link
            href={`/projects/${project.projectId}`}
            aria-label="Back to Project"
            onClick={(event) => {
              if (disabled) {
                event.preventDefault();
                return;
              }
              onNavigateBack?.();
            }}
            aria-disabled={disabled}
            tabIndex={disabled ? -1 : undefined}
            className={`mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white hover:bg-white/25 hover:border-white/40 transition-colors ${
              disabled ? 'pointer-events-none opacity-50' : ''
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
              Project Settings
            </h1>
            <p className="mt-1 text-[13.5px] sm:text-[14px] text-white/85">
              Update your project information and dates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsForm({
  project,
  ownerUserId,
  draftKey,
  activeLoaderTokenRef,
}: {
  project: ProjectItem;
  ownerUserId: number | string;
  draftKey: string;
  activeLoaderTokenRef: RefObject<object | null>;
}) {
  const router = useRouter();
  const {
    session,
    getLatestSession,
    refreshSession,
  } = useSession();

  const [storedDraft] = useState<StoredProjectDraft>(() =>
    readStoredDraft(draftKey, createProjectForm(project)),
  );

  const [baseline, setBaseline] = useState<ProjectForm>(
    () => storedDraft.baseline,
  );

  const [form, setForm] = useState<ProjectForm>(
    () => storedDraft.form,
  );

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState('');

  const subscribeSave = useCallback(
    (listener: SaveListener) => subscribeProjectSave(draftKey, listener),
    [draftKey],
  );

  const getSaveSnapshot = useCallback(
    () => isProjectSavePending(draftKey),
    [draftKey],
  );

  const isSaving = useSyncExternalStore(
    subscribeSave,
    getSaveSnapshot,
    () => false,
  );

  const baselineRef = useRef(baseline);
  const mountedRef = useRef(false);
  const isDiscardedRef = useRef(false);

  const discardDraft = useCallback(() => {
    isDiscardedRef.current = true;
    removeStoredDraft(draftKey);
    setForm(baselineRef.current);
    setFieldErrors({});
    setSaveError('');
  }, [draftKey]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      removeStoredDraft(draftKey);
    };
  }, [draftKey]);

  useEffect(() => {
    const latestForm = createProjectForm(project);
    const previousBaseline = baselineRef.current;

    baselineRef.current = latestForm;

    startTransition(() => {
      if (isDiscardedRef.current) {
        setForm(latestForm);
        setBaseline(latestForm);
        return;
      }

      setForm((currentForm) =>
        mergeProjectForm(
          currentForm,
          previousBaseline,
          latestForm,
        ),
      );

      setBaseline(latestForm);
    });
  }, [project]);

  useEffect(() => {
    if (isDiscardedRef.current) {
      return;
    }

    if (project.myRole !== 'Owner') {
      removeStoredDraft(draftKey);
      return;
    }

    const latestSession = getLatestSession();

    if (
      latestSession.status === 'ready' &&
      latestSession.user?.userId !== ownerUserId
    ) {
      return;
    }

    try {
      window.sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          baseline,
          form,
        } satisfies StoredProjectDraft),
      );
    } catch {
      // ฟอร์มยังใช้งานได้ แม้ browser ไม่อนุญาตให้เก็บ sessionStorage
    }
  }, [
    baseline,
    draftKey,
    form,
    getLatestSession,
    ownerUserId,
    project.myRole,
    session.status,
    session.user?.userId,
  ]);

  const verifyStillCurrentOwnerAndPage = useCallback(
    async (
      requestUserId: number | string,
      requestLoaderToken: object | null,
    ): Promise<boolean> => {
      if (
        requestLoaderToken === null ||
        activeLoaderTokenRef.current !== requestLoaderToken
      ) {
        return false;
      }

      let currentSession = getLatestSession();

      if (currentSession.status === 'loading') {
        await refreshSession();

        if (activeLoaderTokenRef.current !== requestLoaderToken) {
          return false;
        }

        currentSession = getLatestSession();
      }

      return (
        currentSession.status === 'ready' &&
        currentSession.user?.userId === requestUserId
      );
    },
    [activeLoaderTokenRef, getLatestSession, refreshSession],
  );

  function updateField<K extends keyof ProjectForm>(
    field: K,
    value: ProjectForm[K],
  ) {
    isDiscardedRef.current = false;

    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));

    setSaveError('');
  }

  function validateForm(): boolean {
    const errors: FieldErrors = {};

    const name = form.projectName.trim();

    if (!name) {
      errors.projectName = 'Project name is required.';
    } else if (name.length > 150) {
      errors.projectName = 'Project name must not exceed 150 characters.';
    }

    if (!form.startDate) {
      errors.startDate = 'Start date is required.';
    }

    if (
      form.startDate &&
      form.dueDate &&
      form.dueDate <= form.startDate
    ) {
      errors.dueDate = 'Due date must be later than the start date.';
    }

    setFieldErrors(errors);

    return Object.keys(errors).length === 0;
  }

  function buildUpdateInput(): UpdateProjectRequest {
    const input: UpdateProjectRequest = {};

    const nextName = form.projectName.trim();
    const nextDescription = form.projectDescription.trim();
    const nextDueDate = form.dueDate || null;

    if (nextName !== baseline.projectName.trim()) {
      input.projectName = nextName;
    }

    if (
      nextDescription !== baseline.projectDescription.trim()
    ) {
      input.projectDescription = nextDescription || null;
    }

    if (form.startDate !== baseline.startDate) {
      input.startDate = form.startDate;
    }

    if (nextDueDate !== (baseline.dueDate || null)) {
      input.dueDate = nextDueDate;
    }

    return input;
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      project.myRole !== 'Owner' ||
      isProjectSavePending(draftKey) ||
      session.status !== 'ready' ||
      !session.user ||
      session.user.userId !== ownerUserId
    ) {
      return;
    }

    setSaveError('');

    if (!validateForm()) {
      return;
    }

    const input = buildUpdateInput();

    if (Object.keys(input).length === 0) {
      setSaveError('No changes to save.');
      return;
    }

    const requestUserId = session.user.userId;
    const requestProjectId = project.projectId;
    const requestDraftKey = draftKey;
    const requestLoaderToken = activeLoaderTokenRef.current;
    const submittedForm = form;
    const submittedBaseline = baseline;

    const saveToken = acquireProjectSave(requestDraftKey);

    if (!saveToken) {
      return;
    }

    try {
      const updatedProject = await projectApi.updateProject(
        requestProjectId,
        input,
      );

      const isStillCurrent = await verifyStillCurrentOwnerAndPage(
        requestUserId,
        requestLoaderToken,
      );

      if (!isStillCurrent) {
        return;
      }

      const latestBaseline = createProjectForm(updatedProject);

      const nextForm = mergeProjectForm(
        submittedForm,
        submittedBaseline,
        latestBaseline,
      );

      const hasUnsavedChanges =
        nextForm.projectName.trim() !==
          latestBaseline.projectName.trim() ||
        nextForm.projectDescription.trim() !==
          latestBaseline.projectDescription.trim() ||
        nextForm.startDate !== latestBaseline.startDate ||
        (nextForm.dueDate || null) !==
          (latestBaseline.dueDate || null);

      if (hasUnsavedChanges) {
        try {
          window.sessionStorage.setItem(
            requestDraftKey,
            JSON.stringify({
              baseline: latestBaseline,
              form: nextForm,
            } satisfies StoredProjectDraft),
          );
        } catch {
          // ไม่ให้ปัญหา sessionStorage ขัดขวางการทำงานของหน้า
        }
      } else {
        isDiscardedRef.current = true;
        removeStoredDraft(requestDraftKey);
      }

      if (mountedRef.current) {
        baselineRef.current = latestBaseline;
        setBaseline(latestBaseline);
        setForm(nextForm);
      }

      router.push(`/projects/${requestProjectId}`);
      router.refresh();
    } catch (error) {
      const isStillCurrent = await verifyStillCurrentOwnerAndPage(
        requestUserId,
        requestLoaderToken,
      );

      if (!isStillCurrent || !mountedRef.current) {
        return;
      }

      if (error instanceof ApiRequestError) {
        if (error.status === 401) {
          router.replace('/login');
          return;
        }

        const nextErrors: FieldErrors = {};

        error.details?.forEach((detail) => {
          if (
            detail.field === 'projectName' ||
            detail.field === 'startDate' ||
            detail.field === 'dueDate' ||
            detail.field === 'projectDescription'
          ) {
            nextErrors[detail.field] =
              detail.message ?? 'Invalid value.';
          }
        });

        if (Object.keys(nextErrors).length > 0) {
          setFieldErrors(nextErrors);
        } else if (error.status === 403) {
          setSaveError(
            'Only the project Owner can update project settings.',
          );
        } else {
          setSaveError(error.message);
        }
      } else {
        setSaveError('Something went wrong. Please try again.');
      }
    } finally {
      releaseProjectSave(requestDraftKey, saveToken);
    }
  }

  const isOwner = project.myRole === 'Owner';

  if (!isOwner) {
    return (
      <div className="relative min-w-0 pb-10 [overflow-wrap:anywhere]">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage: WORKSPACE_PATTERN_BG,
            backgroundRepeat: 'repeat',
            backgroundSize: '140px 140px',
          }}
        />

        <div className="relative z-[1] mx-auto w-full max-w-3xl">
          <SettingsBannerHeader project={project} />

          <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-6 sm:p-8 shadow-[0_6px_24px_rgba(35,25,66,0.06)]">
            <div className="flex flex-col items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 sm:flex-row sm:items-center">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-600">
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
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>

              <div>
                <p className="text-[15px] font-bold text-[#1f1f1f]">
                  Owner permission required
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-[#5a5470]">
                  Only the project Owner can edit these settings.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Link
                href={`/projects/${project.projectId}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-[#b5a3f7] bg-[#e2d9ff] hover:bg-[#5B44BA] hover:border-[#5B44BA] px-5 py-2 text-[13px] font-bold text-[#452ea0] hover:text-white transition-all"
              >
                <span aria-hidden="true">←</span>
                <span>Back to Project</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
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

      <div className="relative z-[1] mx-auto w-full max-w-3xl">
        {/* PURPLE HEADER BANNER */}
        <SettingsBannerHeader
          project={project}
          disabled={isSaving}
          onNavigateBack={discardDraft}
        />

        {/* MAIN SETTINGS FORM CARD */}
        <div className="rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 sm:p-8 shadow-[0_6px_24px_rgba(35,25,66,0.06)]">
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
              </svg>
            </span>
            <div>
              <h2 className="text-[17px] font-extrabold text-[#1f1f1f]">
                General Information
              </h2>
              <p className="text-[12.5px] text-[#6e6b7b]">
                Configure your project title, summary, and timeline
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="space-y-5">
              {/* PROJECT NAME */}
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label
                    htmlFor="projectName"
                    className="block text-[13px] font-bold text-[#2b2838]"
                  >
                    Project name <span className="text-rose-500">*</span>
                  </label>
                  <span className="text-[11.5px] font-medium text-[#8f89a6] tabular-nums">
                    {form.projectName.length}/150
                  </span>
                </div>

                <input
                  id="projectName"
                  type="text"
                  maxLength={150}
                  value={form.projectName}
                  onChange={(event) =>
                    updateField('projectName', event.target.value)
                  }
                  disabled={isSaving}
                  className={`min-h-11 w-full rounded-xl border px-4 py-2.5 text-[13.5px] text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                    fieldErrors.projectName
                      ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15'
                  }`}
                  placeholder="Enter project name"
                  aria-invalid={Boolean(fieldErrors.projectName)}
                  aria-describedby={
                    fieldErrors.projectName
                      ? 'projectName-error'
                      : undefined
                  }
                />

                {fieldErrors.projectName && (
                  <p
                    id="projectName-error"
                    className="mt-1.5 text-[12px] font-medium text-rose-600"
                  >
                    {fieldErrors.projectName}
                  </p>
                )}
              </div>

              {/* DESCRIPTION */}
              <div>
                <label
                  htmlFor="projectDescription"
                  className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                >
                  Description
                </label>

                <textarea
                  id="projectDescription"
                  rows={4}
                  value={form.projectDescription}
                  onChange={(event) =>
                    updateField('projectDescription', event.target.value)
                  }
                  disabled={isSaving}
                  className={`w-full resize-y rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed text-[#1f1f1f] placeholder:text-[#8f89a6] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                    fieldErrors.projectDescription
                      ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                      : 'border-[#cfc9e8] bg-[#f8f6fe] focus:border-[#5B44BA] focus:bg-white focus:ring-2 focus:ring-[#5B44BA]/15'
                  }`}
                  placeholder="Describe your project goals, scope, or key deliverables"
                  aria-invalid={Boolean(fieldErrors.projectDescription)}
                />

                {fieldErrors.projectDescription && (
                  <p className="mt-1.5 text-[12px] font-medium text-rose-600">
                    {fieldErrors.projectDescription}
                  </p>
                )}
              </div>

              {/* DATES SECTION */}
              <div className="rounded-xl border border-[#e2dcf5] bg-[#f7f5fd]/80 p-4 sm:p-5">
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

                <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
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
                      value={form.startDate}
                      onChange={(event) =>
                        updateField('startDate', event.target.value)
                      }
                      disabled={isSaving}
                      className={`min-h-11 w-full rounded-xl border px-3.5 py-2 text-[13.5px] text-[#1f1f1f] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                        fieldErrors.startDate
                          ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                          : 'border-[#cfc9e8] bg-white focus:border-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/15'
                      }`}
                      aria-invalid={Boolean(fieldErrors.startDate)}
                    />

                    {fieldErrors.startDate && (
                      <p className="mt-1.5 text-[12px] font-medium text-rose-600">
                        {fieldErrors.startDate}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="dueDate"
                      className="mb-2 block text-[13px] font-bold text-[#2b2838]"
                    >
                      Due date
                    </label>

                    <input
                      id="dueDate"
                      type="date"
                      min={getNextDate(form.startDate)}
                      value={form.dueDate}
                      onChange={(event) =>
                        updateField('dueDate', event.target.value)
                      }
                      disabled={isSaving}
                      className={`min-h-11 w-full rounded-xl border px-3.5 py-2 text-[13.5px] text-[#1f1f1f] outline-none transition-all disabled:cursor-not-allowed disabled:bg-[#f2f0f7] disabled:text-[#8c889c] ${
                        fieldErrors.dueDate
                          ? 'border-rose-400 bg-rose-50/40 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/15'
                          : 'border-[#cfc9e8] bg-white focus:border-[#5B44BA] focus:ring-2 focus:ring-[#5B44BA]/15'
                      }`}
                      aria-invalid={Boolean(fieldErrors.dueDate)}
                    />

                    {fieldErrors.dueDate && (
                      <p className="mt-1.5 text-[12px] font-medium text-rose-600">
                        {fieldErrors.dueDate}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {saveError && (
              <div
                role="alert"
                className="mt-5 flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-600"
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
                  className="shrink-0"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{saveError}</span>
              </div>
            )}

            {/* FOOTER ACTIONS */}
            <div className="mt-7 flex flex-wrap items-center justify-end gap-3 border-t border-[#ece8f8] pt-6">
              <Link
                href={`/projects/${project.projectId}`}
                onClick={(event) => {
                  if (isSaving) {
                    event.preventDefault();
                    return;
                  }

                  discardDraft();
                }}
                aria-disabled={isSaving}
                tabIndex={isSaving ? -1 : undefined}
                className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-[#cfc9e8] bg-white px-5 py-2.5 text-[13.5px] font-semibold text-[#4a465c] transition-colors hover:border-[#9e8ce6] hover:bg-[#f6f3ff] hover:text-[#5B44BA] ${
                  isSaving ? 'pointer-events-none opacity-50' : ''
                }`}
              >
                Cancel
              </Link>

              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#5B44BA] px-6 py-2.5 text-[13.5px] font-bold text-white shadow-[0_4px_14px_rgba(91,68,186,0.28)] transition-all hover:bg-[#4934a3] hover:shadow-[0_6px_20px_rgba(91,68,186,0.36)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
                <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function ProjectSettingsLoader({
  projectId,
}: {
  projectId: string;
}) {
  const router = useRouter();
  const { session } = useSession();
  const activeLoaderTokenRef = useRef<object | null>(null);

  const isInvalidId = tryParseRouteId(projectId, 'project ID') === null;

  useEffect(() => {
    activeLoaderTokenRef.current = {};

    return () => {
      activeLoaderTokenRef.current = null;
    };
  }, []);

  const load = useCallback(async () => {
    const parsedProjectId = parseRouteId(projectId, 'project ID');
    return projectApi.getProjectById(parsedProjectId);
  }, [projectId]);

  const {
    status,
    data: project,
    retained,
    retainedUserId,
    httpStatus,
    retry,
  } = useProtectedLoad(load, {
    revalidateOnFocus: true,
    hideDataWhileRefreshing: true,
  });

  const isNotFound =
    isInvalidId ||
    (status === 'error' && (httpStatus === 400 || httpStatus === 404));

  useEffect(() => {
    if (isNotFound) {
      notFound();
    }
  }, [isNotFound]);

  const showContent =
    status === 'ready' &&
    project !== null;

  const retainedProject = retained ?? project;

  const hasRetainedProject =
    retainedProject !== null &&
    retainedUserId !== null;

  const draftKey =
    hasRetainedProject && retainedProject
      ? `mobg:project-settings:${retainedUserId}:${retainedProject.projectId}`
      : '';

  useEffect(() => {
    if (
      status === 'ready' &&
      project !== null &&
      project.myRole !== 'Owner' &&
      retainedUserId !== null
    ) {
      removeStoredDraft(
        `mobg:project-settings:${retainedUserId}:${project.projectId}`,
      );
    }
  }, [project, retainedUserId, status]);

  const isRetainedUserCurrent =
    retainedUserId !== null &&
    (session.status !== 'ready' ||
      session.user?.userId === retainedUserId);

  if (isNotFound) {
    return null;
  }

  if (status === 'error') {
    const canRetry = httpStatus !== 403;

    return (
      <div className="relative min-w-0 pb-10 [overflow-wrap:anywhere]">
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            backgroundImage: WORKSPACE_PATTERN_BG,
            backgroundRepeat: 'repeat',
            backgroundSize: '140px 140px',
          }}
        />

        <div className="relative z-[1] mx-auto w-full max-w-3xl rounded-2xl border border-[#cfc9e8] bg-white/95 p-5 sm:p-6 shadow-[0_4px_18px_rgba(35,25,66,0.05)]">
          <p role="alert" className="mb-4 text-[13.5px] font-medium text-rose-600">
            {describeError(httpStatus)}
          </p>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push(`/projects/${projectId}`)}
              className="min-h-10 rounded-xl border border-[#cfc9e8] bg-white hover:bg-[#f6f3ff] hover:text-[#5B44BA] px-4 py-2 text-[12.5px] font-semibold text-[#333333] transition-colors cursor-pointer"
            >
              Back to Project
            </button>

            {canRetry && (
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
      </div>
    );
  }

  return (
    <>
      {hasRetainedProject &&
        retainedProject &&
        retainedUserId !== null &&
        isRetainedUserCurrent && (
          <div
            hidden={!showContent}
            inert={!showContent}
          >
            <ProjectSettingsForm
              key={`${retainedUserId}-${retainedProject.projectId}`}
              project={retainedProject}
              ownerUserId={retainedUserId}
              draftKey={draftKey}
              activeLoaderTokenRef={activeLoaderTokenRef}
            />
          </div>
        )}

      {(!showContent || !isRetainedUserCurrent) && (
        <ProtectedState
          status={status === 'ready' ? 'loading' : status}
          onRetry={retry}
        />
      )}
    </>
  );
}

export default function ProjectSettingsPage() {
  const params = useParams<{ projectId: string }>();

  return (
    <ProjectSettingsLoader
      key={params.projectId}
      projectId={params.projectId}
    />
  );
}