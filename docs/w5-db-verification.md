# W5-Pai-01 — database preparation and verification

Date: 2026-11-09 (Asia/Bangkok). Branch: `feat/db-demo-verification`.
Fixed point: `5f9e9e86f07f59d73fb26928056abd1d4462a48b` (main/origin/main after fetch).
Spec: [W5-Pai-01](specs/MobG_Trello_Tasks_Detailed.md), with the user's instructions
to implement only the available Database/Docker work and preserve Book/Bar ownership.
Used the repository `implement` skill and its final two-axis `code-review` workflow.

**The complete card remains open.** DB tooling and isolated verification are ready;
joint browser flows, actual existing-account Login and teammate guide rehearsal
are not claimed. `gh` was unavailable in PATH/standard installation, so GitHub Issue
comments were not read. The supplied local spec was used. No team messages or card
status changes were made. No push, PR or merge was performed.

## Delivered work

- Reused Better Auth provisioning, W2 fixture creation, migrations, schema inspection,
  existing DB functions and the isolated test runner.
- Added migration 006 for durable seed metadata, 4 W5 projects / 8 tasks, exact rerun
  checks, maintained reference date and an explicit deletion sandbox. No business
  API or UI was added; W4 definitions are unchanged.
- Added read-only `db:verify` with FK/reference/credential checks and independent
  JavaScript calculations compared to actual Dashboard/project/My Tasks/High functions.
- Added Docker `pg_dump` + fresh-target `pg_restore` verification; credentials remain
  inside the private archive and process memory. Updated existing setup/provisioning/
  schema docs instead of creating another competing setup guide.
- Added `test:demo-rehearsal`, which generates disposable passwords in memory and
  exercises real CLIs, then cleans only the databases it created.

## Actual environment

| Component | Observed version |
|---|---|
| Node.js / npm | 24.21.0 / 11.19.0 |
| Docker CLI / Engine | 29.7.2 / 29.7.2 |
| Docker Compose | 5.4.0 |
| PostgreSQL server / pg_dump / pg_restore | 17.11 (Debian 17.11-1.pgdg13+2), `postgres:17` image |
| Better Auth / Express / pg | 1.7.7 / 5.2.1 / 8.23.1 |
| TypeScript / tsx / dotenv / zod | 5.9.3 / 4.23.15 / 18.0.6 / 4.6.5 |

Docker Desktop was initially stopped; it was started, then the existing Compose DB
was started with its existing volume. No volume was removed or recreated.

## Read-only audit of the development DB

Target `mobg_db`: migrations 001–005 complete; 006 missing and **not applied here**.
12 public tables, 14 foreign keys and 0 public stored functions. There are 3 domain
users, 3 linked auth identities, 3 credential accounts and no unlinked profiles/auth
identities. Eight projects and one task were inspected. No FK or logical relationship
issues, normalized email/status duplicates, missing statuses/Owners/assignees, invalid
roles or invalid linked credentials were reported. The connection check passed.

Independent comparison returned no mismatches for Dashboard, project progress/status,
My Tasks or High-priority lists. Development totals by domain user:

| user_id | Projects | Tasks | To Do | Doing | Done | Overdue | High not Done |
|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 7 | 1 | 1 | 0 | 0 | 1 | 1 |
| 2 | 6 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |

These are data/mapping checks, **not proof that the user's existing passwords log in**.
Those passwords were neither requested in chat nor changed. Existing-account Login
can be checked later using the original passwords through the hidden local prompt.

## W5 fixture and demonstration order

In a new database, run the exact sequence in [database/README.md](../database/README.md).
`seed:demo -- --database NAME --w5` first retains the initial SQL sample and the W2
Shared/Private projects, then adds:

| Project | Membership / data | Expected initial result |
|---|---|---|
| MobG W5 Main Demo | Owner + Member; 5 tasks below | 1/5 Done = 20%, In progress |
| MobG W5 Completed | Owner only; 2 Done tasks, Medium and Low | 100%, Done |
| MobG W5 Empty | Member account is Owner here; no tasks | 0%, To do |
| MobG W5 DELETE Sandbox | Owner + Member; 1 High To Do task with 2 assignees and a comment | 0%, To do; disposable |

