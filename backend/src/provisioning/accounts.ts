import { createHash } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { betterAuth } from "better-auth";
import { auth } from "../auth.js";
import { pool } from "../db.js";
import { assertDomainId } from "../services/dbHelpers.js";
import type { DomainUserRow } from "../services/authDb.js";
import { requireAccountSchema } from "./schema.js";
import { runSeedWork } from "./seedQueue.js";

export const seedAuth = betterAuth({
  ...auth.options, logger: { disabled: true },
  emailAndPassword: { ...auth.options.emailAndPassword, enabled: true, disableSignUp: false, autoSignIn: false },
});

export type AccountTarget = { domain_user_id: number } | { name: string; email: string };
interface DomainCandidate { user_id: string; user_name: string; email: string; auth_user_id: string | null }
interface RecoveryRecord {
  database: string; email: string; target: AccountTarget; auth_user_id: string;
  verified_creation: boolean; recorded_at: string;
}
export class ProvisioningError extends Error {
  constructor(message: string, public readonly recovery_file?: string) { super(message); }
}
const defaultRecoveryDirectory = fileURLToPath(new URL("../../../.seed-reconciliation/", import.meta.url));
const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function saveRecoveryRecord(directory: string, path: string, record: RecoveryRecord): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(path + ".tmp", JSON.stringify(record, null, 2), { mode: 0o600 });
  await rename(path + ".tmp", path);
}

type ProvisionAccountInput = AccountTarget & {
  password?: string; recover?: boolean; recovery_directory?: string;
};
export function provisionAccount(input: ProvisionAccountInput): Promise<DomainUserRow & { created: boolean }> {
  return runSeedWork(() => provisionAccountNow(input));
}

