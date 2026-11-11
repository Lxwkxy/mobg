# MobG Backend

Express 5 + TypeScript (ESM), a shared PostgreSQL pool and Better Auth 1.7.7.
Session guards, `GET /api/me`, `GET /api/users` and the project routes are backed by
PostgreSQL. The project task routes (`/api/projects/:projectId/tasks`) are implemented and
covered by HTTP tests; they are not verified from the web UI yet. Comments, activity,
dashboard, My Tasks and member add/remove endpoints are not implemented yet.
Frontend Login uses Better Auth. Public signup, email verification and password reset
are described in [account setup](../docs/account-registration.md).
The frontend has a project API client; Dashboard/My Tasks
still use mock data. Do not infer full browser integration from DB/HTTP tests.

## Local setup

Use Node.js 22 or newer (the implementation environment uses Node.js 24).
Copy the repository root `.env.example` to `.env` and set your database credentials.
For an existing `.env`, add `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`, and set
`CORS_ORIGIN=http://localhost:3000` for Next.js.

From the repository root, install backend dependencies first. If you just copied
`.env.example`, open `.env` privately and remove only the `BETTER_AUTH_SECRET` line
whose value is the example placeholder. Keep any existing real secret unchanged.
Then generate the missing secret without displaying it:

```powershell
cd backend
npm ci
npm run setup:auth-secret
```

Keep the secret private. Never put it in a `NEXT_PUBLIC_` variable.
`BETTER_AUTH_URL=http://localhost:5000` is the API origin, without `/api/auth`.
`CORS_ORIGIN` must be the exact frontend origin; use localhost consistently for both apps.

