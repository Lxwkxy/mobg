# W3 verification and handoff (W3-Book-01, W3-Book-02)

Branch: w3-task-api (suggested name; use the actual branch). Base: eb2e21a (merge of PR #15, Pai's W3 task DB work).
Record date: 2026-11-05. This record separates results observed by the implementing
agent, results reported from the team's terminal, and items not verified.

## Scope delivered

- Task read API behind the W2 guards: `GET /api/projects/:projectId/tasks` (optional
  `status` filter) and `GET /api/projects/:projectId/tasks/:taskId`.
- Task write API: `POST`, `PATCH` and `DELETE` under the same path.
- Row mapper from Pai's `TaskRow` to the public `Task` DTO.
- HTTP integration tests that start the real server against the isolated test database.

No change was made to `taskDb.ts`, the W2 guards, `errors.ts`, migrations or the frontend.

## Where the code lives

| Path | Purpose |
|---|---|
| backend/src/routes/tasks.ts | The five task routes. `Router({ mergeParams: true })`, `requireAuth` for the whole router, `requireProjectRole("Member" \| "Owner")` per route |
| backend/src/mappers/task.ts | `mapTask` (string BIGINT to number via `domainIdToNumber`, `Date` to ISO) and the status maps `To Do / Doing / Done` <-> `To do / In progress / Done` |
| backend/src/server.ts | Imports the router and mounts it at `/api/projects/:projectId/tasks`, before the `/api` 404 handler |
| backend/test/taskRoutes.test.ts | 7 HTTP tests (see below) |

Reused unchanged: `guards.ts`, `middleware/auth.ts`, `errors.ts` (`ApiError`, `notFound`),
`pgErrors.ts`, `services/taskDb.ts`, `services/projectDb.ts` (`listProjectMembers`),
`validation.ts` (`createTaskSchema`, `updateTaskSchema`, `taskListQuerySchema`, `urlIdSchema`).

## Behaviour implemented

| Situation | Result |
|---|---|
| No or expired session | 401 `UNAUTHENTICATED` |
| Valid session, no linked MobG profile | 403 `FORBIDDEN` |
| Invalid `:projectId` or `:taskId` (for example `1abc`) | 400 `VALIDATION_ERROR` |
| Not a project member, or unknown project | 404 `NOT_FOUND` |
| Task does not exist in the project of the URL (including a task of another project) | 404 `NOT_FOUND` (GET, PATCH and DELETE) |
| Member calls DELETE | 403 `FORBIDDEN`; Owner deletes |
| Project with no tasks | 200 with `tasks: []` |
| `status` query outside `To do / In progress / Done`, or an unknown query key | 400 |
| POST body with unknown keys (for example `createdBy`, `status`) | 400 (strict schema) |
| POST/PATCH `assigneeIds` empty, duplicated, or containing a non-member | 400, `details[].field = "assigneeIds"` |
| POST `dueDate` null or not a real calendar date; empty/over-200 title; priority not 1-3 | 400 |
| PATCH with no editable field, `dueDate: null`, or unknown key | 400, nothing written |
| PATCH sends only some fields | Only those fields change; absent keys are not written |
| PATCH `taskDescription: null` | Clears the description |
| PATCH `assigneeIds` | Replaces the whole set after every user is checked against `listProjectMembers` |
| POST success | 201; status starts as `To do`; `createdById` is the session user; response is read back after COMMIT |
| DELETE success | 200 `Task deleted`; assignees and comments removed by FK cascade; repeat returns 404 |
| FK violation (23503) while writing assignees | 400 on `assigneeIds` (user removed after the membership check; transaction already rolled back) |
| Any other DB error | Propagated to the error handler: 500 `INTERNAL_ERROR`, no SQL in the response |

## Automated tests (backend/test/taskRoutes.test.ts)

The suite provisions Owner, Member and Outsider through Better Auth, seeds the shared
(Owner + Member) and private (Owner only) fixture projects, starts `src/server.ts` as a
child process on a random port against the isolated test database, signs in over HTTP and
calls the API with real cookies. It runs through the existing `npm run test:db` runner.

| Test | Covers |
|---|---|
| authentication, membership and ID validation come first | 401 without cookie; 404 for Outsider (GET and POST) and unknown project; 400 for `1abc` project and task IDs |
| empty project returns an empty list; invalid status is rejected | `[]` response; 400 for `status=Doing` and unknown query key |
| Member creates a task as To do with the session creator; invalid input is rejected | 201 DTO (status, creator, dates, assignees); forged `createdBy`/`status`; no/duplicate/non-member assignees; null and impossible dates; empty and long title; bad priority; no row created by any rejected request; Member cannot create in a project they do not belong to |
| PATCH changes only sent fields, clears with null, replaces assignees, rejects bad input | Status-only and priority-only changes leave every other field identical; status filter; `null` description; assignee replacement; 400 cases leave the task unchanged; Outsider and unknown task get 404 |
| a task is only reachable through its own project | GET, PATCH and DELETE of a private-project task through the shared-project URL return 404 and change nothing |
| only an Owner deletes; related rows are removed and repeats return 404 | Member 403, Outsider 404, no session 401; cascade verified in SQL for comments and assignees; repeat GET/DELETE 404 |
| project summary reflects task changes made through the API | `totalTasks` and `completedTasks` of the project change after create and status change |

## Observed results

Observed by the implementing agent (Linux sandbox, PostgreSQL 16, Node.js with the repo
lockfile), on base eb2e21a plus the four changed files:

- `npm run typecheck`, `npm run typecheck:tests` and `npm run build`: no errors.
- `npm run test:db`: 39 tests passed, 0 failed (32 existing + 7 new).

Reported from the team terminal (Book, Windows):

- `npm run typecheck` and `npm run typecheck:tests`: no errors.
- `npm run test:db -- taskRoutes.test.ts`: 7 of 7 passed against the isolated database
  `mobg_w2_test_31644_c2f043c1`.

## Not verified / open items

- No browser or frontend check. W3-Bar-01/02 still use mock task data, so cookie/CORS
  behaviour, refresh, account switching and the create -> open -> edit -> status -> delete
  path from the web are untested.
- Not run on the team machine yet: the full `npm run test:db` and `npm run build`
  (the 39-test result above is from the agent's sandbox only). CI on the pull request
  gives the result on PostgreSQL 17.
- No manual curl/PowerShell checklist was run; evidence is the automated HTTP tests only.
- The membership check and the write are separate database operations. Removing a member
  does not remove their `task_assignees` rows, and member removal is not implemented yet,
  so the FK backstop only covers deleted users. W4 member removal must follow the policy
  in docs/w3-pai-handoff.md (reject sole assignee and last Owner, remove assignments in
  the same transaction).
- PATCH and DELETE load the task, then write in a second operation. A concurrent delete
  between the two returns 404 from `updateTask`/`deleteTask` (handled), but concurrent
  PATCHes are last-write-wins per field, except `assigneeIds`, which Pai's function locks.
- The test picks a random port in 5100-5899 and needs `CORS_ORIGIN` to match the Origin it
  sends (default `http://localhost:3000`). A port clash would fail the suite; rerun it.
- The list has no pagination and only the `status` filter, as agreed for W3. Keyword and
  priority search, My Tasks, comments, activity and dashboard are W4 or later.
- Task `isOverdue` comes from the database (Asia/Bangkok, false when Done); the API does
  not recompute it.

## Docs still to update

- backend/API-CONTRACT.md section 12 and the header note still list the task HTTP routes
  as pending.
- backend/README.md and the root README.md describe tasks as contract-only.
- database/schema-mapping.md ("Implementation Status") still says Task HTTP routes are
  pending.
- docs/w3-pai-handoff.md and docs/w3-pai-verification.md list API/permission checks as
  waiting for Book; they can point to this record for the API part.

## Notes for Bar (W3-Bar-01, W3-Bar-02)

All endpoints require the session cookie (`credentials: "include"`) and return the
business envelope. Success bodies:

| Method | URL | Role | Success |
|---|---|---|---|
| GET | /api/projects/:projectId/tasks?status= | Owner, Member | 200 `{ success: true, tasks: Task[] }` |
| GET | /api/projects/:projectId/tasks/:taskId | Owner, Member | 200 `{ success: true, task: Task }` |
| POST | /api/projects/:projectId/tasks | Owner, Member | 201 `{ success: true, task: Task }` |
| PATCH | /api/projects/:projectId/tasks/:taskId | Owner, Member | 200 `{ success: true, task: Task }` |
| DELETE | /api/projects/:projectId/tasks/:taskId | Owner | 200 `{ success: true, message: "Task deleted" }` |

- Create body: `taskTitle`, `priority` (1-3), `dueDate` (`YYYY-MM-DD`), `assigneeIds`
  (at least one distinct project member); `taskDescription` optional. Send no creator or
  status fields.
- PATCH: send only the fields that changed. `taskDescription: null` clears it; `dueDate`
  cannot be null; `assigneeIds` replaces the whole list.
- Show per-field errors from `error.details[].field` and `error.details[].message`.
- After create, status change or delete, re-fetch the project: `derivedStatus` and
  `progressPercent` are computed on every read.
- Assignees in a task are ordered by name, then ID; the UI shows the first two and `+N`.

## Handoff

- Pai: nothing to change in `taskDb.ts`. Please review the 23503 handling and the open
  items above, and join the cross-team flow in docs/w3-pai-handoff.md once Bar connects.
- Bar: endpoints and bodies are in the table above.
- Trello: W3-Book-01 and W3-Book-02 are implemented and covered by automated HTTP tests.
  Keep them out of Done until the web flow has been checked together with Bar and Pai.
