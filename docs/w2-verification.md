# W2 verification and handoff (W2-Book-01, W2-Book-02)

Branch: w2-auth-guards-projects-api. Base: 113fd44 (merge of PR #9, Pai's W2 DB work).
Record date: 2026-10-12. This record separates results observed in the team's
terminal from results reported without captured output and from items not verified.

## Scope delivered

- Session guard `requireAuth`: reads the Better Auth session with `auth.api.getSession`
  and `fromNodeHeaders`, resolves the linked MobG profile with `findDomainUserByAuthId`,
  and attaches `req.currentUser` (numeric `userId`, `userName`, `email`).
- Project guard `requireProjectRole("Member" | "Owner")`: validates `:projectId`, calls
  `findProjectMembership`, attaches `req.projectAccess`.
- `GET /api/me`, `GET /api/users`.
- Project routes backed by PostgreSQL: `GET /api/projects` (status filter, pagination),
  `POST /api/projects`, `GET|PATCH|DELETE /api/projects/:projectId`,
  `GET /api/projects/:projectId/members`.
- `ApiError` (401/403/404) mapped to the business error envelope in `server.ts`.

## Where the code lives

| Path | Purpose |
|---|---|
| backend/src/middleware/auth.ts | `createGuards` factory: `requireAuth`, `requireProjectRole` |
| backend/src/guards.ts | Wires the guards to Pai's DB functions |
| backend/src/errors.ts | `ApiError`, `unauthenticated`, `forbidden`, `notFound` |
| backend/src/pgErrors.ts | SQLSTATE helpers (23503 foreign key, 23514 check) |
| backend/src/mappers/project.ts | DB rows to public DTOs (string BIGINT to number, `Date` to ISO) |
| backend/src/routes/me.ts, users.ts, projects.ts | Business routes |
| backend/src/server.ts | Mounts `/api/me`, `/api/users`, `/api/projects`; maps `ApiError` |

Removed: backend/middlewares/authGuard.cjs and backend/routes/tasks.cjs (empty,
unused placeholders from the retired custom-auth plan).

## Behaviour implemented

| Situation | Result |
|---|---|
| No or expired session | 401 `UNAUTHENTICATED` |
| Valid session, no linked MobG profile | 403 `FORBIDDEN` |
| Not a project member, or unknown project | 404 `NOT_FOUND` |
| Member calls an Owner-only route (PATCH/DELETE project) | 403 `FORBIDDEN` |
| Stored role other than Owner/Member | 403, no permission granted |
| Invalid path/query/body | 400 `VALIDATION_ERROR` with `details` |
| `memberIds` contains an unknown user | 400, `details[0].field = "memberIds"`, transaction rolled back |
| PATCH changes only one date | New value is merged with the stored date before `projectDatesAreValid`; 400 if invalid |
| DB CHECK violation on dates (concurrent edit) | 400, same message as the merge check |
| Creator of a project | Owner immediately; `created_by` always comes from the session |

## Observed in the team terminal

- Database mobg_db showed 12 tables after migrations 001-005.
- Account provisioning for demo user (domain ID 1): `users.auth_user_id` equals
  `auth_users.id`, and `auth_accounts` has `provider_id = credential`,
  `account_id = auth user id`, `has_password = t`.
- `POST /api/auth/sign-in/email` followed by `GET /api/me` returned the expected
  profile with a numeric `userId` (reported by Book as matching expectations).
- `GET /api/me` without a cookie returned 401 with the business envelope.
- `POST /api/projects` validation cases returned 400 `VALIDATION_ERROR`:
  unknown `memberIds` (field `memberIds`), `dueDate` equal to `startDate` (field
  `dueDate`), empty `projectName`, and an unrecognized `createdBy` key.

- `npm run typecheck` and `npm run build` in backend completed with no errors
  (2026-10-12, on branch w2-auth-guards-projects-api).

## Reported complete, outputs not captured

Book reported finishing the planned curl checklist. Individual outputs were not
attached to this record. Attach them if the team needs evidence.

- Read routes, status filter, pagination limits, malformed IDs (`1abc`, `0`).
- Create, PATCH (including date merge cases and `dueDate: null`), DELETE and
  follow-up 404, and cascade of related rows.
- A second account as non-member (404), Member (read allowed, PATCH/DELETE 403)
  and Owner.
- Sign-out and expired-session behaviour.
- Public signup stays disabled: `POST /api/auth/sign-up/email` on the serving instance
  was rejected (no success response, no cookie) and no row was created in `auth_users`.

During PATCH/DELETE testing the demo project (ID 1) was deleted on a local database.
`database/seeds/demo.sql` restores sample data, with a new project ID.

## Not verified / open items

- The first run of `seed-accounts.ts` printed the generic failure message although the
  database ended in a fully linked state. The cause was not determined. Pai should
  check which step after linking can fail (for example removing the recovery record).
- `provisioning/schema.ts` and `provisioning/seedQueue.ts` were not reviewed.
- No automated test suite; all checks are manual.
- PATCH merge-then-update is not atomic. The DB CHECK constraint is the backstop.
- The 400 for `bad1` relies on the PostgreSQL constraint name
  `project_members_user_id_fkey`. Confirmed on a local database only.
- Not implemented (W3 and later): members add/remove, tasks, My Tasks, comments,
  activity, dashboard. Dashboard `highPriorityCount` and scope remain pending.
- Frontend login, logout and Topbar still use the local mock until Bar integrates.

## Notes for W3

- A task router mounted under `/api/projects/:projectId/tasks` must be created with
  `Router({ mergeParams: true })`; otherwise `req.params.projectId` is undefined and
  `requireProjectRole` fails.
- Routes that are not project-scoped (for example `GET /api/tasks/mine`) need only
  `requireAuth`.

## Handoff

Frontend integration notes: [W2 frontend handoff](w2-frontend-handoff.md).
Account provisioning: [W2 account provisioning procedure](w2-account-provisioning.md).
