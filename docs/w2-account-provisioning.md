# W2 account provisioning procedure (prepared in W1)

Owner: Pai, coordinated with Book. Use Better Auth 1.7.7.
This is the concrete handoff procedure; implementing/running the seed script is W2.

## Separate seed configuration

Keep backend/src/auth.ts unchanged with disableSignUp: true.
Create backend/src/seed-accounts.ts in W2. Import auth configuration, not server.ts.
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
transactions or compensation; it is not implemented by this W1 handoff.

## Running and verification in W2

After Pai implements the full preflight/call/link/reconciliation steps in the script:

```powershell
# Set SEED_DOMAIN_USER_ID and SEED_PASSWORD privately in this terminal first.
cd backend
npx tsx src/seed-accounts.ts
```

Use try/finally to close pool.end() on success or failure and exit nonzero on failure.
Verify the existing domain ID still owns its project and its auth_user_id matches the
credential account. Then Book/Bar verify real Login, session/profile mapping and
sign-out. The regular server must continue to reject public signup.

