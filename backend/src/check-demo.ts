import { betterAuth } from "better-auth";
import { auth as servingAuth } from "./auth.js";
import { pool } from "./db.js";
import { domainIdToNumber } from "./services/dbHelpers.js";
import { findDomainUserByAuthId } from "./services/authDb.js";
import { findProjectMembership, listProjectsForUser } from "./services/projectDb.js";

// Same serving options, including disabled public signup; silence credential-bearing errors.
const auth = betterAuth({ ...servingAuth.options, logger: { disabled: true } });

try {
  const index = process.argv.indexOf("--database");
  const expected = index >= 0 ? process.argv[index + 1] : undefined;
  const database = (await pool.query("SELECT current_database() AS database")).rows[0].database;
  if (!expected || expected !== database) throw new Error("Database target mismatch");
  const ownerId = domainIdToNumber(process.env.SEED_DOMAIN_USER_ID ?? "");
  const owner = (await pool.query("SELECT email FROM users WHERE user_id = $1", [ownerId])).rows[0];
  if (!owner) throw new Error("Selected Owner profile is missing");
  const fixtures = (await pool.query<{ project_id: string; project_name: string }>(
    "SELECT project_id, project_name FROM projects WHERE created_by = $1 AND project_name = ANY($2::text[])",
    [ownerId, ["MobG W2 Shared Project", "MobG W2 Private Project"]])).rows;
  const shared = fixtures.filter(p => p.project_name === "MobG W2 Shared Project");
  const privateProject = fixtures.filter(p => p.project_name === "MobG W2 Private Project");
  if (shared.length !== 1 || privateProject.length !== 1) throw new Error("Run/repair demo fixtures first");
  const roles = [
    { role: "Owner", email: owner.email, password: process.env.SEED_OWNER_PASSWORD },
    { role: "Member", email: process.env.SEED_MEMBER_EMAIL || "mobg-member@example.test", password: process.env.SEED_MEMBER_PASSWORD },
    { role: "Outsider", email: process.env.SEED_OUTSIDER_EMAIL || "mobg-outsider@example.test", password: process.env.SEED_OUTSIDER_PASSWORD },
  ];
  const verifiedIds = new Set<string>();
  for (const account of roles) {
    let cookie: string | undefined;
    try {
      if (!account.password) throw new Error("Private password env is missing");
      const response = await auth.api.signInEmail({ body: { email: account.email, password: account.password }, asResponse: true });
      if (response.status !== 200) throw new Error("Login failed");
      cookie = response.headers.getSetCookie().map(v => v.split(";")[0]).join("; ");
      const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
      if (!session) throw new Error("No verified session");
      const user = await findDomainUserByAuthId(session.user.id);
      if (!user || verifiedIds.has(user.user_id)) throw new Error("Domain link is missing or demo roles are not distinct");
      verifiedIds.add(user.user_id);
      const id = domainIdToNumber(user.user_id);
      const sharedRole = await findProjectMembership(domainIdToNumber(shared[0]!.project_id), id);
      const privateRole = await findProjectMembership(domainIdToNumber(privateProject[0]!.project_id), id);
      if (account.role === "Owner" && (id !== ownerId || sharedRole?.role !== "Owner" || privateRole?.role !== "Owner")) throw new Error("Owner membership mismatch");
      if (account.role === "Member" && (sharedRole?.role !== "Member" || privateRole !== null)) throw new Error("Member membership mismatch");
      if (account.role === "Outsider" && (sharedRole !== null || privateRole !== null)) throw new Error("Outsider has fixture access");
      const projects = await listProjectsForUser({ user_id: id, status: null, page: 1, page_size: 50 });
      await auth.api.signOut({ headers: new Headers({ cookie }) });
      if (await auth.api.getSession({ headers: new Headers({ cookie }) })) throw new Error("Session remains valid after sign-out");
      cookie = undefined;
      console.log(`${account.role}: Login, Auth/domain mapping, fixture membership, list (${projects.total_items}), Logout PASS`);
    } finally {
      if (cookie) await auth.api.signOut({ headers: new Headers({ cookie }) });
    }
  }
  console.log("Native Better Auth/DB checks passed. Book API guards and Bar browser flows still need team verification.");
} catch {
  console.error("Demo verification failed. Check target, original passwords, domain links and fixture roles. No credentials were logged.");
  process.exitCode = 1;
} finally { await pool.end(); }
