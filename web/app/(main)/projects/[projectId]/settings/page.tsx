'use client';

import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
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
  if (status === 400) return 'Invalid project ID.';
  if (status === 403) return 'You do not have permission to view this project.';
  if (status === 404) return 'Project not found.';
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
  if (typeof window === 'undefined') {
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
      currentForm.projectName === previousBaseline.projectName
        ? latestForm.projectName
        : currentForm.projectName,

    projectDescription:
      currentForm.projectDescription === previousBaseline.projectDescription
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

function ProjectSettingsForm({
  project,
  draftKey,
}: {
  project: ProjectItem;
  draftKey: string;
}) {
  const router = useRouter();
  const {
    session,
    isCurrentSessionRevision,
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
  const [isSaving, setIsSaving] = useState(false);

  const baselineRef = useRef(baseline);
  const mountedRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const activeSaveRevisionRef = useRef<number | null>(null);

  const sessionRevision = session.revision;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      activeSaveRevisionRef.current = null;
    };
  }, []);

  // รับข้อมูล API ล่าสุด โดยรักษาค่าที่ผู้ใช้แก้ไขเองไว้
  useEffect(() => {
    const latestForm = createProjectForm(project);
    const previousBaseline = baselineRef.current;

    baselineRef.current = latestForm;

    startTransition(() => {
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

  // เก็บ Draft แยกตามบัญชีและ Project
  useEffect(() => {
    if (project.myRole !== 'Owner') {
      removeStoredDraft(draftKey);
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
  }, [baseline, draftKey, form, project.myRole]);

  // ยกเลิกสิทธิ์ของ PATCH เก่าเมื่อ Session revision เปลี่ยน
  useEffect(() => {
    if (
      activeSaveRevisionRef.current !== null &&
      activeSaveRevisionRef.current !== sessionRevision
    ) {
      requestSequenceRef.current += 1;
      activeSaveRevisionRef.current = null;
      setIsSaving(false);
    }
  }, [sessionRevision]);

  const isRequestCurrent = useCallback(
    (
      requestId: number,
      requestRevision: number,
      requestUserId: number | string,
    ) => {
      return (
        mountedRef.current &&
        requestSequenceRef.current === requestId &&
        activeSaveRevisionRef.current === requestRevision &&
        session.user?.userId === requestUserId &&
        isCurrentSessionRevision(requestRevision)
      );
    },
    [
      isCurrentSessionRevision,
      session.user?.userId,
    ],
  );

  function updateField<K extends keyof ProjectForm>(
    field: K,
    value: ProjectForm[K],
  ) {
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
      activeSaveRevisionRef.current !== null ||
      session.status !== 'ready' ||
      !session.user
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

    const requestRevision = session.revision;
    const requestUserId = session.user.userId;
    const requestId = requestSequenceRef.current + 1;

    requestSequenceRef.current = requestId;
    activeSaveRevisionRef.current = requestRevision;

    setIsSaving(true);

    try {
      const updatedProject = await projectApi.updateProject(
        project.projectId,
        input,
      );

      if (
        !isRequestCurrent(
          requestId,
          requestRevision,
          requestUserId,
        )
      ) {
        return;
      }

      // ใช้ค่าจาก API เป็น Baseline ใหม่
      // และรักษาค่าที่ผู้ใช้ยังไม่ได้บันทึกไว้
      const latestBaseline = createProjectForm(updatedProject);

      const nextForm = mergeProjectForm(
        form,
        baseline,
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
            draftKey,
            JSON.stringify({
              baseline: latestBaseline,
              form: nextForm,
            } satisfies StoredProjectDraft),
          );
        } catch {
          // ไม่ให้ปัญหา sessionStorage ขัดขวางการทำงานของหน้า
        }
      } else {
        removeStoredDraft(draftKey);
      }

      baselineRef.current = latestBaseline;
      setBaseline(latestBaseline);
      setForm(nextForm);

      router.push(`/projects/${project.projectId}`);
      router.refresh();
    } catch (error) {
      if (
        !isRequestCurrent(
          requestId,
          requestRevision,
          requestUserId,
        )
      ) {
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
      if (
        isRequestCurrent(
          requestId,
          requestRevision,
          requestUserId,
        )
      ) {
        activeSaveRevisionRef.current = null;
        setIsSaving(false);
      }
    }
  }

  const isOwner = project.myRole === 'Owner';

  if (!isOwner) {
    return (
      <div className="mx-auto w-full min-w-0 max-w-3xl [overflow-wrap:anywhere]">
        <Link
          href={`/projects/${project.projectId}`}
          className="mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black"
        >
          ← Back to Project
        </Link>

        <div className="rounded-2xl border border-[#e0e0e0] bg-white p-4 sm:p-6 md:p-8">
          <div className="mb-7">
            <p className="mb-2 text-[12px] text-[#777777]">
              Project management
            </p>

            <h1 className="text-2xl font-extrabold text-[#1f1f1f]">
              Project Settings
            </h1>
          </div>

          <div className="rounded-xl border border-[#eeeeee] bg-[#fafafa] p-4">
            <p className="text-[14px] font-semibold text-[#333333]">
              Owner permission required
            </p>

            <p className="mt-2 text-[13px] text-[#777777]">
              Only the project Owner can edit these settings.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-3xl [overflow-wrap:anywhere]">
      <Link
        href={`/projects/${project.projectId}`}
        onClick={() => {
          if (!isSaving) {
            removeStoredDraft(draftKey);
          }
        }}
        aria-disabled={isSaving}
        className={`mb-5 inline-flex min-h-11 items-center text-[13px] text-[#666666] hover:text-black ${
          isSaving ? 'pointer-events-none opacity-50' : ''
        }`}
      >
        ← Back to Project
      </Link>

      <div className="rounded-2xl border border-[#e0e0e0] bg-white p-4 sm:p-6 md:p-8">
        <div className="mb-7">
          <p className="mb-2 text-[12px] text-[#777777]">
            Project management
          </p>

          <h1 className="text-2xl font-extrabold text-[#1f1f1f]">
            Project Settings
          </h1>

          <p className="mt-2 text-[13px] text-[#777777]">
            Update your project information and dates.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="space-y-5">
            <div>
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
                value={form.projectName}
                onChange={(event) =>
                  updateField('projectName', event.target.value)
                }
                disabled={isSaving}
                className={`min-h-11 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#555555] disabled:bg-[#f5f5f5] ${
                  fieldErrors.projectName
                    ? 'border-red-500'
                    : 'border-[#dddddd]'
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
                  className="mt-1 text-[12px] text-red-600"
                >
                  {fieldErrors.projectName}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="projectDescription"
                className="mb-2 block text-[13px] font-semibold text-[#333333]"
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
                className={`w-full resize-y rounded-lg border px-3 py-3 text-[13px] outline-none focus:border-[#555555] disabled:bg-[#f5f5f5] ${
                  fieldErrors.projectDescription
                    ? 'border-red-500'
                    : 'border-[#dddddd]'
                }`}
                placeholder="Describe your project"
                aria-invalid={Boolean(fieldErrors.projectDescription)}
              />

              {fieldErrors.projectDescription && (
                <p className="mt-1 text-[12px] text-red-600">
                  {fieldErrors.projectDescription}
                </p>
              )}
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
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
                  value={form.startDate}
                  onChange={(event) =>
                    updateField('startDate', event.target.value)
                  }
                  disabled={isSaving}
                  className={`min-h-11 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#555555] disabled:bg-[#f5f5f5] ${
                    fieldErrors.startDate
                      ? 'border-red-500'
                      : 'border-[#dddddd]'
                  }`}
                  aria-invalid={Boolean(fieldErrors.startDate)}
                />

                {fieldErrors.startDate && (
                  <p className="mt-1 text-[12px] text-red-600">
                    {fieldErrors.startDate}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="dueDate"
                  className="mb-2 block text-[13px] font-semibold text-[#333333]"
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
                  className={`min-h-11 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#555555] disabled:bg-[#f5f5f5] ${
                    fieldErrors.dueDate
                      ? 'border-red-500'
                      : 'border-[#dddddd]'
                  }`}
                  aria-invalid={Boolean(fieldErrors.dueDate)}
                />

                {fieldErrors.dueDate && (
                  <p className="mt-1 text-[12px] text-red-600">
                    {fieldErrors.dueDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          {saveError && (
            <p
              role="alert"
              className="mt-5 rounded-lg bg-red-50 px-3 py-3 text-[13px] text-red-600"
            >
              {saveError}
            </p>
          )}

          <div className="mt-7 flex flex-wrap justify-end gap-3 border-t border-[#eeeeee] pt-6">
            <Link
              href={`/projects/${project.projectId}`}
              onClick={() => {
                if (!isSaving) {
                  removeStoredDraft(draftKey);
                }
              }}
              aria-disabled={isSaving}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-[#dddddd] px-5 py-2 text-[13px] font-semibold text-[#444444] hover:bg-[#f7f7f7] ${
                isSaving ? 'pointer-events-none opacity-50' : ''
              }`}
            >
              Cancel
            </Link>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#222222] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#444444] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
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

  const load = useCallback(async () => {
    const parsedProjectId = Number(projectId);

    if (
      !Number.isSafeInteger(parsedProjectId) ||
      parsedProjectId <= 0
    ) {
      throw new ApiRequestError('Invalid project ID.', 400);
    }

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
    session.user?.userId === retainedUserId;

  if (status === 'error') {
    const canRetry =
      httpStatus !== 400 &&
      httpStatus !== 403 &&
      httpStatus !== 404;

    return (
      <div className="mx-auto w-full max-w-3xl rounded-xl border border-[#e0e0e0] bg-white p-4 sm:p-6">
        <p role="alert" className="mb-4 text-[13px] text-red-600">
          {describeError(httpStatus)}
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push(`/projects/${projectId}`)}
            className="min-h-11 rounded-lg border border-[#e0e0e0] px-4 py-2 text-[12px]"
          >
            Back to Project
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
    );
  }

  return (
    <>
      {hasRetainedProject &&
        retainedProject &&
        isRetainedUserCurrent && (
          <div
            hidden={!showContent}
            inert={!showContent}
          >
            <ProjectSettingsForm
              key={`${retainedUserId}-${retainedProject.projectId}`}
              project={retainedProject}
              draftKey={draftKey}
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