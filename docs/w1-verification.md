# W1 verification and handoff

Branch: better-auth-w1. Review baseline selected by Pai: 4054fce.
Record date: 2026-10-11. This record separates user-observed results from code inspection.

## Scope of the remaining W1 work

- Canonical request/response DTOs in backend/src/contracts/api.ts, re-exported by
  web/types/index.ts with type-only imports. UI projections keep existing mock screens.
- Nullable project description/deadline and task description; Priority 1|2|3 and
  To do|In progress|Done; numeric MobG user IDs distinct from Better Auth string IDs.
- Reusable runtime schemas in backend/src/validation.ts for IDs, query parameters,
  dates and business bodies. Mounted W1 project/member mocks use query/path validation.
  Body schemas prepare the seam for future endpoints; no create/edit/delete API is added.
- Request validation uses 400 VALIDATION_ERROR with per-field details. Existing
  mock list also returns typed pagination and full project/member response fields.
- Public registration route redirects to Login, matching the account-provisioning scope.
- Missing project description/deadline displays clear fallback text in mock screens.

## User-observed results in this chat

- Docker db service started successfully.
- npm run check-db used the TypeScript pool and read MobG Demo Project.
- A separate database mobg_w1_auth_check_20261011 was created.
- Migrations 001-004 applied; eight tables observed.
- Demo seed applied; project ID 1, creator ID 1, member user ID 1 and Owner recorded.
- Migration 005 applied; twelve tables observed.
- The same project/creator/member IDs and Owner remained after 005.
- users schema showed numeric identity user_id, nullable password_hash/auth_user_id,
  UNIQUE auth_user_id and FK to auth_users(id) ON DELETE RESTRICT.
- Original comments/projects/project_members/tasks/task_assignees/sessions FKs
  still referenced users(user_id), as shown in the user's schema screenshot.
- Backend started on port 5000 using temporary environment overrides pointing
  to the isolated database; /api/health returned status OK.
- Next.js opened /login on port 3000.
- User confirmed empty fields, invalid email, wrong password and simulated network
  error messages; successful mock Login reached Dashboard and password was masked.
- User confirmed Dashboard/Projects/My Tasks navigation, shared layout and refresh.

## Final checks after the remaining code changes

- Backend npm run typecheck and npm run build passed on the latest code.
- Frontend tsc --noEmit --incremental false passed on the latest code.
- Agent checked 12 local API requests: health, filtered/paginated mock lists,
  known/unknown member paths, malformed/unsafe IDs, invalid/repeated pagination,
  invalid status and Better Auth /api/auth/ok; all expected HTTP results passed.
- /register redirected to /login and the resulting page returned HTTP 200.
- Agent checked 28 schema cases plus trimmed-name normalization, pagination defaults
  and RequestValidationError behavior. Valid/null values, length limits, date
  ordering, leap days, year zero, invalid priorities/statuses, empty PATCH bodies,
  duplicate/empty assignees, unsafe IDs and forged creator fields behaved as expected.
  These were temporary verification scripts, not a committed automated test suite.
- Pai refreshed Projects and confirmed GEN Project displayed No description and
  No due date correctly after the nullable mock/type changes.

The six W1 cards are ready for closure based on the checks above, the existing
business contracts, and the completed DTO/validation handoff. Share these documents
with Bar and Book. The W1 mock responses do not establish W2 authentication/permissions.

## Handoff

Concrete server API, separate seed config, inputs and linking/reconciliation steps:
[W2 account provisioning procedure](w2-account-provisioning.md).

Canonical DTOs: backend/src/contracts/api.ts. Frontend imports from @/types.
Schemas + parseRequest: backend/src/validation.ts. A failed parse throws
RequestValidationError; server maps it to the business error envelope.
In W2/W3, validate bodies before writes and verify authorization separately.
When PATCH changes only one project date, merge with stored values and call
projectDatesAreValid on the complete pair. Schemas alone cannot check membership.
Use parameterized DB queries and the validated session-to-domain-user link.

Real accounts, profile lookup, guards, Login/logout/session integration and real
business data remain W2/W3. Responsive remains W4. Dashboard metrics still marked
pending in the API contract require agreement in W2.

Only the isolated test DB was migrated during this guided check. Backend environment
overrides live in its terminal; persist real local configuration when preparing W2.
Teammates should read backend/README.md and this record before continuing.