Start PostgreSQL and follow [database setup](../database/README.md), through migration 007.
Set up SMTP for real registration and password reset emails. Start Mailpit for the
registration HTTP tests. See [account email setup](../docs/account-registration.md#real-email-delivery).
The backend does not apply migrations automatically.

From `backend/`:

```powershell
npm ci
npm run dev
```

Commands:

| Command | Purpose |
|---|---|
| `npm run dev` | Run TypeScript with tsx and restart on source edits (no type checking) |
| `npm run typecheck` | TypeScript diagnostics without emitting files |
| `npm run build` | Compile src into dist |
| `npm start` | Run compiled dist/server.js; build first |
| `npm run check-db` | Read the demo project using src/check-db.ts; requires the DB |
| `npm run db:status -- --database NAME` | Inspect the exact target's migration structure |
| `npm run db:verify -- --database NAME` | Read-only relationship audit and independent W4 summary oracle |
| `npm run seed:demo -- --database NAME --w5` | Provision/verify accounts and seed W5 in a separate `mobg_w5_demo_*` DB |
| `npm run db:backup -- --database SOURCE --restore-database NEW_NAME` | Private backup plus verified restore to a new `mobg_w5_restore_*` DB |
| `npm run test:demo-rehearsal` | Disposable W5 setup, native auth, seed rerun and Docker backup/restore |

Run `npm run typecheck` before committing; `npm run dev` does not report type errors.
`GET /api/health` is a server health endpoint, not a database or Login check.

## Source layout

| Path | Purpose |
|---|---|
| `src/server.ts` | App setup. Better Auth is mounted before `express.json()`; mounts the business routers and the error handler |
| `src/auth.ts`, `src/env.ts`, `src/db.ts` | Better Auth config, environment loading, shared PostgreSQL pool |
| `src/contracts/api.ts` | Canonical business DTO types (re-exported by the frontend) |
| `src/validation.ts` | Zod schemas and `parseRequest` for unknown request data |
| `src/guards.ts`, `src/middleware/auth.ts` | `requireAuth` and `requireProjectRole("Member" \| "Owner")` |
| `src/errors.ts`, `src/pgErrors.ts` | `ApiError` and PostgreSQL error helpers |
| `src/mappers/` | DB rows to public DTOs (BIGINT strings to numbers, dates, roles) |
| `src/routes/` | `me.ts`, `users.ts`, `projects.ts`, `tasks.ts` |
| `src/services/` | Database functions (`authDb.ts`, `projectDb.ts`, `taskDb.ts`, `dbHelpers.ts`) |
| `src/provisioning/`, `src/seed-accounts.ts` | Account provisioning (not part of the serving app) |

## Authentication and permissions

- Better Auth owns `/api/auth/*` (native request/response shapes). Use
  `authClient.signIn.email`, `getSession` and `signOut` from the frontend.
- `requireAuth` reads the session with `auth.api.getSession` and `fromNodeHeaders`,
  resolves `users.auth_user_id` with `findDomainUserByAuthId`, and sets
  `req.currentUser`. No session gives 401; a session without a linked profile gives 403.
- `requireProjectRole` validates `:projectId`, calls `findProjectMembership`, and sets
  `req.projectAccess`. Non-member or unknown project gives 404; insufficient role or an
  unknown stored role gives 403.
- Apply guards in this order: `router.use(requireAuth)`, then
  `requireProjectRole(...)` on each `:projectId` route. Details and permission matrix:
  [API contract](API-CONTRACT.md).

To add a route: validate input with `parseRequest`, call a function from `services/`,
map the row in `mappers/`, and throw `ApiError` for business errors. Express 5
forwards rejected promises from async handlers to the error handler.

Nested routers that read `:projectId` from a parent path (for example tasks under
`/api/projects/:projectId/tasks`) must use `Router({ mergeParams: true })`, then
`router.use(requireAuth)` and `requireProjectRole(...)` per route. Routes that are not
project-scoped (for example `/api/tasks/mine`) use only `requireAuth`.

Create test accounts with the
[account provisioning procedure](../docs/w2-account-provisioning.md). The SQL demo
seed is domain data only and cannot log in.

## Shared pool

In a TypeScript service inside `src/services`, import `{ pool } from "../db.js"`.
The `.js` extension is intentional for Node ESM after compilation.
`src/env.ts` loads the repository root `.env` for both `src` and `dist`.
The server closes this pool on shutdown; standalone scripts close it themselves.

## Troubleshooting

- Missing/placeholder auth secret: generate a secret and add it to root .env.
- Missing auth tables: apply migration 005 after 001-004, then restart the backend.
- Browser CORS: match CORS_ORIGIN, Better Auth trusted origin and Next.js URL.
- Connection errors: check Docker, root .env and PostgreSQL port (default 5433).
- 401 from every protected route while testing with curl: the cookie file path may be
  wrong (curl silently ignores a missing `-b` file), or the sign-in request lacked
  `-H "Origin: http://localhost:3000"`.
- 403 from `/api/me`: the signed-in auth user is not linked to a `users` row.
- Login unavailable: W1 mock users and the SQL demo hash are not Better Auth accounts.

## Further reading

[API contract](API-CONTRACT.md), [schema mapping](../database/schema-mapping.md),
[W1 scope](../docs/better-auth-w1.md), [W2 verification](../docs/w2-verification.md),
[frontend handoff](../docs/w2-frontend-handoff.md).

W3 task DB reads/CRUD are in `src/services/taskDb.ts`, and the task HTTP routes are in
`src/routes/tasks.ts` (mounted at `/api/projects/:projectId/tasks`, mapper in
`src/mappers/task.ts`). The API is covered by automated HTTP tests; browser CRUD has not
been checked yet. See [W3 Pai handoff](../docs/w3-pai-handoff.md) for DB signatures and the
joint checklist, [W3 DB verification](../docs/w3-pai-verification.md) and
[W3 API verification](../docs/w3-verification.md) for actual test results.

From `backend`, run `npm run test:db -- taskDb.test.ts` for the task DB tests,
`npm run test:db -- taskRoutes.test.ts` for the task HTTP tests (they start `src/server.ts`
on a random port against the isolated database), or `npm run test:db` for the full suite. Both create and verify a uniquely named
`mobg_w2_test_<pid>_<random>` database before fixtures run, and remove only that
database afterward. The W2 prefix is retained for compatibility with existing tests.

W5 seed and backup prerequisites, exact target checks, private password entry,
retention/recovery and cleanup are in the [database guide](../database/README.md).
Actual results and remaining Book/Bar/manual dependencies are in the
[W5 verification record](../docs/w5-db-verification.md).
