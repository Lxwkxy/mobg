# W4 verification and handoff (W4-Book: My Tasks, members, Dashboard)

Branch `w4-api-my-tasks-and-dashboard`. Builds on Pai's W4 DB functions (docs/w4-pai-handoff.md).
Record date: 2026-11-13. The full rules are in backend/API-CONTRACT.md (10.5, 10.6, 10.9, section 8);
this file is the integration sheet for Bar plus what was and was not verified.

## Endpoints for Bar

All three need a Better Auth session cookie (`credentials: "include"`).
Common errors on every endpoint: no/expired session → `401 UNAUTHENTICATED`;
session without a linked MobG profile → `403 FORBIDDEN`; bad query/body → `400 VALIDATION_ERROR`
with `details: [{ field, message }]`.

### 1. My Tasks — `GET /api/tasks/mine`

| Request | Result |
|---|---|
| `GET /api/tasks/mine` | `200` every task assigned to me in projects I am still a member of |
| `GET /api/tasks/mine?status=In%20progress` | `200` only that status (`To do`, `In progress`, `Done`) |
| No assigned tasks, or filter matches nothing | `200` `{ "success": true, "tasks": [] }` |
| `?status=Doing`, `?userId=2`, `?q=x`, `?priority=1`, `?status=Done&status=To%20do` | `400 VALIDATION_ERROR` |

```json
{
  "success": true,
  "tasks": [
    {
      "taskId": 12, "taskTitle": "Prepare database demo", "taskDescription": null,
      "priority": 1, "dueDate": "2026-11-20", "isOverdue": false,
      "createdAt": "2026-11-10T03:00:00.000Z",
      "projectId": 3, "projectName": "Web Programming 1", "status": "To do",
      "createdById": 1, "createdByName": "Demo Owner",
      "assignees": [ { "userId": 2, "userName": "Demo Member" } ]
    }
  ]
}
```

Order: `dueDate`, then `taskId`. The task object is identical to the project task API.
Clearing the status filter = call again without `status`.
Search and priority filters are **not** part of the API (contract section 11.3, W4 decision:
status-only); the UI must not send them.

### 2. Members — `POST` / `DELETE /api/projects/:projectId/members[/:userId]` (Owner only)

| Request | Result |
|---|---|
| `POST` `{ "userId": 4 }` | `201` `{ success, member: { userId, userName, email, role: "Member", joinDate } }` |
| User already a member | `409 CONFLICT`, `details: [{ "reason": "ALREADY_MEMBER" }]` |
| Unknown user | `400 VALIDATION_ERROR`, `details: [{ "field": "userId", ... }]` |
| `DELETE .../members/4` | `200` `{ "success": true, "message": "Member removed" }` |
| User is not a member | `404 NOT_FOUND` |
| Removing the last Owner | `409`, `details: [{ "reason": "LAST_OWNER" }]` |
| User is the only assignee of any task (also `Done`) | `409`, `details: [{ "reason": "SOLE_ASSIGNEE", "taskId", "taskTitle", "status" }, ...]` ordered by `taskId` |
| Caller is a Member | `403 FORBIDDEN`; caller not in project or unknown project → `404` |

On success the user is removed from the project and from every task of it in one
transaction; they get `404` on that project at once, and its tasks leave their My Tasks and Dashboard.
After a `SOLE_ASSIGNEE` 409 the UI should show the listed tasks so the Owner can reassign them first.

