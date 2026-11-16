# W5-Book-01 — Backend audit, API documentation and report

Date: 2026-11-16 (Asia/Bangkok). Base: `main` at `39462c8` (after PR #25, W4 API).
Scope: every business endpoint from W1–W4 plus the Better Auth routes the web app uses.
Contract: [backend/API-CONTRACT.md](../backend/API-CONTRACT.md). Setup: [backend/README.md](../backend/README.md).
Raw results: [w5-api-audit-results.md](w5-api-audit-results.md) (169 rows, one per request).

## 1. Summary

| Item | Result |
|---|---|
| Automated API audit on Pai's W5 seed | **169/169 PASS** after one fix (162/166 before; 4 failures, 1 a real bug). Rerun after the PR #26 review changes (full envelope check, seed-relative due date): still 169/169 |
| Existing suite `npm run test:db` | Before and after: 101 tests, 100 pass, 1 skipped, 0 fail. The regression for the bug was added inside the existing W4 "POST members" test (section 5). `typecheck`, `typecheck:tests`, `build` pass |
| Bug found | Request body over 100 kB returned `500 INTERNAL_ERROR`. Now `413 VALIDATION_ERROR`; unreadable charset/encoding `415 VALIDATION_ERROR` |
| Permission checks | Non-member, wrong role, other project's task ID, tampered `userId`/`projectId` query, expired session, logged-out cookie and unlinked profile all denied with the contract code. No case returned another account's data |
| Web flow (in-app browser, by Book) | Login → project list → project/task pages → tampered URLs → edit task status → progress updates → Logout → protected page goes to Login: matches API |
| Joint flow with Bar | **Not done yet.** Needs a session with Bar (section 7) |
| Teammate follows setup guide | **Not done yet.** Needs a teammate (section 7) |
| Query problems for Pai | None found. Dashboard numbers equal Pai's W5 table exactly (section 4), so no sample input/output was sent |

## 2. How the audit was run

`npm run test:api-audit` (new, `backend/test/run-api-audit.ts`) does this in one command:

1. Creates a new `mobg_w5_demo_audit_<pid>_<random>` database and applies migrations 001–007.
2. Loads `database/seeds/demo.sql`, then runs Pai's `seed-demo --w5` and `db:verify` on it
   (same seed and oracle Pai used in [w5-db-verification.md](w5-db-verification.md)).
3. Starts the real `src/server.ts` on a random port and signs in Owner, Member and Outsider with
   disposable passwords that exist only in memory. Responses are checked for leaked secrets.
4. Sends every request in the results file and compares the status code and body. Every business
   response must use the section 9 envelope: success → `success: true`; error → `success: false`
   with the expected `error.code` and a non-empty `error.message`. Better Auth (`/api/auth/*`) and
   `/api/health` keep their own shapes and are checked by status and their own fields.
   Dates that decide `isOverdue` are computed from the seed's `reference_date` (as in Pai's
   fixture), so the audit gives the same result on any day.
5. Drops only the database it created. Exit code 0 = all PASS.

```powershell
cd backend
npm run test:api-audit
npm run test:api-audit -- --out ../docs/w5-api-audit-results.md   # also writes the Markdown table
```

Requires Docker DB running and root `.env` (same as `npm run test:db`).

## 3. Endpoint table: success / invalid / not found / empty / no permission

Number of checks per area: projects 44, tasks 42, members 17, dashboard 11, my tasks 10,
delete policy 9, session 9, search 8, auth 6, body 5, me 4, users 2, health 1, routing 1.

