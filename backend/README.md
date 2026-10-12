# MobG Backend

Express 5 + TypeScript (ESM), a shared PostgreSQL pool and Better Auth 1.7.7.
Session guards, `GET /api/me`, `GET /api/users` and the project routes are backed by
PostgreSQL. Tasks, comments, activity and dashboard endpoints are not implemented yet.
The frontend Login is still a local mock until Bar integrates the auth client.

## Local setup

Use Node.js 22 or newer (the implementation environment uses Node.js 24).
Copy the repository root `.env.example` to `.env` and set your database credentials.
For an existing `.env`, add `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET`, and set
`CORS_ORIGIN=http://localhost:3000` for Next.js.

Generate a random secret locally, then copy it into `.env`:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
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
| `npm run dev` | Run TypeScript with tsx and restart on source edits (no type checking) |
| `npm run typecheck` | TypeScript diagnostics without emitting files |
| `npm run build` | Compile src into dist |
| `npm start` | Run compiled dist/server.js; build first |
| `npm run check-db` | Read the demo project using src/check-db.ts; requires the DB |

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
| `src/routes/` | `me.ts`, `users.ts`, `projects.ts` |
| `src/services/` | Database functions (`authDb.ts`, `projectDb.ts`, `dbHelpers.ts`) |
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
