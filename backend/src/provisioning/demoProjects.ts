import { pool } from "../db.js";
import { assertDomainId, domainIdToNumber } from "../services/dbHelpers.js";
import { createProjectWithMembers, listProjectMembers } from "../services/projectDb.js";
import { runSeedWork } from "./seedQueue.js";

type DemoProjectInput = { owner_id: number; member_id: number; outsider_id: number };
type DemoProjectIds = { shared_project_id: string; private_project_id: string };
export function seedDemoProjects(input: DemoProjectInput): Promise<DemoProjectIds> {
  return runSeedWork(() => seedDemoProjectsNow(input));
}

async function seedDemoProjectsNow(input: DemoProjectInput): Promise<DemoProjectIds> {
  const ids = [input.owner_id, input.member_id, input.outsider_id];
  ids.forEach(assertDomainId);
  if (new Set(ids).size !== 3) throw new Error("Demo roles require three distinct domain users");
  const eligible = await pool.query(`SELECT u.user_id FROM users u WHERE u.user_id = ANY($1::bigint[])
    AND EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id = u.auth_user_id
      AND a.provider_id = 'credential' AND a.account_id = u.auth_user_id AND a.password IS NOT NULL)`, [ids]);
  if (eligible.rowCount !== 3) throw new Error("Demo users must have actual linked credential accounts");
  const client = await pool.connect();
  let broken = false;
  try {
    // Serialize fixture creation while the public create function owns each transaction.
    await client.query("SELECT pg_advisory_lock(hashtextextended($1, 0))", [`mobg-w2-fixtures:${input.owner_id}`]);
    const today = (await client.query<{ today: string }>(
      "SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::date::text AS today")).rows[0]!.today;
    async function ensure(name: string, memberIds: number[]): Promise<string> {
      const existing = await client.query<{ project_id: string }>(
        "SELECT project_id FROM projects WHERE created_by = $1 AND project_name = $2", [input.owner_id, name]);
      if (existing.rows.length > 1) throw new Error("Duplicate demo project names need explicit reconciliation");
      const id = existing.rows[0]?.project_id;
      if (id) {
        const members = await listProjectMembers(domainIdToNumber(id));
        const expected = new Map([[String(input.owner_id), "Owner"], ...memberIds.map((memberId) => [String(memberId), "Member"] as const)]);
        if (members.length !== expected.size || members.some((member) => expected.get(member.user_id) !== member.role)) {
          throw new Error("Existing demo memberships differ; do not silently change role/access data");
        }
        return id;
      }
      return (await createProjectWithMembers({ project_name: name, project_description: "W2 authentication and project integration fixture",
        start_date: today, due_date: null, created_by: input.owner_id, member_ids: memberIds })).project_id;
    }
    const shared = await ensure("MobG W2 Shared Project", [input.member_id]);
    const privateProject = await ensure("MobG W2 Private Project", []);
    return { shared_project_id: shared, private_project_id: privateProject };
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [`mobg-w2-fixtures:${input.owner_id}`]); }
    catch { broken = true; }
    client.release(broken);
  }
}
