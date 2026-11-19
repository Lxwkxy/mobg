# MobG Backend

The Express API uses TypeScript, PostgreSQL, and Better Auth. Follow the
[repository setup](../README.md#setup) to run it locally. For seeded Owner,
Member and Outsider accounts, follow the [isolated demo setup](../database/README.md#prepare-a-persistent-isolated-demonstration-database).

## Commands

Run from `backend/`.

| Command | Purpose |
|---|---|
| `npm run dev` | Start the API and restart on source edits |
| `npm run typecheck` | Check source types |
| `npm run typecheck:tests` | Check test types |
| `npm run build` then `npm start` | Compile and run the API from `dist/` |
| `npm run check-db` | Check the database connection and list projects |
| `npm run test:db` | Run the database and HTTP suites |
| `npm run test:api-audit` | Exercise the API against a disposable seeded database |
| `npm run test:demo-rehearsal` | Rehearse demo setup, authentication, and backup/restore with Docker |

`GET /api/health` checks whether the server is running. Use `npm run check-db`
to check its database connection.

## Tests

Start PostgreSQL with the root `.env` configured. The test runner creates a
temporary database and removes it after the run. To run one suite, pass its
filename, for example `npm run test:db -- taskRoutes.test.ts`. Start Mailpit
before running the [registration checks](../docs/account-registration.md#checks).

To save an API audit report, run `npm run test:api-audit -- --out FILE` and
choose a local output path. The audit creates and removes its own database.

For the optional real browser-to-database comment check, install the root
Playwright dependency with `npm ci` and have Google Chrome installed. Start the [web test server](../web/README.md#browser-checks)
and run the task route suite with its URL.

```powershell
# From backend/, with the web server already running
$env:COMMENTS_WEB_URL = 'http://127.0.0.1:3100'
npm run test:db -- taskRoutes.test.ts
```

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
| `src/routes/` | `me.ts`, `users.ts`, `projects.ts`, `members.ts`, `tasks.ts`, `myTasks.ts`, `dashboard.ts`, `search.ts` |
| `src/services/` | Database services (`authDb.ts`, `projectDb.ts`, `taskDb.ts`, `dashboardDb.ts`, `searchDb.ts`, `dbHelpers.ts`) |
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
[account provisioning procedure](../database/README.md#provision-or-recover-a-single-account). The SQL demo
seed is domain data only and cannot log in.

## Shared pool

In a TypeScript service inside `src/services`, import `{ pool } from "../db.js"`.
The `.js` extension is intentional for Node ESM after compilation.
`src/env.ts` loads the repository root `.env` for both `src` and `dist`.
The server closes this pool on shutdown; standalone scripts close it themselves.

## Troubleshooting

- Missing/placeholder auth secret: generate a secret and add it to root .env.
- Missing auth tables: run `npm run db:migrate -- --database NAME` against your configured database, then restart the API.
- Browser CORS: match CORS_ORIGIN, Better Auth trusted origin and Next.js URL.
- Connection errors: check Docker, root .env and PostgreSQL port (default 5433).
- 401 from every protected route while testing with curl: the cookie file path may be
  wrong (curl silently ignores a missing `-b` file), or the sign-in request lacked
  `-H "Origin: http://localhost:3000"`.
- 403 from `/api/me`: the signed-in auth user is not linked to a `users` row.
- Login unavailable for SQL-seeded users: provision credentials using the [database guide](../database/README.md#prepare-a-persistent-isolated-demonstration-database).