| Endpoint | Success | Invalid data → 400 | ID not found → 404 | Empty result → 200 | No permission |
|---|---|---|---|---|---|
| `GET /api/me` | linked profile `{userId,userName,email}` only | — | — | — | no cookie / forged / expired / after logout → 401; unlinked → 403 |
| `GET /api/users` | 3 users, no secrets | — | — | — | no cookie → 401 |
| `GET /api/projects` | Owner 6, Member 4; filter, paging | status `Bad`, `page=0`, `pageSize=51`, `1abc`, `userId=`, repeated key | — | Outsider `[]`, page past end `[]` | no cookie → 401 |
| `GET /api/projects/:id` | progress 20 / 100 / 0 | `abc`, `0`, `-1`, `1.5`, `1abc`, > safe int | `999999` | — | non-member → 404 (same as unknown); no cookie → 401 |
| `POST /api/projects` | 201, creator Owner, name trimmed | missing/blank/long name, due = start, `2026-02-30`, unknown/duplicate `memberIds`, forged `createdBy` | — | — | no cookie → 401 |
| `PATCH /api/projects/:id` | rename, clear `dueDate` | `{}`, due before stored start, start after stored due | `999999` | — | Member → 403, non-member → 404 |
| `DELETE /api/projects/:id` | 200, cascade | — | already deleted → 404 | — | Member → 403 |
| `GET …/members` | Owner first, 5 fields | — | — | — | non-member → 404 |
| `POST …/members` | 201 Member | unknown user, forged `role` | — | — | Member → 403, non-member → 404; duplicate → 409 `ALREADY_MEMBER` |
| `DELETE …/members/:userId` | 200, access lost at once | `abc` | not in project → 404 | — | Member → 403; 409 `SOLE_ASSIGNEE` / `LAST_OWNER` |
| `GET …/tasks` | 5 tasks, due-date order, overdue rules | `status=Doing`, `priority=1` | — | Empty project `[]` | non-member → 404 |
| `GET …/tasks/:taskId` | detail | `abc` (member) | `999999`; task of another project → 404 | — | non-member → 404 even for `abc` |
| `POST …/tasks` | 201 `To do`, creator from session | 11 cases (title, priority, dueDate, assignees, forged `status`/`createdById`) | — | — | non-member → 404 |
| `PATCH …/tasks/:taskId` | status, assignees, clear description | `{}`, `dueDate:null`, `[]` assignees, `Doing`, unknown field | other project's task → 404 | — | non-member → 404; expired session → 401 and nothing written |
| `DELETE …/tasks/:taskId` | Owner 200; comments/assignees cascade | — | deleted / other project → 404 | — | Member → 403, non-member → 404 |
| `GET /api/tasks/mine` | only my assignments (Owner 8, Member 4) | `userId`, `projectId`, `q`, bad/repeated `status` | — | Outsider `[]` | no cookie → 401 |
| `GET /api/dashboard` | equals Pai's table | `limit=0/101/abc`, `userId=` | — | Outsider all 0 | no cookie → 401; unlinked → 403 |
| `GET /api/search` | case-insensitive, my projects only | blank, missing, 201 chars | — | Outsider; `%` is literal | no cookie → 401; project I'm not in stays hidden |

ID and filter tampering: changing a project ID, task ID or adding `userId`/`projectId`/`q` to a
query never widened the result. Non-member → 404 (does not reveal that the project exists);
the task ID must belong to the project in the URL; list endpoints reject extra query keys with 400.

## 4. Dashboard vs Pai's database numbers

On the untouched seed (columns: projects/tasks/To do/In progress/Done/overdue/high not Done):

| Account | Pai's table (w5-db-verification.md) | `GET /api/dashboard` |
|---|---|---|
| Owner | 6/9/4/2/3/1/4 | 6/9/4/2/3/1/4 |
| Member | 4/6/3/2/1/1/3 | 4/6/3/2/1/1/3 |
| Outsider | 0/0/0/0/0/0/0 | 0/0/0/0/0/0/0 |

`highPriorityTasks` lists only priority 1 and not Done, ordered by due date (first is
"Overdue High - shared"); the Done High task is excluded.

## 5. Problems found and fixed

| # | Problem | Cause | Fix | Retest |
|---|---|---|---|---|
| 1 | `POST` with a JSON body over 100 kB → `500 INTERNAL_ERROR` (and a server error log) | The error handler only knew `entity.parse.failed`; other `express.json()` errors (`entity.too.large`, `charset.unsupported`, `encoding.unsupported`) fell through to 500 | `src/server.ts`: keep body-parser's 4xx status (413/415) with code `VALIDATION_ERROR` and a fixed message (no raw error text) | Regression case in `test/w4Routes.test.ts`: fails on the old code (500), passes now. Audit 169/169 |

The other three failures in the first audit run were mistakes in my audit expectations, not
backend bugs: Dashboard was measured after the audit had created an extra project (now
measured on the untouched seed first), and a `utf-7` body is valid for the JSON parser
(now uses an unknown charset). No query issue was found, so nothing was sent to Pai.

Observed and documented, not changed (they match the contract or are harmless):

- An unknown path under a protected prefix (for example `/api/tasks/123` or
  `/api/projects/1/unknown`) answers 401 without a session and 404 with one, because the
  router checks the session first. `/api/nope` is always 404.
- `GET /api/users` lists every user (name and email) to any linked account, for member selection.
- Comment and activity endpoints are contract-only and return 404.

## 6. Web flow (Book, in-app browser, 2026-11-16)

Backend on a persistent `mobg_w5_demo_book_*` DB seeded with Pai's W5 fixture; web on
`localhost:3000`; Member account.

