# W2 Pai handoff to Book

Scope: W2-Pai-01 and W2-Pai-02 from MobG_Trello_W2_New.md.
Implemented DB functions follow backend/API-CONTRACT.md section 11.1 and the
member-list contract in section 11.2. These modules do not mount routes.

## Imports available now

```ts
import { findDomainUserByAuthId } from "./services/authDb.js";
import {
  findProjectMembership, listUsers, listProjectMembers,
  listProjectsForUser, getProjectById, createProjectWithMembers,
  updateProject, deleteProject,
} from "./services/projectDb.js";
```

| Function | Use and result |
|---|---|
| findDomainUserByAuthId(authUserId: string) | Verified Better Auth identity to domain profile, or null |
| findProjectMembership(projectId: number, userId: number) | Exact membership with role, or null |
| listUsers() | Profile IDs/names/emails, ordered by name then ID; no credentials |
| listProjectMembers(projectId) | Profiles, role and date_join; Owner first, then name/ID |
| listProjectsForUser({ user_id, status, page, page_size }) | Membership-scoped projects, filter before paging, newest first, plus total_items |
| getProjectById(projectId) | Detail with creator, counts, progress, derived status; null if absent |
| createProjectWithMembers(input) | Committed { project_id }; creator Owner and deduplicated other Members |
| updateProject(projectId, changes) | true/false; optional fields may be cleared with null |
| deleteProject(projectId) | true/false; FK cascade and transaction remove related rows |

`page` is a positive safe integer; `page_size` is 1–50. `status` is null or
`To do | In progress | Done`. An empty page still returns the full filtered count.
`updateProject` accepts project_name, project_description, start_date and due_date;
an empty patch or unsupported key is rejected. Missing project returns false.

## Identity and API responsibilities

Better Auth IDs remain strings. PostgreSQL BIGINT IDs and COUNT results remain
decimal strings. Do not change pg's global parser. Book validates the entire
decimal ID, converts only positive safe integers, and maps snake_case to camelCase.
DATE fields are returned as YYYY-MM-DD strings; project_create_date is a Date
and can be formatted with toISOString(). Progress is a number from 0 to 100.

```ts
// Example inside a Book service AFTER verifying session/request inputs.
const profile = await findDomainUserByAuthId(session.user.id);
if (!profile) throw new Error("UNLINKED_ACCOUNT"); // Book maps to 403.
// Book's converter must reject overflow rather than round IDs.
const userId = toPositiveSafeDomainId(profile.user_id);
const membership = await findProjectMembership(projectId, userId);
if (!membership) {
  throw new Error("NOT_FOUND"); // Book maps nonmember/absent project to 404.
}
if (!["Owner", "Member"].includes(membership.role)) {
  throw new Error("FORBIDDEN"); // Book maps unsupported/insufficient role to 403.
}
const result = await listProjectsForUser({
  user_id: userId, status: null, page: 1, page_size: 10,
});
```

`session`, `projectId` and `toPositiveSafeDomainId` above are supplied by Book's
verified session, validated request and ID mapper; the snippet is not a full route.
Book must apply the agreed role rules before detail/update/delete. Detail and
write functions are deliberately unscoped as specified in the contract. Creator
IDs come from the verified domain profile, never a client's claimed identity.
The DB layer validates ID boundaries; Book's existing validation handles names,
dates and request shapes. Unknown stored roles are returned but must be denied.

```ts
const created = await createProjectWithMembers({
  project_name: "Team project", project_description: null,
  start_date: "2026-10-11", due_date: "2026-11-11",
  created_by: userId, member_ids: selectedMemberIds,
});
// Returned only after COMMIT. Re-read and map to the public project DTO.
const detail = await getProjectById(toPositiveSafeDomainId(created.project_id));
await updateProject(projectId, { project_description: null, due_date: null });
// After Book's Owner guard:
const deleted = await deleteProject(projectId);
```

Errors are propagated unchanged (e.g. 23503 foreign key, 23505 duplicate,
23514 date CHECK). Book chooses HTTP 400/409 and safe messages without exposing
SQL parameters. null means absent, never a swallowed database error.
The shared pool stays open; only standalone CLI/test processes close it.

## Computed fields and transactions

