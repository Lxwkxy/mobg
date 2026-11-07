# W3 verification and handoff (W3-Book-01, W3-Book-02)

PR #16, branch w3-task-api. Base: eb2e21a (merge of PR #15, Pai's W3 task DB work).
First review was made against 39ff18a; the follow-up changes recorded below sit on top of it.
Record date: 2026-11-07. This record separates results observed by the implementing
agent, results reported from the team's terminal, and items not verified.

## Scope delivered

- Task read API behind the W2 guards: `GET /api/projects/:projectId/tasks` (optional
  `status` filter) and `GET /api/projects/:projectId/tasks/:taskId`.
- Task write API: `POST`, `PATCH` and `DELETE` under the same path.
- Row mapper from Pai's `TaskRow` to the public `Task` DTO.
- HTTP integration tests that start the real server against the isolated test database.

No change was made to `taskDb.ts`, the W2 guards, `errors.ts`, migrations or the frontend.

## Review follow-up (changes on top of 39ff18a)

1. `routes/tasks.ts`: a foreign-key violation becomes a 400 `assigneeIds` error only when
   the code is 23503 **and** the constraint is `task_assignees_user_id_fkey` (a user that
   disappeared after the membership check). FK violations on the project, creator, status
   or task, and every other database error, are passed on to the error handler (500).
2. New tests for the three cases: assignee FK gives 400; project/creator/status/task FK
   (and an FK without a constraint name) are not assignee errors; unknown database errors
   give 500 without SQL or secret text. A further test checks that the five constraint
   names the route relies on exist in the migrated schema.
3. `taskRoutes.test.ts`: the fixed due date `2026-12-01` is replaced by dates computed at
   run time (Bangkok today + 30 and + 60 days), so `isOverdue` assertions cannot expire.
4. New HTTP tests: PATCH of title, date and description leaves every other field
   unchanged; anonymous detail/PATCH/DELETE, a garbage cookie and an expired session give
   401; a valid session without a linked MobG profile gives 403 on every task route.
5. Documentation that still described the Task API as pending now separates "API
   implemented and HTTP-tested" from "web flow not checked" (see "Docs updated").

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
Due dates are computed at run time. Server stderr is captured and shown only if startup fails.

| # | Test | Covers |
|---|---|---|
| 1 | authentication, membership and ID validation come first | 401 without cookie; 404 for Outsider (GET and POST) and unknown project; 400 for `1abc` project and task IDs |
| 2 | empty project returns an empty list; invalid status is rejected | `[]` response; 400 for `status=Doing` and an unknown query key |
| 3 | Member creates a task as To do with the session creator; invalid input is rejected | 201 DTO; forged `createdBy`/`status`; no/duplicate/non-member assignees; null and impossible dates; empty and long title; bad priority; rejected requests create no row |
| 4 | PATCH changes only sent fields, clears with null, replaces assignees, rejects bad input | Status-only and priority-only changes; status filter; `null` description; assignee replacement; 400 cases change nothing; Outsider and unknown task get 404 |
| 5 | a task is only reachable through its own project | GET, PATCH and DELETE through another project's URL return 404 and change nothing |
| 6 | only an Owner deletes; related rows are removed and repeats return 404 | Member 403, Outsider 404, no session 401; cascade checked in SQL; repeats 404 |
| 7 | project summary reflects task changes made through the API | `totalTasks` and `completedTasks` change after create and status change |
| 8 | the foreign keys the route relies on keep their expected names | `pg_constraint` check of the five FK names and the tables they join |
| 9 | only the assignee user FK becomes a 400 on create; other database errors are a safe 500 | Trigger-simulated errors on create: assignee user FK gives 400; project, creator and status FK, an FK without constraint name, the task FK of `task_assignees`, a duplicate-key error, `P0001` and a connection-class code (08006) give 500 with exactly the generic body and no SQL/secret/constraint text; no task row is left |
| 10 | PATCH maps only the assignee user FK to 400; other database errors are a safe 500 and change nothing | Same on PATCH, including the assignee constraint name raised without `assigneeIds` in the request (500); the task is unchanged afterwards |
| 11 | PATCH of title, date or description leaves every other field unchanged | Starts from status `In progress` and priority 1; each PATCH (title with spaces, due date, description, empty description) keeps the other fields identical |
| 12 | anonymous requests, garbage cookies and an expired session get 401 on detail and PATCH | GET/PATCH/DELETE without cookie; a made-up session cookie; a real session whose `expires_at` is moved to the past (GET /api/me, list, detail, PATCH, DELETE) |
| 13 | a valid session without a linked MobG profile gets 403 on every task route | Better Auth account created without a `users` link; `/api/me`, list, detail, POST, PATCH, DELETE all 403; the task is unchanged |

