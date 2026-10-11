# W2 account provisioning procedure

Owner: Pai, coordinated with Book. Use Better Auth 1.7.7.
The W1 procedure is now implemented in backend/src/provisioning/accounts.ts and
the seed CLIs. Use the commands below for local development; no HTTP server opens.

## Separate seed configuration

Keep backend/src/auth.ts unchanged with disableSignUp: true.
backend/src/seed-accounts.ts imports auth configuration, not server.ts.
The seed process must never mount an HTTP handler or call app.listen.

```ts
import { betterAuth } from "better-auth";
import { auth } from "./auth.js";
import { pool } from "./db.js";

const seedAuth = betterAuth({
  ...auth.options,
  emailAndPassword: {
    ...auth.options.emailAndPassword,
    enabled: true,
    disableSignUp: false, // Only this non-serving seed instance allows signup.
    autoSignIn: false,   // Seed credentials without creating a login session.
  },
});
```

Calling auth.api.signUpEmail on the normal serving instance is rejected because
disableSignUp is true. Do not enable signup in the serving config to run a seed.

## Required inputs and preflight

1. Select the database through the normal POSTGRES_* variables. Apply 001-005 first.
2. Pass SEED_DOMAIN_USER_ID (the existing domain user to link, initially demo ID 1)
   and SEED_PASSWORD through local environment variables. Keep passwords private,
   outside Git and logs. Better Auth enforces its configured password limits.
3. Validate the domain ID as a positive safe integer; query the existing users row
   with a parameter: SELECT user_id, user_name, email, auth_user_id FROM users
   WHERE user_id = $1. Stop if missing. Do not insert a duplicate demo profile.
4. Normalize the selected email using trim().toLowerCase(). Before changing existing
   emails, query SELECT lower(btrim(email)), count(*) FROM users GROUP BY
   lower(btrim(email)) HAVING count(*) > 1; stop and resolve collisions explicitly.
5. Check auth_users for an existing normalized email before signup. If the domain
   row already links to the same intended auth user and a credential account exists,
   skip creation. Otherwise stop for reconciliation; never automatically attach an
   existing account just because emails match. Serialize seed runs per domain user.

## Server API call and explicit link

After the preflight, use the selected domain row as the source of name/email:

```ts
// domainUser is the selected/validated users row; password is SEED_PASSWORD.
const result = await seedAuth.api.signUpEmail({
  body: {
    name: domainUser.user_name,
    email: domainUser.email.trim().toLowerCase(),
    password,
  },
});
const authUserId = result.user.id; // Keep this as a string; it is not user_id.
```

Before linking, confirm that auth_users contains this exact id/email and
auth_accounts contains user_id = authUserId, provider_id = 'credential',
account_id = authUserId and a non-null password. Better Auth may return a generic
duplicate response when autoSignIn is false; a returned ID alone is not evidence
that a new account exists.

Use parameterized SQL for the conditional link:

```sql
UPDATE users
SET auth_user_id = $1
WHERE user_id = $2 AND auth_user_id IS NULL
RETURNING user_id;
```

Parameters are [authUserId, domainUser.user_id]. Require exactly one returned row.
If the link fails, retain the actual created auth ID in a private reconciliation
record, stop and resolve before rerunning. Do not report seed success, blindly retry,
delete a pre-existing account, overwrite another link or merge profiles silently.
The Better Auth creation and domain update are separate operations: handle failures
explicitly. Any future flow that creates a new domain profile must provide coordinated
transactions or compensation. The W2 implementation records the actual credential
ID privately and commits a new domain profile in a transaction. A failure stops
for explicit recovery instead of recreating credentials.

## Running and verification in W2

For one selected existing profile:

```powershell
# Set SEED_DOMAIN_USER_ID and SEED_PASSWORD privately in this terminal first.
cd backend
npx tsx src/seed-accounts.ts --database mobg_db
```

Use try/finally to close pool.end() on success or failure and exit nonzero on failure.
Verify the existing domain ID still owns its project and its auth_user_id matches the
credential account. Then Book/Bar verify real Login, session/profile mapping and
sign-out. The regular server must continue to reject public signup.

## Step-by-step: three development accounts

Use one PowerShell terminal for all steps. The root .env supplies POSTGRES_* and
BETTER_AUTH_SECRET. Passwords below are process environment variables only; never
paste them into commands, Git, logs or this guide.

