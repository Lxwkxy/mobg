# MobG Backend

W1 foundation: Express 5 + TypeScript (ESM), a shared PostgreSQL pool and Better Auth 1.7.7.
Project/member routes still return W1 sample data. The frontend Login remains a local mock.
W2 adds DB functions and non-serving account/demo provisioning scripts. Native
Better Auth/DB tests pass; browser Login and HTTP permission integration still need Book/Bar.

## Local setup

Use Node.js 22 or newer (the implementation environment uses Node.js 24).
Copy the repository root `.env.example` to `.env` and set your database credentials.
For an existing `.env`, add `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`, and set
`CORS_ORIGIN=http://localhost:3000` for Next.js.

From backend/, add a random secret privately when the key is absent:

```powershell
npx tsx src/setup-auth-secret.ts
```

Keep the secret private. Never put it in a `NEXT_PUBLIC_` variable.
`BETTER_AUTH_URL=http://localhost:5000` is the API origin, without `/api/auth`.
`CORS_ORIGIN` must be the exact frontend origin; use localhost consistently for both apps.

Start PostgreSQL and follow [database setup](../database/README.md), including migration 005.
The backend does not apply migrations automatically.

From `backend/`:

```powershell
npm ci
npm run dev
```

Commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Run TypeScript with tsx and restart on source edits |
| `npm run typecheck` | TypeScript compilation diagnostics without emitting files |
| `npm run typecheck:tests` | Strict typecheck for source and test files without emitting files |
| `npm run build` | Compile src into dist |
| `npm start` | Run compiled dist/server.js; build first |
| `npm run check-db` | Read the demo project using src/check-db.ts; requires the DB |
| `npm run db:status` | Inspect the configured DB's structural migration state |
| `npm run db:migrate -- --database mobg_db` | Apply missing migrations to the explicitly named target; stop on partial schema |
| `npm run setup:auth-secret` | Add a private root secret if absent; no value displayed |
| `npm run seed:accounts -- --database mobg_db` | Provision one selected profile using private seed env |
| `npm run seed:demo -- --database mobg_db` | Provision three accounts and shared/private project fixtures |
| `npx tsx src/check-demo.ts --database mobg_db` | Verify native Login/profile/membership/list/Logout with original password env |
| `npm run test:db` | Create a unique isolated DB, run integration/transaction tests, remove only that test DB |

`GET /api/health` is a server health endpoint, not a database or Login check.
Better Auth owns `/api/auth/*` and is mounted before `express.json()`.
Use `authClient.signIn.email`, `getSession`, and `signOut` in W2; old
`/login`, `/me`, and `/logout` endpoints have been retired.
Real accounts must be provisioned and linked first.

## Shared pool and W2 handoff

Concrete server API, separate seed config, inputs and linking/reconciliation steps:
[W2 account provisioning procedure](../docs/w2-account-provisioning.md).

In a TypeScript service inside src/services, import `{ pool } from "../db.js"`.
The .js extension is intentional for Node ESM after compilation.
src/env.ts loads the repository root .env for both src and dist.
The server closes this pool on shutdown; the standalone check closes it after its query.

Read [API contract](API-CONTRACT.md), [schema mapping](../database/schema-mapping.md),
and [W1 scope / W2 checklist](../docs/better-auth-w1.md).
Better Auth verifies sessions. Pai supplies the lookup from auth ID to the numeric
MobG user ID; Book then checks project membership and Owner/Member permissions.

Implemented exports and examples: [W2 Pai handoff](../docs/w2-pai-handoff.md).
Actual checks and pending team flows: [W2 verification](../docs/w2-pai-verification.md).

## Troubleshooting

- Missing/placeholder auth secret: generate a secret and add it to root .env.
- Missing auth tables: apply migration 005 after 001-004, then restart the backend.
- Browser CORS: match CORS_ORIGIN, Better Auth trusted origin and Next.js URL.
- Connection errors: check Docker, root .env and PostgreSQL port (default 5433).
- Login unavailable: W1 mock users and the SQL demo hash are not Better Auth accounts.

## W1 types and validation

Use src/contracts/api.ts for business DTOs; the frontend re-exports these types.
src/validation.ts supplies runtime schemas and parseRequest for unknown request data.
Current mock GET routes validate IDs, status and pagination; prepared body schemas
will be mounted on write routes in W2/W3. See [verification record](../docs/w1-verification.md).
