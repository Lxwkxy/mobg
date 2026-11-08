# W4 Pai verification

Date: 2026-11-08. Branch: `w4-pai-db`. Review fixed point:
`8ae513ee8b464f841edc3d4fdd2fb0d6bbf3d09f`.
Review includes working-tree changes and new files; pre-existing `.agents/`,
`skills-lock.json`, and `web-local-backup/` are excluded and preserved.

## Environment and isolation

- Fetched origin; main already includes W3 DB and task API. No other branch merged.
- Docker Engine 29.7.2, existing `mobg-db-1`, PostgreSQL 17, existing `mobg_mobg_pgdata` volume.
- Started the existing stopped container, retained development database and data.
- Every database test uses the existing runner: create unique `mobg_w2_test_<pid>_<hex>`,
  verify `current_database()` before fixtures/migrations, apply 001–005, then drop only that test database.
- No new migration or development-data mutation. Native Windows sandbox needed escalation for localhost DB access.
- `gh` was unavailable; Git refs and the user-provided specs were inspected, not GitHub issue comments.
- The final optional read-only `db:status -- --database mobg_db` audit was not executed:
  automatic approval review could not complete because of its usage limit. This was a
  review-service failure, not an unsafe-action finding. No claim is made about a final
  development-schema audit or an independent post-suite database inventory.

## TDD evidence

Each new behavior was checked failing before implementation:
My Tasks/add/remove functions missing; empty/nonmember assignees incorrectly accepted;
deterministic concurrent removal/PATCH incorrectly fulfilled; Dashboard module and important list missing;
HTTP membership-race rejection returned 500 instead of 400; My Tasks overflowed at 320px;
unknown membership roles exposed tasks before the review fix.
After each implementation the focused tests passed. Rollback/concurrency tests also cover existing behaviors.

`backend/test/w4Db.test.ts`: 12 tests cover My Tasks scope/order/filter/joins,
Dashboard hand-counted fixture/zero/overdue, important-list order/default/limit,
member add FK/duplicate, all removal rejections including Done, successful removal,
rollback, simultaneous removals, deterministic removal/PATCH race, create/removal race,
18 concurrent add/remove/replacement operations and unknown-role access denial. W3 tests retain progress/rounding,
dynamic status IDs, native constraints, BIGINT handling, commit rollback and lifecycle coverage.
`backend/test/taskRoutes.test.ts`: one new HTTP test simulates membership loss after route
validation on POST/PATCH and checks 400/rollback. Its trigger is not claimed as real
concurrent HTTP execution; the actual transaction race is in `w4Db.test.ts`.

## Commands and results

Final `npm run test:db`: **58 passed, 0 failed, 0 skipped** (about 21 seconds).
The runner verified isolated database `mobg_w2_test_104636_117abaac` and exited 0 after its cleanup.
Focused DB W4: 12/12 passed. Focused W3 task HTTP suite: 14/14 passed.
Final backend source/test typechecks and build passed. Final web typecheck, lint and production build passed.
`git diff --check` passed. No commits/pushes/PRs/merges were made.

From `backend/`:

```powershell
npm run typecheck
npm run typecheck:tests
npm run build
npm run test:db
# Focused examples
npm run test:db -- w4Db.test.ts
npm run test:db -- taskRoutes.test.ts
```

From `web/`: `npm run typecheck`, `npm run lint`, `npm run build`.
Initial build could not fetch Google Fonts inside the sandbox. With network access,
Turbopack repeatedly reported that its CSS loader child process exited before connection.
Stopping dev alone did not fix it. Clearing only the verified generated `web/.next`
directory allowed compilation/typecheck/prerender to finish. Next.js then returned a
one-time security advisory exit; its requested retry completed **exit 0** without
application/dependency changes. This supports stale generated build state as the cause
of the child-process failure; it is not a proven diagnosis of a Next.js internal defect.
Next.js 16.4.0 emitted a known-vulnerability advisory. No upgrade was performed in this W4 task.

## Responsive evidence and limitations

Existing My Tasks page uses mock task data. Browser harness intercepts `/api/me` with
synthetic success/error responses. Long names are DOM layout fixtures; no real account or data is changed.
`web/test/responsive.mjs` runs headless Chrome with local Playwright:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3100
# In a second shell, point at an installed Playwright/Playwright Core module if not in node_modules:
$env:PLAYWRIGHT_MODULE = 'file:///absolute/path/to/playwright-core/index.mjs'
node test/responsive.mjs
```

320×740, 390×844, 768×1024, 1440×900: passed no page overflow, filter touch targets,
tab switching, long task/project/assignee text, search field access and mocked server-error state.
Screenshots were generated in `web/.next/responsive/` and visually inspected; subsequent
production build/cache cleanup removed this generated directory. Rerun the harness to
regenerate them, or set `RESPONSIVE_OUTPUT` to a separate artifact directory to retain them.
Visual inspection caught shrinking labels on long-name rows; fixed with non-shrinking labels.
The four viewport checks passed again after that fix. Tests ran against Next dev; the
production build passed separately, but no production-browser run is claimed.
Shared layout/sidebar/topbar changes are required to remove the pre-existing fixed 240px
sidebar and 580px search overflow on small screens.

No task forms, Project Tasks, Task Details or delete-dialog component exists in the checked
frontend tree. R-Pai-01 is partial; R-Pai-02 is blocked on Bar's components.
No dialog cancel/focus/background-scroll or real task UI flow is claimed passed.
My Tasks search/project/sort/detail mock controls are still not implemented as features.

## Standards

An independent Standards sub-agent reviewed the working-tree diff against the captured
base plus all five new source/test/doc files. It found one documented-rule violation:
unknown membership roles granted user-wide read access despite the contract denying it.
All three reads now whitelist Owner/Member. A failing regression demonstrated the leak,
then passed after the fix. Reviewer rechecked: **0 remaining violations or material smells**.

## Spec

A separate Spec sub-agent reviewed against the attached request, plans and latest user
decisions. It independently found the same scope issue and rechecked the fix: **0 remaining
findings**, no evidenced scope creep. Pending API/UI components are correctly recorded
as Book/Bar dependencies. Reviewers performed code review; test execution above was by
the implementing agent.

Review totals: Standards 1 fixed / 0 remaining; Spec 1 fixed / 0 remaining (same issue).
See handoff for lock limitations, public interfaces and integration ownership.