1. From backend/, create the auth secret if absent:

   ```powershell
   npx tsx src/setup-auth-secret.ts
   ```

   Existing keys are never overwritten. A placeholder/short existing secret must
   be replaced privately before provisioning. The helper displays no secret.

2. Inspect the actual target first:

   ```powershell
   npx tsx src/schema-status.ts --database mobg_db
   docker compose exec -T db psql -U postgres -d mobg_db -c "SELECT user_id,user_name,email,auth_user_id FROM users ORDER BY user_id;"
   ```

   All 001–005 must be complete. If missing, state the target and missing scripts
   before running `npx tsx src/schema-status.ts --apply --database mobg_db`.
   A partial schema stops; inspect/reconcile instead of resetting the DB/volume.

3. Select the exact existing Owner profile and enter passwords with hidden input:

   ```powershell
   . .\scripts\set-seed-env.ps1
   ```

   The initial demo is ID 1; verify before entering it. Then enter Owner, Member
   and Outsider passwords (8–128 characters), each selected privately by the user.
   This sets SEED_DOMAIN_USER_ID and SEED_OWNER_PASSWORD/SEED_MEMBER_PASSWORD/
   SEED_OUTSIDER_PASSWORD in this terminal only. Keep the terminal open.

4. Provision all three accounts plus two business fixtures:

   ```powershell
   npx tsx src/seed-demo.ts --database mobg_db
   ```

   Owner uses the existing row's name/email and keeps its user_id/ownership.
   New Member defaults to mobg-member@example.test; new Outsider defaults to
   mobg-outsider@example.test. Override SEED_MEMBER_EMAIL/SEED_OUTSIDER_EMAIL before
   running if needed; keep them the same for reruns/checks. Owners/Members are
   project-specific roles, not a global user flag.

   Seed creates MobG W2 Shared Project (Owner + Member), and MobG W2 Private Project
   (Owner only). Each project's creation is atomic. A rerun reuses existing linked
   credentials/profiles and matching fixtures; it never resets passwords or rewrites
   changed membership roles. Counts and original data are retained.

5. In the same terminal, verify native Better Auth and DB functions:

   ```powershell
   npx tsx src/check-demo.ts --database mobg_db
   ```

   Expected: Owner/Member/Outsider PASS for Login, identity mapping, fixture
   membership, list and Logout. A temporary session is signed out even on failure.
   This is not an HTTP/browser permission test. Book/Bar complete the joint flow.
   Rerunning seed with different env passwords does not change existing credentials;
   use the original passwords to verify Login.

6. Clear password env values when finished (or close this terminal):

   ```powershell
   Remove-Item Env:SEED_OWNER_PASSWORD,Env:SEED_MEMBER_PASSWORD,Env:SEED_OUTSIDER_PASSWORD -ErrorAction SilentlyContinue
   ```

## Single-account/new-profile mode and recovery

Existing mode requires SEED_DOMAIN_USER_ID + SEED_PASSWORD. New profile mode requires
SEED_NAME + SEED_EMAIL + SEED_PASSWORD, with SEED_DOMAIN_USER_ID unset. Mixing modes
is rejected. Both require --database matching the configured DB. Signup is allowed
only in the non-serving seed instance; serving auth.ts remains disableSignUp: true.

A credential/link failure exits nonzero and prints a private reconciliation file
path under root .seed-reconciliation/ (ignored by Git). Records contain target,
database, email and actual auth ID, never passwords/hashes/session tokens. A rerun
stops while that record is pending. Keep the record; do not delete an existing auth
account or attach by email to bypass it.

Inspect the record locally, fix the cause of the domain write failure, confirm the
exact target and verified_creation: true, then use the original target mode:

```powershell
# Set ONLY SEED_DOMAIN_USER_ID, or ONLY SEED_NAME + SEED_EMAIL, for that record.
# No password is required when recovering a verified existing credential.
npx tsx src/seed-accounts.ts --database mobg_db --recover
```

Recovery checks the actual ID/email/credential and conditional domain link before
committing. A successful recovery removes the record. An unverified record, changed
target, mismatched credential or pre-existing unlinked auth email requires manual
reconciliation; no automatic attachment/deletion is performed.

See [Book handoff](w2-pai-handoff.md) and [verification record](w2-pai-verification.md).

