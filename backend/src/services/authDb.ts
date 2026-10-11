// W1 contracts only. Pai implements the lookup in W2.
export interface DomainUserRow {
  user_id: string; // pg BIGINT stays a decimal string.
  user_name: string;
  email: string;
  auth_user_id: string;
}

// Input must come from auth.api.getSession(), never from a client identity claim.
// null means no linked MobG user; database errors must propagate.
export type FindDomainUserByAuthId = (authUserId: string) => Promise<DomainUserRow | null>;