async function provisionAccountNow(input: ProvisionAccountInput): Promise<DomainUserRow & { created: boolean }> {
  if ("domain_user_id" in input) assertDomainId(input.domain_user_id);
  else if (!input.name.trim() || input.name.length > 100 || !normalizeEmail(input.email)) {
    throw new ProvisioningError("New profile needs a name (1-100 characters) and an email");
  }
  const client = await pool.connect();
  let transaction = false;
  let authCreationAttempted = false;
  let actualAuthId: string | undefined;
  let verifiedCreation = false;
  let recordPath: string | undefined;
  let database = "";
  let email = "";
  let target: AccountTarget | undefined;
  let broken = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('mobg-account-provisioning', 0))");
    await requireAccountSchema(client);
    database = (await client.query<{ database: string }>("SELECT current_database() AS database")).rows[0]!.database;
    await client.query("BEGIN"); transaction = true;
    const collision = await client.query(`SELECT 1 FROM users GROUP BY lower(btrim(email)) HAVING count(*) > 1
      UNION ALL SELECT 1 FROM auth_users GROUP BY lower(btrim(email)) HAVING count(*) > 1 LIMIT 1`);
    if (collision.rowCount) throw new ProvisioningError("Normalized email collisions exist; resolve them explicitly first");
    let domain: DomainCandidate | undefined;
    if ("domain_user_id" in input) {
      domain = (await client.query<DomainCandidate>(
        "SELECT user_id, user_name, email, auth_user_id FROM users WHERE user_id = $1 FOR UPDATE", [input.domain_user_id],
      )).rows[0];
      if (!domain) throw new ProvisioningError("Selected domain user does not exist");
      target = { domain_user_id: input.domain_user_id };
      email = normalizeEmail(domain.email);
    } else {
      email = normalizeEmail(input.email);
      target = { name: input.name, email };
      domain = (await client.query<DomainCandidate>(`SELECT user_id, user_name, email, auth_user_id FROM users
        WHERE lower(btrim(email)) = $1 FOR UPDATE`, [email])).rows[0];
      if (domain && !domain.auth_user_id) {
        throw new ProvisioningError("An unlinked domain profile already exists; select its exact domain ID instead");
      }
    }
    const directory = input.recovery_directory ?? defaultRecoveryDirectory;
    recordPath = join(directory, createHash("sha256").update(`${database}\n${email}`).digest("hex") + ".json");
    let record: RecoveryRecord | undefined;
    try { record = JSON.parse(await readFile(recordPath, "utf8")) as RecoveryRecord; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw new ProvisioningError("Cannot read reconciliation record"); }
    if (record && (record.database !== database || record.email !== email
      || JSON.stringify(record.target) !== JSON.stringify(target))) {
      throw new ProvisioningError("Reconciliation record does not match the exact database/profile target", recordPath);
    }
    async function hasCredential(id: string): Promise<boolean> {
      return Boolean((await client.query(`SELECT 1 FROM auth_users u JOIN auth_accounts a ON a.user_id = u.id
        WHERE u.id = $1 AND u.email = $2 AND a.provider_id = 'credential' AND a.account_id = u.id
          AND a.password IS NOT NULL AND length(a.password) > 0`, [id, email])).rowCount);
    }
    if (domain?.auth_user_id) {
      if (record && record.auth_user_id !== domain.auth_user_id) throw new ProvisioningError("Existing link differs from recovery record", recordPath);
      if (!(await hasCredential(domain.auth_user_id))) throw new ProvisioningError("Existing link/credential does not match the intended account");
      if (domain.email !== email) throw new ProvisioningError("Linked profile email needs explicit normalization/reconciliation");
      await client.query("COMMIT"); transaction = false;
      if (record) await unlink(recordPath);
      return { ...domain, auth_user_id: domain.auth_user_id, created: false };
    }
    if (record) {
      if (!input.recover || !record.verified_creation) {
        throw new ProvisioningError("Unfinished provisioning exists; inspect the private record before explicit recovery", recordPath);
      }
      actualAuthId = record.auth_user_id;
      verifiedCreation = true;
      if (!(await hasCredential(actualAuthId))) throw new ProvisioningError("Recovery credential no longer matches the recorded account", recordPath);
    } else {
      if (input.recover) throw new ProvisioningError("No reconciliation record exists for this target");
      const existing = await client.query("SELECT id FROM auth_users WHERE lower(btrim(email)) = $1", [email]);
      if (existing.rowCount) throw new ProvisioningError("Auth account exists without the intended link; do not attach it by email");
      if (!input.password) throw new ProvisioningError("Set the seed password privately through an environment variable");
      authCreationAttempted = true;
      const result = await seedAuth.api.signUpEmail({ body: {
        name: domain?.user_name ?? (target as { name: string }).name, email, password: input.password,
      } });
      // A synthetic duplicate response is not proof of an actual credential.
      if (!(await hasCredential(result.user.id))) throw new ProvisioningError("Signup did not produce the expected actual credential account");
      actualAuthId = result.user.id;
      verifiedCreation = true;
      const recovery: RecoveryRecord = { database, email, target, auth_user_id: actualAuthId,
        verified_creation: true, recorded_at: new Date().toISOString() };
      await saveRecoveryRecord(directory, recordPath, recovery);
    }
    let linked: DomainUserRow | undefined;
    if (domain) {
      linked = (await client.query<DomainUserRow>(`UPDATE users SET auth_user_id = $1, email = $3
        WHERE user_id = $2 AND auth_user_id IS NULL RETURNING user_id, user_name, email, auth_user_id`,
      [actualAuthId, domain.user_id, email])).rows[0];
    } else {
      linked = (await client.query<DomainUserRow>(`INSERT INTO users (user_name, email, auth_user_id)
        VALUES ($1, $2, $3) RETURNING user_id, user_name, email, auth_user_id`,
      [(target as { name: string }).name, email, actualAuthId])).rows[0];
    }
    if (!linked) throw new ProvisioningError("Conditional profile link failed", recordPath);
    await client.query("COMMIT"); transaction = false;
    await unlink(recordPath);
    return { ...linked, created: !input.recover };
  } catch (error) {
    if (transaction) {
      try { await client.query("ROLLBACK"); transaction = false; } catch { broken = true; }
    }
    // Preserve a real auth ID on link failure. Never log passwords, tokens or SQL parameters.
    if (authCreationAttempted && target && recordPath) {
      try {
        if (!actualAuthId) actualAuthId = (await client.query<{ id: string }>(
          "SELECT id FROM auth_users WHERE lower(btrim(email)) = $1", [email],
        )).rows[0]?.id;
        if (actualAuthId) {
          await saveRecoveryRecord(input.recovery_directory ?? defaultRecoveryDirectory, recordPath,
            { database, email, target, auth_user_id: actualAuthId,
              verified_creation: verifiedCreation, recorded_at: new Date().toISOString() });
        }
      } catch { throw new ProvisioningError("Provisioning failed and the recovery record could not be saved; stop for manual reconciliation"); }
      if (actualAuthId) throw new ProvisioningError("Credential creation/profile linking was incomplete; inspect the private record before retrying", recordPath);
    }
    throw error;
  } finally {
    try { await client.query("SELECT pg_advisory_unlock(hashtextextended('mobg-account-provisioning', 0))"); }
    catch { broken = true; }
    client.release(broken);
  }
}
