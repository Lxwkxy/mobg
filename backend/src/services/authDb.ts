import { pool } from "../db.js";

export interface DomainUserRow {
  user_id: string;
  user_name: string;
  email: string;
  auth_user_id: string;
}

export type FindDomainUserByAuthId = (authUserId: string) => Promise<DomainUserRow | null>;

// Book supplies the string ID from a verified Better Auth session.
export const findDomainUserByAuthId: FindDomainUserByAuthId = async (authUserId) => {
  if (typeof authUserId !== "string") throw new TypeError("Expected a string Auth ID");
  const result = await pool.query<DomainUserRow>(
    "SELECT user_id, user_name, email, auth_user_id FROM users WHERE auth_user_id = $1",
    [authUserId],
  );
  return result.rows[0] ?? null;
};
