import type { DashboardSummary } from "../contracts/api.js";
import type { DashboardSummaryRow } from "../services/dashboardDb.js";
import { countToNumber } from "./project.js";

// COUNT values are decimal strings and may be "0", so use countToNumber, not domainIdToNumber.
export function mapDashboardSummary(row: DashboardSummaryRow): DashboardSummary {
  return {
    projectCount: countToNumber(row.project_count),
    taskCount: countToNumber(row.task_count),
    statusCounts: {
      todo: countToNumber(row.todo_count),
      inProgress: countToNumber(row.in_progress_count),
      done: countToNumber(row.done_count),
    },
    overdueCount: countToNumber(row.overdue_count),
    highPriorityCount: countToNumber(row.high_priority_count),
  };
}
