
'use client';

import { useCallback, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import {
  ApiRequestError,
  projectApi,
} from '@/lib/projectApi';
import { useProtectedLoad } from '@/lib/useProtectedLoad';
import ProtectedState from '@/components/ProtectedState';

import type { ProjectItem } from '@/types';

type ProjectForm = {
  projectName: string;
  projectDescription: string;
  startDate: string;
  dueDate: string;
};

type FieldErrors = Partial<Record<keyof ProjectForm, string>>;

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

export default function ProjectSettingsPage() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();

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
            onClick={() => router.push(`/projects/${params.projectId}`)}
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

  if (status !== 'ready' || project === null) {
    return (
      <ProtectedState
        status={status === 'ready' ? 'loading' : status}
        onRetry={retry}
      />
    );
  }

  return <ProjectSettingsForm project={project} />;
}

function ProjectSettingsForm({ project }: { project: ProjectItem }) {
  const router = useRouter();

  // กำหนดค่าเริ่มต้นจาก Project โดยตรง ไม่ต้องใช้ Effect
  const [form, setForm] = useState<ProjectForm>(() => ({
    projectName: project.projectName ?? '',
    projectDescription: project.projectDescription ?? '',
    startDate: getDateInputValue(project.startDate),
    dueDate: getDateInputValue(project.dueDate),
  }));

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!project || project.myRole !== 'Owner' || isSaving) return;

    setSaveError('');

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const projectId = project.projectId;

      await projectApi.updateProject(projectId, {
        projectName: form.projectName.trim(),
        projectDescription: form.projectDescription.trim() || null,
        startDate: form.startDate,
        dueDate: form.dueDate || null,
      });

      // Return to Project Detail after successful save.
      router.push(`/projects/${projectId}`);
      router.refresh();
    } catch (error) {
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
            nextErrors[detail.field] = detail.message ?? 'Invalid value.';
          }
        });

        if (Object.keys(nextErrors).length > 0) {
          setFieldErrors(nextErrors);
        } else if (error.status === 403) {
          setSaveError('Only the project Owner can update project settings.');
        } else {
          setSaveError(error.message);
        }
      } else {
        setSaveError('Something went wrong. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  }

  const isOwner = project.myRole === 'Owner';

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

          <p className="mt-2 text-[13px] text-[#777777]">
            Update your project information and dates.
          </p>
        </div>

        {!isOwner ? (
          <div className="rounded-xl border border-[#eeeeee] bg-[#fafafa] p-4">
            <p className="text-[14px] font-semibold text-[#333333]">
              Owner permission required
            </p>
            <p className="mt-2 text-[13px] text-[#777777]">
              Only the project Owner can edit these settings.
            </p>
          </div>
        ) : (
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
                  className={`min-h-11 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#555555] ${
                    fieldErrors.projectName
                      ? 'border-red-500'
                      : 'border-[#dddddd]'
                  }`}
                  placeholder="Enter project name"
                  aria-invalid={Boolean(fieldErrors.projectName)}
                  aria-describedby={
                    fieldErrors.projectName ? 'projectName-error' : undefined
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
                  className={`w-full resize-y rounded-lg border px-3 py-3 text-[13px] outline-none focus:border-[#555555] ${
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
                    className={`min-h-11 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#555555] ${
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
                    className={`min-h-11 w-full rounded-lg border px-3 py-2 text-[13px] outline-none focus:border-[#555555] ${
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
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-[#dddddd] px-5 py-2 text-[13px] font-semibold text-[#444444] hover:bg-[#f7f7f7]"
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
        )}
      </div>
    </div>
  );
}
