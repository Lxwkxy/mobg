import { pool } from "./db.js";
import { provisionAccount, ProvisioningError } from "./provisioning/accounts.js";
import { domainIdToNumber } from "./services/dbHelpers.js";

try {
  const index = process.argv.indexOf("--database");
  const expected = index >= 0 ? process.argv[index + 1] : undefined;
  const database = (await pool.query<{ database: string }>("SELECT current_database() AS database")).rows[0]!.database;
  if (!expected || database !== expected) throw new ProvisioningError("Pass --database with the exact configured target name");
  console.log(`Provisioning target: ${database}`);
  const id = process.env.SEED_DOMAIN_USER_ID;
  if (id && (process.env.SEED_EMAIL || process.env.SEED_NAME)) {
    throw new ProvisioningError("Choose existing domain ID OR new name/email; do not combine both modes");
  }
  const target = id ? { domain_user_id: domainIdToNumber(id) } : {
    name: process.env.SEED_NAME ?? "", email: process.env.SEED_EMAIL ?? "",
  };
  const result = await provisionAccount({ ...target, password: process.env.SEED_PASSWORD,
    recover: process.argv.includes("--recover") });
  console.log(JSON.stringify({ database, user_id: result.user_id, user_name: result.user_name,
    email: result.email, auth_user_id: result.auth_user_id, created: result.created }));
} catch (error) {
  if (error instanceof ProvisioningError) {
    console.error(error.message);
    if (error.recovery_file) console.error(`Private reconciliation record: ${error.recovery_file}`);
  } else console.error("Account provisioning failed; inspect the database/private recovery record. Credentials were not logged.");
  process.exitCode = 1;
} finally { await pool.end(); }
