
import { ApiRequestError, request } from '@/lib/projectApi';
import type { DashboardResponse } from '@/types';

type Success<T> = Extract<T, { success: true }>;

export const dashboardApi = {
  async getDashboard(limit = 5): Promise<
    Pick<Success<DashboardResponse>, 'summary' | 'highPriorityTasks'>
  > {
    const params = new URLSearchParams({
      limit: String(limit),
    });

    const body = await request<Success<DashboardResponse>>(
      `/api/dashboard?${params.toString()}`,
    );

    if (
      !body.summary ||
      !Array.isArray(body.highPriorityTasks)
    ) {
      throw new ApiRequestError(
        'The server returned invalid dashboard data.',
        200,
      );
    }

    return {
      summary: body.summary,
      highPriorityTasks: body.highPriorityTasks,
    };
  },
};
