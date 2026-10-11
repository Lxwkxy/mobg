import { pool } from "./db.js";
import { provisionAccount, ProvisioningError } from "./provisioning/accounts.js";
import { seedDemoProjects } from "./provisioning/demoProjects.js";
import { domainIdToNumber } from "./services/dbHelpers.js";

try {
  const index = process.argv.indexOf("--database");
  const expected = index >= 0 ? process.argv[index + 1] : undefined;
  const database = (await pool.query<{ database: string }>("SELECT current_database() AS database")).rows[0]!.database;
  if (!expected || database !== expected) throw new Error("Pass --database with the exact configured database name");
  console.log(`Demo provisioning target: ${database}`);
  if (!process.env.SEED_DOMAIN_USER_ID || !process.env.SEED_OWNER_PASSWORD
    || !process.env.SEED_MEMBER_PASSWORD || !process.env.SEED_OUTSIDER_PASSWORD) {
    throw new Error("Set SEED_DOMAIN_USER_ID and all three SEED_*_PASSWORD variables privately");
  }
  const owner = await provisionAccount({ domain_user_id: domainIdToNumber(process.env.SEED_DOMAIN_USER_ID), password: process.env.SEED_OWNER_PASSWORD });
  const member = await provisionAccount({ name: "MobG Member", email: process.env.SEED_MEMBER_EMAIL || "mobg-member@example.test", password: process.env.SEED_MEMBER_PASSWORD });
  const outsider = await provisionAccount({ name: "MobG Outsider", email: process.env.SEED_OUTSIDER_EMAIL || "mobg-outsider@example.test", password: process.env.SEED_OUTSIDER_PASSWORD });
  const projects = await seedDemoProjects({ owner_id: domainIdToNumber(owner.user_id), member_id: domainIdToNumber(member.user_id),
    outsider_id: domainIdToNumber(outsider.user_id) });
  console.table([owner, member, outsider].map((user, i) => ({ purpose: ["Owner", "Member", "Outsider"][i],
    user_id: user.user_id, auth_user_id: user.auth_user_id, email: user.email, created: user.created })));
  console.log(JSON.stringify(projects));
  console.log("Existing credentials are retained, not reset. Verify Login separately using the original passwords.");
} catch (error) {
  if (error instanceof ProvisioningError) {
    console.error(error.message);
    if (error.recovery_file) console.error(`Private reconciliation record: ${error.recovery_file}`);
  } else console.error("Demo provisioning failed. Check env inputs, selected profile, and fixture memberships; no credentials were logged.");
  process.exitCode = 1;
} finally { await pool.end(); }
