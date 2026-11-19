'use client';

import { useEffect } from 'react';
import { notFound, useParams, useRouter } from 'next/navigation';

import { tryParseRouteId } from '@/lib/taskApi';

function ProjectTasksRedirect({ projectId }: { projectId: string }) {
  const router = useRouter();
  const isInvalidId = tryParseRouteId(projectId, 'project ID') === null;

  useEffect(() => {
    if (isInvalidId) {
      notFound();
      return;
    }

    router.replace(`/projects/${projectId}`);
  }, [isInvalidId, projectId, router]);

  return null;
}

export default function ProjectTasksPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;

  return (
    <ProjectTasksRedirect
      key={projectId}
      projectId={projectId}
    />
  );
}