| Step | Web | API seen in network log | Matches contract |
|---|---|---|---|
| Login | goes to `/dashboard` | `POST /api/auth/sign-in/email` 200 | yes |
| Dashboard / My Tasks pages | still show **mock data** (`web/lib/mockData.ts`) | none | not wired yet (Bar) |
| Projects | 4 projects; Main 20%, 5 tasks; Empty 0% | `GET /api/projects` 200 | yes |
| Main Demo tasks | overdue only on D-2 task; Done not overdue | `GET …/tasks` 200 | yes |
| `/projects/5` (not a member) | "Project not found." | 404 | yes |
| `/projects/4/tasks/7` (task of project 5) | "Task not found." | 404 | yes |
| `/projects/abc` | "Invalid project ID." | — | yes |
| Edit "Future Medium" status → Done | saved | `PATCH …/tasks/5` 200 | yes; project 20% → 40% (2/5) |
| Logout, then open `/projects/4` | back to `/login` | `POST /api/auth/sign-out` 200, `GET /api/me` 401 | yes |

## 7. Not done yet (needs people)

| Checklist item | Status / what to do |
|---|---|
| Walk the web flow together with Bar | Pending. Use section 6 as the script; add Dashboard/My Tasks once Bar wires them to `/api/dashboard` and `/api/tasks/mine` |
| A teammate follows the setup guide for at least one flow | Pending. Ask them to follow [backend/README.md → Quick start](../backend/README.md#quick-start-one-flow) and report any unclear step |
| Send results, API docs and this report to the team | This report and the updated contract are ready; sending is up to Book |

## 8. Backend structure (for the team and the demo)

```
request ─▶ server.ts ─▶ /api/auth/*  → Better Auth (native responses)
                     └▶ express.json() ─▶ routes/*.ts
                           requireAuth (session → MobG user)  ── 401 / 403
                           requireProjectRole("Member"|"Owner") ── 404 / 403
                           parseRequest(zod schema)            ── 400
                           services/*Db.ts (Pai's SQL)         ── rows (snake_case, BIGINT as string)
                           mappers/*.ts                        ── API JSON (camelCase, numbers)
                     └▶ error handler → { success:false, error:{ code, message, details? } }
```

| Route file | Mount | DB functions it calls (Pai) |
|---|---|---|
| `routes/me.ts` | `/api/me` | `findDomainUserByAuthId` (inside `requireAuth`) |
| `routes/users.ts` | `/api/users` | `listUsers` |
| `routes/projects.ts` | `/api/projects` | `listProjectsForUser`, `createProjectWithMembers`, `getProjectById`, `updateProject`, `deleteProject` |
| `routes/members.ts` | `/api/projects/:projectId/members` | `listProjectMembers`, `addProjectMember`, `removeProjectMember` |
| `routes/tasks.ts` | `/api/projects/:projectId/tasks` | `listTasksByProject`, `getTaskById`, `createTask`, `updateTask`, `deleteTask`, `listProjectMembers` |
| `routes/myTasks.ts` | `/api/tasks` | `listTasksForAssignee` |
| `routes/dashboard.ts` | `/api/dashboard` | `getDashboardSummary`, `listHighPriorityTasks` |
| `routes/search.ts` | `/api/search` | `searchVisibleProjectsAndTasks` |

How a route calls Pai's DB function (example `PATCH …/tasks/:taskId`):

```ts
const { projectId } = req.projectAccess!;                // set by requireProjectRole
const { taskId } = await loadTask(projectId, req.params.taskId); // getTaskById(projectId, taskId) → 404 if other project
const body = parseRequest(updateTaskSchema, req.body);   // 400 on bad input
await updateTask(taskId, { status_name: toDbStatus[body.status] },
  { project_id: projectId, user_id: req.currentUser!.userId }); // false → 404 (rechecked under project lock)
res.json({ success: true, task: mapTask(await getTaskById(projectId, taskId)) });
```

Rules when calling them: IDs from the session/guard only (never from the body); status
names converted with `toDbStatus` / `toApiStatus` (`To do`↔`To Do`, `In progress`↔`Doing`);
BIGINT strings converted with `domainIdToNumber`; `null`/`false` means not found;
FK/unique errors are mapped to 400/409 by constraint name; anything else becomes 500.

## 9. Suggested demo order (Book's part, about 5 minutes)

1. **Structure** — the diagram in section 8: guard → validation → Pai's DB function → mapper.
2. **Login / session** — sign in as Member; `GET /api/me` returns only `{userId,userName,email}`.
3. **Permissions** — Member opens Main Demo (200), Completed (404, not a member), tries to delete a
   task (403). Change a task ID in the URL to another project's task → 404.
4. **Rules** — Main Demo progress 20%; change one task to Done → 40%. Overdue only for unfinished
   past-due tasks; Dashboard numbers equal Pai's table.
5. **Delete policy** — remove Member from Main → 409 `SOLE_ASSIGNEE` with the task list; delete the
   sandbox task (comment and assignees cascade), remove Member from Sandbox, delete Sandbox.
6. **Evidence** — run `npm run test:api-audit` (169/169) and show [the results](w5-api-audit-results.md).
