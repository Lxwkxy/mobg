# W2 Pai verification record

Date: 2026-10-11. Branch: w2-auth-db. Base main: 1664448de18a988cf8b0878ddbc118b451b25677.
No commit, push or PR is part of this implementation request.

## Development database

Target: mobg_db through the existing Compose db service, localhost port 5433.
The initial structural audit found 001–004 complete and 005 missing. Only migration
005 was applied after naming that target/missing migration. The follow-up audit
reports 001–005 complete. The original domain row remains user_id 1, Demo Member,
demo-member@example.test; its existing project ownership remains in place.
The original Docker volume was retained. Auth tables were added; legacy users,
password placeholders and the old sessions table were not deleted or converted.

The schema checker is a structural preflight, not a historical migration ledger.
Partial migrations stop for explicit reconciliation. It does not certify arbitrary
schema drift beyond its checks or blindly reapply an ALTER/CREATE script.

## Checks performed

From backend/:

```powershell
npm run typecheck
npm run typecheck:tests
npm run build
npm run test:db
npx tsx src/schema-status.ts --database mobg_db
```

Source and test typechecks and build passed. Automated suite: **19 tests passed**.
The full suite passed again after review fixes; git diff --check also passed.
The runner creates a unique mobg_w2_test_<pid>_<random> database, applies 001–005 and
the existing demo SQL, injects a random test-only auth secret, then removes only that
database. No test changes/removes development rows or the existing volume.

| Verified behavior | Evidence |
|---|---|
| Auth ID string lookup, missing result and original DB error propagation | authDb.test.ts |
| Safe domain ID conversion and partial-schema rejection | schema.test.ts |
| Creator Owner; duplicate members; unknown member rolls creation back | projectDb.test.ts |
| Membership-scoped list, status before paging, stable order, empty-page totals | projectDb.test.ts |
| No-task/all-To-Do/all-Done/mixed status; 33% rounding; multiple assignees count once | projectDb.test.ts |
| Nullable patch fields, DATE strings, date CHECK errors and absent records | projectDb.test.ts |
| Cascade deletion, downstream failure rollback and retention of another project | projectDb.test.ts |
| Account creation preserves demo ID and credentials; normalized emails; repeatable seed | provisioning.test.ts |
| Three real accounts, explicit Auth/domain mapping, native Login and expiry | provisioning.test.ts |
| Public signup remains disabled; 12 simultaneous account/fixture seeds do not exhaust the pool | provisioning.test.ts |
| Pre-existing unlinked auth email/collisions stop without silent attachment | provisioning.test.ts |
| Link failure saves an ID-only private record; blind retry blocked; explicit recovery | provisioning.test.ts |
| Business fixture rerun preserves roles; outsider sees neither fixture | provisioning.test.ts |
| check-demo CLI verifies native Login/profile/membership/list/Logout for three roles | provisioning.test.ts |

Session expiry uses a fixed past date in the isolated DB to avoid host/container
clock skew. Tests never print passwords, hashes or session/cookie objects.

## Development accounts and pending team evidence

- Development accounts and fixture seed completed: user reported no errors on
  npx tsx src/seed-demo.ts --database mobg_db with privately selected passwords.
- Development native verification completed: user reported PASS for all three
  accounts from npx tsx src/check-demo.ts --database mobg_db. This is user-reported
  terminal evidence, separate from the automated tests run by the agent.
- Agent read-only SQL confirms linked credential accounts for domain IDs 1 (Demo
  Member / Owner), 2 (MobG Member), 3 (MobG Outsider). Original project 1 still has
  creator/Owner 1. Shared fixture project 2 has Owner 1 and Member 2; private fixture
  project 3 has Owner 1 only. Outsider 3 has no membership in either fixture.
- HTTP /api/me, permission guards and real project routes: Book.
- Browser Login/create/read/refresh/account switching/CORS: Bar with Book/Pai.
- Browser Logout/expiry followed by protected API calls: Bar with Book.

Use [handoff](w2-pai-handoff.md) for the joint checklist and account guide for
commands. W2 cards remain pending the joint API/UI evidence even when DB checks pass.

## Code review: Standards

Compared the uncommitted tracked diff against the captured main base, plus every
new W2 source/script/test/document file. Existing local agent config and frontend
backup folders were excluded. The user forbids commits, so a three-dot HEAD diff
would omit the work; review used git diff against the base and the new-file inventory.

One possible duplicated-code finding was fixed: both recovery paths now use one
typed helper with temporary write + rename, retaining a valid record if a replacement
write fails. Recheck: 0 documented breaches, 0 material baseline smells.

## Code review: Spec

Two findings were fixed and independently rechecked:

1. Seed callers enter a local queue before reserving pg connections. DB advisory
   locks still serialize separate processes. Account and fixture paths both use it;
   the regression submits 12 parallel calls against a default pool of 10.
2. The handoff maps missing membership to 404 and unsupported/insufficient roles to
   403, following the Backend contract.

Recheck: 0 remaining Spec findings. Reviewers inspected code only; the automated
test execution and results above were performed by the implementing agent.

Final review totals: Standards 0, Spec 0 remaining findings.
