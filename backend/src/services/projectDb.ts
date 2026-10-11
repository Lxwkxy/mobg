// W1 contract only. Pai implements this lookup in W2.
export interface ProjectMembershipRow {
  project_id: string;
  user_id: string;
  role: string; // Book accepts exactly Owner or Member; unknown roles grant no permission.
}

// Both IDs must be positive safe integers. userId comes from the validated session
// and its users.auth_user_id link. null means no matching membership; errors propagate.
export type FindProjectMembership = (
  projectId: number,
  userId: number,
) => Promise<ProjectMembershipRow | null>;

// Project creation and the creator's Owner membership must commit in one transaction.