- Progress = round(100 × Done tasks / total tasks); zero tasks = 0.
- No tasks/all To Do: To do; nonempty all Done: Done; all other cases: In progress.
- Aggregate tasks before member/assignee joins so counts cannot multiply.
- Nothing stores a redundant project status/progress field.
- Creation inserts project, Owner and initial Members on one connection/transaction.
  Unknown members roll everything back. Repeated IDs do not duplicate membership.
- Deletion cascades tasks, assignees, comments and memberships in one transaction.
  A downstream failure rolls everything back; other projects are retained.
- Updating all supplied fields is one atomic SQL statement. The existing date
  constraint also checks changes against values already in the row.

## Accounts and fixtures

Follow [account provisioning](w2-account-provisioning.md). The Owner preserves the
selected original demo domain ID. New Member/Outsider profiles use real Better Auth
credentials and explicit domain links. Passwords are private; rerunning does not reset them.

The business seed creates/reuses MobG W2 Shared Project (Owner + Member) and MobG W2
Private Project (Owner only). Outsider belongs to neither. It stops on duplicate
fixture names or changed memberships instead of silently overwriting access.
Each fixture is committed independently; if the second fails, rerunning reuses
the valid first fixture. This is resumable seeding, not a single batch transaction.

## Team verification still required

DB/native Better Auth checks are recorded in [verification](w2-pai-verification.md).
They do not prove HTTP guard behavior or browser cookies/CORS.

| Flow | Owner | Expected |
|---|---|---|
| /api/me, real project routes, HTTP 401/404/403 and ID/DTO mapping | Book | Use the DB functions and verified session; nonmember/absent project is 404 |
| Login -> create -> DB -> refresh/read | Bar + Book + Pai | Creator is Owner; one member row per selected user |
| Member opens shared project; Member/Outsider denied private project | Book + Bar | No private data returned to a nonmember |
| Logout/expired session then call a protected API | Book + Bar | 401, frontend clears old state |
| Account switching | Bar | Previous profile/project data cleared |

Run destructive checks in an isolated test DB. Do not delete existing development
projects or Docker volumes for verification. Task CRUD, member add/remove and Dashboard
are outside these two Pai cards.

## Changed-file inventory

Paths are repository-relative. Existing auth.ts, server.ts, db.ts, migration SQL,
package-lock and frontend files were not edited by this work.

| File | Responsibility |
|---|---|
| backend/src/services/authDb.ts | Auth string ID -> domain profile lookup |
| backend/src/services/projectDb.ts | Membership and project CRUD/list/summary/user/member functions |
| backend/src/services/dbHelpers.ts | Safe domain IDs and transaction handling |
| backend/src/provisioning/accounts.ts | Better Auth seed, explicit domain link and private recovery |
| backend/src/provisioning/demoProjects.ts | Repeatable shared/private business fixtures |
| backend/src/provisioning/seedQueue.ts | Queue seed work before reserving connections |
| backend/src/provisioning/schema.ts | Structural migration preflight |
| backend/src/schema-status.ts | Schema status and explicitly targeted missing migration application |
| backend/src/seed-accounts.ts | Single-account/new-profile/recovery CLI |
| backend/src/seed-demo.ts | Three-account and business-fixture CLI |
| backend/src/check-demo.ts | Native Login/profile/access/list/Logout verification CLI |
| backend/src/setup-auth-secret.ts | Add an absent private root secret without displaying it |
| backend/scripts/set-seed-env.ps1 | User-selected hidden password entry into terminal env |
| backend/test/authDb.test.ts | Lookup/error/transaction tests |
| backend/test/projectDb.test.ts | CRUD, paging, computed fields and rollback tests |
| backend/test/provisioning.test.ts | Credentials, fixtures, sessions, concurrency and recovery tests |
| backend/test/schema.test.ts | Schema preflight and safe ID tests |
| backend/test/run-db-tests.ts | Create/apply/run/remove only the unique test DB |
| backend/tsconfig.test.json | Strict source and test typecheck |
| backend/package.json | Provisioning and verification commands; no new dependencies |
| backend/README.md | Setup/commands and handoff links |
| database/schema-mapping.md | Implemented DB contracts and pending API/frontend status |
| docs/w2-account-provisioning.md | Private manual setup, rerun and recovery steps |
| docs/w2-pai-handoff.md | Usage, Book responsibilities and this inventory |
| docs/w2-pai-verification.md | Actual evidence, pending flows and review results |
| .gitignore | Exclude private reconciliation records |