Main Demo tasks use a retained reference date `D` (default: the server's Bangkok date):

| Task | Status | Priority | Due | Assignees |
|---|---|---|---|---|
| Overdue High - shared | To Do | High | D-2 | Owner + Member |
| Today High - member | Doing | High | D | Member |
| Done High - excluded from alerts | Done | High | D-1 | Owner |
| Future Medium | To Do | Medium | D+7 | Owner |
| Future Low | Doing | Low | D+3 | Owner + Member |

The outsider has no membership. Owner/Member are project roles, not global account
privileges. The Member account owning Empty demonstrates this distinction.
All referenced people are linked Better Auth users, not invented unlinked assignees.

Proposed demo sequence (not yet agreed/rehearsed jointly with the team):

1. Login as Owner; inspect Shared/Private and the W5 projects. Contrast Member's
   access and the Outsider's empty list. The fixture's accounts have native auth evidence.
2. Compare Main Demo's five tasks to progress 20%; inspect Completed 100% and Empty 0%.
3. Show the shared overdue task counts only once despite two assignees, the task due
   today is not overdue, and High Done is excluded from important tasks.
4. Compare My Tasks to all-project Dashboard scope. Member sees some tasks assigned
   only to Owner in Dashboard, while My Tasks includes only their assignments.
5. After Book's W4 API and Bar's task screens are connected, change a sandbox task's
   status and compare UI values with `db:verify`; do not use mock counts as evidence.
6. Use **only** `MobG W5 DELETE Sandbox` / `DELETE ME - sandbox task` for deletion.
   Cancel first (manual browser check still pending), then delete; verify its comment/
   assignees cascade and Main Demo remains intact. Delete the sandbox project last.
7. Backup and restore into a new test DB, verify, then use a fresh demo DB for another
   run; the seed intentionally rejects a changed/deleted recorded fixture.

In the recorded fresh rehearsal, projects were Main=4, Completed=5, Empty=6,
DELETE Sandbox=7; W5 task IDs were 2–9 and the disposable task was 9. These IDs apply
only to that already-cleaned temporary database. Use the seed's printed IDs for each
new demo. No teammate was sent these IDs; this report is the prepared handoff.

At initial seed day, the full CLI dataset (including initial SQL/W2 fixtures) gives:

| Account | Projects | Tasks | To Do | Doing | Done | Overdue | High not Done |
|---|---:|---:|---:|---:|---:|---:|---:|
| Owner | 6 | 9 | 4 | 2 | 3 | 1 | 4 |
| Member | 4 | 6 | 3 | 2 | 1 | 1 | 3 |
| Outsider | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

These counts change after edits or as dates advance. The unfinished D-2 task remains
overdue; a rerun preserves the reference date and does not rewrite dates. Use the
independent auditor for the current totals. Tests of W5 alone expect fewer projects
because the existing SQL/W2 fixtures are outside that module's scope.

## Executed checks

| Layer | Execution and observed result |
|---|---|
| Source / tests / build | `npm run typecheck`, `typecheck:tests`, `build`: PASS |
| Full suite | `npm run test:db`: 60/60 PASS after review fixes; 45 DB/native cases, 14 cases in the HTTP file and 1 filesystem safety case |
| DB/native tests | 45/45 PASS: W2 provisioning, W3/W4 DB behavior and W5 fixture/integrity checks |
| Archive file safety | 1/1 PASS: exclusive-create collision preserves the existing backup; failed new writes clean only their own incomplete file |
| HTTP tests | Existing `taskRoutes.test.ts`: 14/14 PASS within that suite; actual Express server, sign-in cookies, guards, CRUD, isolation/error mapping and summary refresh. No W4 endpoints were fabricated |
| W5 native auth / CLI | `test:demo-rehearsal`: PASS; 3 disposable accounts Login → session/domain mapping → role/project lists → Logout; seed runs twice without duplicate IDs or password resets |
| W5 edit safety | PASS: concurrent reruns return the same fixture; changed title/reference date and intentional deletion are rejected; the edit stays; sandbox comment/assignee cascade leaves Main Demo intact |
| W2/W5 CLI edit safety | PASS after review fix: rename/delete the recorded W2 Private fixture, rerun `seed:demo --w5`, and verify nonzero exit with no duplicate, overwrite or recreation. W2 IDs/snapshots are checked before provisioning/name-based creation |
| Independent oracle | PASS on fresh W5 DB and existing `mobg_db`; raw rows independently recomputed, not copied from the aggregate query |
| Negative targets | PASS: seed mismatch, backup source mismatch, non-test restore name and existing allowed-prefix restore DB are rejected |
| Backup / restore | PASS: PostgreSQL custom archive, fresh restore, all public rows/schema/indexes/sequences/functions equal, 14 FK checks and relationship audit pass |
| Browser | Not run for W5. No claim of UI values, browser Login, cancel/delete dialogs or mobile behavior |
| Human/team | Teammate clean setup, agreed demo sequence and joint UI-to-DB rehearsal not performed |

The initial new test failed before the W5 module existed, then passed after implementation.
A rehearsal caught an empty optional reference date; it was fixed and rerun successfully.
A test-script type error was fixed before the final typecheck/build. No failed run was
reported as a pass.

Full-suite database: `mobg_w2_test_117344_e5cea47f` (removed by runner).
Final rehearsal source: `mobg_w5_demo_126796_6b7545ba`; restore:
`mobg_w5_restore_126796_6b7545ba` (both removed by their owning invocation).
The private dump remains outside Git in the local OS temp `mobg-private-backups`
directory. No dump content, credentials, hashes, cookies or tokens are in this report.

Restored row counts: users 3; auth_users 3; auth_accounts 3; projects 7;
project_members 10; tasks 9; task_assignees 12; comments 2; task_statuses 3;
demo_seed_runs 1; sessions/auth_sessions/auth_verifications 0. Total public tables: 13.

## Remaining dependencies and card closure

| Checklist area | Status / remaining action |
|---|---|
| DB consistency / Dashboard / seed / backup | Implemented and verified independently in isolated databases |
| Actual development-account Login | Mapping is valid; user must enter original passwords locally to check Login. No reset was done |
| Book W4 | My Tasks, Dashboard/important tasks and member add/remove HTTP integration still missing in inspected code; services already exist |
| Bar W3/W4 | Task screens/details/forms/delete dialogs and Dashboard/My Tasks real-data integration still pending; existing mockData cannot validate DB results |
| Joint demonstration | Compare UI with DB after real mutations once API/UI are ready; select/agreed flow with team |
| Teammate guide validation | A teammate must follow the guide in a separate environment and report any ambiguous steps |
| Handoff | Prepared in this report; not sent to teammates and no card status changed |

Therefore W5-Pai-01 cannot yet be closed as a whole. The remaining work is integration,
real-account verification and human rehearsal; no Book/Bar feature was implemented
to make the checklist look complete.

## Review

Two independent agents reviewed `git diff 5f9e9e86f07f59d73fb26928056abd1d4462a48b...HEAD`
after implementation commit `b80b716`, then rechecked the corrections in the working
tree. Their reviews were read-only; actual test execution above was by the implementing
agent. Review fixes were committed separately after tests passed.

## Standards

Two P2 findings were fixed and rechecked:

- Exclusive archive creation now occurs before cleanup is armed. Existing files
  survive `EEXIST`; the regression covers preservation and cleanup of an owned partial file.
- Backend setup now establishes the directory and installs dependencies before the
  secret helper. Both guides explain removing only the example placeholder while
  preserving an existing real secret.

**Standards: 2 findings fixed; 0 remaining.** No additional material baseline smells.

## Spec

One P2 finding was fixed and rechecked: the W5 manifest originally covered only W5
projects, allowing the legacy W2 helper to recreate renamed/deleted W2 fixtures.
Metadata now retains W2 IDs/snapshots; the CLI validates recorded identities and all
fixture contents before provisioning or name-based creation, then reuses those IDs.
The CLI regression proves edited/deleted W2 data is preserved without recreation.

**Spec: 1 finding fixed; 0 remaining actionable findings.** No evidenced scope creep;
API/UI, existing-account Login and human-rehearsal dependencies remain explicitly open.