Database errors in tests 9 and 10 are simulated with triggers that exist only for the
duration of a call, in the isolated test database created by the runner. A mutation check
confirmed the tests are effective: with the previous `tasks.ts` (any 23503 becomes 400),
tests 9 and 10 fail and the other 11 pass.

## Observed results

Observed by the implementing agent on the follow-up changes (Linux sandbox, PostgreSQL 16,
dependencies from the repo lockfile), from the PR head 39ff18a plus the changes above:

- `npm run typecheck`, `npm run typecheck:tests` and `npm run build`: no errors.
- `npm run test:db`: **45 tests passed, 0 failed, 0 skipped** (32 existing + 13 task route
  tests). No `mobg_w2_test_*` database remained afterwards.
- `git diff --check`: no findings.

Reported earlier from the team terminal (Book, Windows), on head 39ff18a **before** the
follow-up changes: `npm run test:db` 39 of 39 passed and `npm run build` completed without
errors. That result does not cover the follow-up changes and is not reused for them.

## Not verified / open items

- The follow-up changes have not been run on the team machine or in CI yet. The 45-test
  result above comes from the agent's sandbox (PostgreSQL 16); CI runs PostgreSQL 17.
- No browser or frontend check. W3-Bar-01/02 still use mock task data, so cookie/CORS
  behaviour, refresh, account switching and the create -> open -> edit -> status -> delete
  path from the web are untested.
- The assignee FK mapping is tested with trigger-simulated errors and a schema check of the
  constraint name. A real race (a user deleted between the membership check and the
  insert) was not reproduced with concurrent requests. In that case the 400 lists every
  requested assignee ID, because the database does not say which one is missing.
- The expired-session case is simulated by moving `auth_sessions.expires_at` into the past,
  the same technique as the W2 provisioning tests; natural expiry was not waited for.
- The membership check and the write are separate database operations. Removing a member
  does not remove their `task_assignees` rows, and member removal is not implemented yet,
  so the FK backstop only covers deleted users. W4 member removal must follow the policy
  in docs/w3-pai-handoff.md (reject sole assignee and last Owner, remove assignments in
  the same transaction).
- PATCH and DELETE load the task, then write in a second operation. A concurrent delete
  between the two returns 404 from `updateTask`/`deleteTask` (handled); concurrent PATCHes
  are last-write-wins per field, except `assigneeIds`, which Pai's function locks.
- The test picks a random port in 5100-5899 and needs `CORS_ORIGIN` to match the Origin it
  sends (default `http://localhost:3000`). A port clash would fail the suite; rerun it.
- The list has no pagination and only the `status` filter, as agreed for W3. Keyword and
  priority search, My Tasks, comments, activity and dashboard are W4 or later.
- Task `isOverdue` comes from the database (Asia/Bangkok, false when Done); the API does
  not recompute it.

## Docs updated

These files described the Task API as pending and now say: API implemented and covered by
HTTP tests, web flow not verified. Historical records dated before W3 were left as written.

- backend/API-CONTRACT.md (header note, section 10 status, 11.3 note, section 12 readiness)
- backend/README.md and README.md (status, source layout, test commands, next steps)
- database/schema-mapping.md ("Implementation Status")
- docs/w2-frontend-handoff.md ("Not available yet")
- docs/w3-pai-handoff.md and docs/w3-pai-verification.md (status notes and checklist owners)

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
