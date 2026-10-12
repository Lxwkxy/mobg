import type { Project, ProjectMember, ProjectRole, UserProfile } from "../contracts/api.js";
import { domainIdToNumber } from "../services/dbHelpers.js";
import type { ProjectMemberRow, ProjectRow, UserRow } from "../services/projectDb.js";

// COUNT/BIGINT arrive as decimal strings; 0 is valid for counts.
function countToNumber(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new TypeError("Invalid stored count");
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new TypeError("Stored count outside safe integer range");
  return n;
}
export { countToNumber };

// Unknown stored roles must never be exposed or granted permissions.
function toRole(role: string): ProjectRole {
  if (role !== "Owner" && role !== "Member") throw new TypeError("Unknown stored project role");
  return role;
}

export function mapProject(row: ProjectRow, myRole?: string): Project {
  return {
    projectId: domainIdToNumber(row.project_id),
    projectName: row.project_name,
    projectDescription: row.project_description,
    startDate: row.start_date,
    dueDate: row.due_date,
    createdAt: row.project_create_date.toISOString(),
    creatorId: domainIdToNumber(row.created_by),
    creatorName: row.creator_name,
    ...(myRole === undefined ? {} : { myRole: toRole(myRole) }),
    derivedStatus: row.derived_status,
    progressPercent: row.progress_percent,
    totalTasks: countToNumber(row.total_tasks),
    completedTasks: countToNumber(row.completed_tasks),
  };
}

export function mapUser(row: UserRow): UserProfile {
  return { userId: domainIdToNumber(row.user_id), userName: row.user_name, email: row.email };
}

export function mapMember(row: ProjectMemberRow): ProjectMember {
  return { ...mapUser(row), role: toRole(row.role), joinDate: row.date_join };
}