How authorization works (PR #25 review fixes, 2026-11-14):

- `GET`, `POST` and `DELETE` members share one router and one middleware chain (`requireAuth` +
  membership lookup), mounted before `/api/projects`, so each request checks the session once.
  `requireAuth` is also idempotent, so nested routers never repeat the lookup. `GET` is open to Owner
  and Member; `POST`/`DELETE` reject a Member with `403` before touching the database.
- The service then takes the project lock and rechecks the caller (`actorUserId` from the session) in
  the same transaction as the write: not in the project → `404`, no longer Owner → `403`. A caller who
  loses Owner or leaves while waiting for the lock writes nothing. `ALREADY_MEMBER`, `LAST_OWNER` and
  `SOLE_ASSIGNEE` behave as before.
- The `201` member (name, email, role, joinDate) is read and mapped inside the add transaction before
  COMMIT; if that fails the insert rolls back. There is no second read after the insert.

### 3. Dashboard — `GET /api/dashboard?limit=5`

```json
{
  "success": true,
  "summary": {
    "projectCount": 2, "taskCount": 4,
    "statusCounts": { "todo": 1, "inProgress": 1, "done": 2 },
    "overdueCount": 0, "highPriorityCount": 1
  },
  "highPriorityTasks": [ { "...": "task object, same as My Tasks" } ]
}
```

- Scope: every task in projects where I am currently Owner/Member (not only my assignments); each task counted once.
- `overdueCount`: due date before today (Asia/Bangkok) and not Done. `highPriorityCount`: priority 1 and not Done.
- `highPriorityTasks`: priority 1, not Done, ordered by `dueDate` then `taskId`; `limit` 1–100, default 5.
- No projects → all zeros and `highPriorityTasks: []`. `?limit=0`, `?limit=101`, `?limit=abc`, `?userId=…` → `400`.

### 4. Dashboard page wiring for Bar — which endpoint feeds what

The Dashboard page needs two calls. `GET /api/dashboard` does **not** return per-project progress.

| Dashboard part | Endpoint | Fields |
|---|---|---|
| Summary numbers (projects, tasks, To do / In progress / Done, overdue, high priority) | `GET /api/dashboard` | `summary.projectCount`, `summary.taskCount`, `summary.statusCounts.{todo,inProgress,done}`, `summary.overdueCount`, `summary.highPriorityCount` |
| Important tasks list | `GET /api/dashboard?limit=5` | `highPriorityTasks[]` (same task object as My Tasks) |
| Progress per project (cards / bars) | `GET /api/projects` (paginated, `pageSize` max 50) | `projects[].progressPercent`, plus `totalTasks`, `completedTasks`, `derivedStatus` |

- `progressPercent = ROUND(100 × completedTasks / totalTasks)`, where completed means status `Done`
  (`In progress` does not count). Rounding is half away from zero: 1 of 3 → `33`, 2 of 3 → `67`.
- A project with no tasks has `progressPercent: 0` (no division by zero), `totalTasks: 0`.
- The value is an integer 0–100 computed by the API; the UI should display it as-is, not recompute it.
- `GET /api/projects/:projectId` returns the same `progressPercent` for one project.
- After changing a task status, re-fetch both endpoints; neither pushes updates.

## Where the code lives

| Path | Purpose |
|---|---|
| backend/src/routes/myTasks.ts | `GET /api/tasks/mine`, mounted at `/api/tasks` |
| backend/src/routes/members.ts | `GET` / `POST` / `DELETE` members under one middleware chain |
| backend/src/services/projectDb.ts | `addProjectMember` / `removeProjectMember`: Owner recheck under the project lock, 201 member prepared before COMMIT |
| backend/src/routes/dashboard.ts | `GET /api/dashboard` |
| backend/src/mappers/dashboard.ts | `DashboardSummaryRow` → `DashboardSummary` |
| backend/src/validation.ts | `taskListQuerySchema` (status only), `dashboardQuerySchema` (`limit`), `addMemberSchema` |
| backend/src/contracts/api.ts | `DashboardResponse` now includes `highPriorityTasks: Task[]` |
| backend/test/w4Routes.test.ts | HTTP tests for all three |

## Automated tests (backend/test/w4Routes.test.ts)

Real server child process, real Better Auth cookies, isolated test DB, run by `npm run test:db`.
Covers: 401/403 on every new route; member add (roles, validation, duplicates, unknown user,
Member-only access afterwards); member removal (roles, unknown member, loss of access and
re-adding, last Owner, sole assignee including Done, other projects untouched, concurrency,
safe 500 with rollback); My Tasks (rejected keys, empty list, several projects, order, status
filter, removed membership, unknown role); Dashboard (rejected/invalid query, zeros, counts
across statuses/overdue/high priority/multi-assignee, membership change, important-task list
order, limit, Done excluded, member scope, removal).

Added for the PR #25 review (2026-11-14):

- w4Routes: a caller who is demoted or removed while its `POST`/`DELETE` waits for the project lock
  gets `403`/`404` and the member list is unchanged (4 cases, lock held from the test, wait confirmed in
  `pg_stat_activity`); `GET /api/projects` `progressPercent` for an empty project (`0`) and a partly done
  one (0 → 33 → 67, `In progress` not counted), also via `GET /api/projects/:projectId`.
- w4Db: actor checks for outsider / Member / unknown role / unknown project; demote or remove the actor
  while add/remove waits for the lock (writes nothing); a throwing `prepare` rolls the insert back and
  the same user can be added afterwards.
- guards.test.ts: `requireAuth` running twice on one request looks the session up once.

Second review round (2026-11-14):

- `PATCH /api/projects/:projectId/tasks/:taskId` rechecks the caller's membership after the project
  lock, in the update transaction. A Member removed while the PATCH waits gets `404` and the task row,
  status and assignees in the DB stay as they were (HTTP test with a passing control case, plus a DB
  test for `updateTask(..., actor)`: outsider, wrong project, unknown role, removed during the wait).
- Lock tests in w4Routes and w4Db share `test/helpers/projectLock.ts`: on a failure before COMMIT it
  rolls back first, destroys the connection if ROLLBACK fails, and waits (max 10 s) for the blocked
  request to finish, so CI shows the real assertion instead of hanging. A test checks that path.

## Observed results

- 2026-11-13, implementing agent on Windows: `npm run typecheck` and `npm run typecheck:tests` pass.
- 2026-11-13, team terminal (Windows) with PostgreSQL up: `npm run test:db` → 90 tests, 84 pass,
  5 fail, 1 skipped. **All 19 tests in w4Routes.test.ts pass**, including the updated Dashboard
  tests and the new `highPriorityTasks` test; w4Db, taskRoutes and the other DB suites pass too.
- The 5 failures are all in registration.test.ts: four cannot reach the mail catcher on
  `127.0.0.1:8025` (compose.mail.yml was not running) and one (`403 !== 401`) is in the same
  email-dependent flow. They are unrelated to W4 and need a rerun with the mail service up.

## Not verified / open items

- No browser check; Bar's My Tasks and Dashboard pages still need wiring and a manual pass.
- Search (`q`) and priority filters from the W4 checklist are deferred: on 2026-11-14 the user
  decided to keep the single `status` filter for now. Adding them later needs new DB conditions
  from Pai first, then schema, route, contract and HTTP test changes here.
- Dashboard `summary` and `highPriorityTasks` come from two queries, not one snapshot.
