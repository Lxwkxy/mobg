# MobG Database / Docker guide

Use this guide with [account provisioning](../docs/w2-account-provisioning.md),
[schema mapping](schema-mapping.md) and the [W5 verification record](../docs/w5-db-verification.md).
Historical results remain in `docs/w1-verification.md` through `docs/w4-pai-verification.md`.

## Prerequisites and configuration

- Docker Desktop running Linux containers; Docker Compose v2 or newer.
- Node.js 22+ and npm; verified versions are recorded in the W5 report.
- PowerShell commands below start in the repository root. PostgreSQL runs in Docker;
  Express/Next.js run on the host. No separate host PostgreSQL installation is needed.
- Use a PostgreSQL role allowed to create databases for isolated tests and restore.
  The backup check also reads `pg_control_system()` to verify the cluster identity.

```powershell
if (!(Test-Path .env)) { Copy-Item .env.example .env }
# Edit .env privately; retain existing credentials for an existing volume.
# For a freshly copied example, remove ONLY the BETTER_AUTH_SECRET placeholder
# line in your editor before the helper below. Keep an existing real secret.
cd backend
npm ci
npm run setup:auth-secret
cd ..
```

The secret helper creates a missing secret without displaying it; it does not
replace an existing key. If it reports an existing example placeholder, remove only
that placeholder line privately in your editor and rerun the helper. Never print `.env`, run
`docker compose config` into shared logs, or paste passwords into commands/chat.

| Root `.env` variable | Purpose / local example |
|---|---|
| `POSTGRES_DB` | Normal development database, `mobg_db` |
| `POSTGRES_USER` | DB role, normally `postgres` |
| `POSTGRES_PASSWORD` | Private DB password; initial volume credentials remain authoritative |
| `POSTGRES_HOST` | Host connection, `127.0.0.1` |
| `POSTGRES_PORT` | Published host port, `5433`; container port is `5432` |
| `PORT` | Express port, `5000` |
| `CORS_ORIGIN` | Exact browser origin, `http://localhost:3000` |
| `BETTER_AUTH_URL` | Express origin, `http://localhost:5000`, without `/api/auth` |
| `BETTER_AUTH_SECRET` | Private random value of at least 32 characters; never `NEXT_PUBLIC_*` |

The Node loader reads root `.env`; process environment overrides it. This is how
tests select a separate DB without editing `.env`. Close the test terminal or remove
its `POSTGRES_DB` override before normal development. Changing `.env` does not reset
the password or database inside an existing volume.

## Start, connect and migrate

```powershell
docker compose up -d
docker compose ps
docker compose exec -T db pg_isready -U postgres -d mobg_db
cd backend
npm run db:status -- --database mobg_db
```

Replace the role/database examples with the actual configured names. `db:status`
is a structural inspection, not a historical migration ledger. On a new or explicitly
selected database, apply only missing migrations; a partial schema stops for repair:

```powershell
npm run db:migrate -- --database mobg_db
npm run check-db
npm run db:verify -- --database mobg_db
npm run dev
```

Review the target and status first. W5 execution in this chat did **not** migrate or
seed `mobg_db`; all writes were confined to temporary databases. `check-db` reads
projects through the same Node `pg` pool as Express. `/api/health` alone does not
prove DB connectivity. A new empty database legitimately returns no projects.

| Migration | Result |
|---|---|
| 001 | Seven business tables, statuses To Do / Doing / Done |
| 002 | Task due date required; repair existing NULLs before upgrading |
| 003 | Project start date required, Bangkok default; optional end date strictly later |
| 004 | Legacy sessions retained; not used by Better Auth |
| 005 | Four Better Auth tables and unique nullable `users.auth_user_id` link |
| 006 | `demo_seed_runs`: W5 fixture IDs, reference date and non-secret business snapshot |
| 007 | Public registration kind and transactional MobG profile creation trigger |

006 adds provisioning metadata only. It does not change W4 business rules, auth
credentials or API/UI features. In the combined account branch, account provisioning
requires 001–005 and 007; W5 seeding requires all seven. Never delete the metadata
to force reseeding changed data. Public signup/reset also need the local mail inbox:
see [account setup](../docs/account-registration.md).

If an earlier checkout already applied the registration SQL under the old 006 filename,
use `db:status` / `db:migrate`: structural detection recognizes it as 007 and does not
reapply it. Do not run the renamed SQL directly against an already-upgraded database.

If using host PostgreSQL instead of Docker, set `POSTGRES_*` to that server and use
the same Node migration/seed/verification commands. The automated Docker backup
check intentionally refuses a different server: use that server's `pg_dump` and
`pg_restore` against a newly created database instead.

## Prepare a persistent, isolated demonstration database

Use a **new** `mobg_w5_demo_*` name. `createdb` fails if it already exists; do not
drop/recreate an existing target. Start Compose before setting the override.
Keep the selected database for the demonstration; it is separate from `mobg_db`.

```powershell
# Repository root, same PowerShell terminal throughout
$demoDb = 'mobg_w5_demo_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
docker compose exec -T db createdb -U postgres $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Database creation failed; stop here.' }
$env:POSTGRES_DB = $demoDb
cd backend
npm run db:status -- --database $demoDb
npm run db:migrate -- --database $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; stop here.' }
docker compose cp ../database/seeds/demo.sql db:/tmp/mobg-initial-demo.sql
docker compose exec -T db psql -X -U postgres -d $demoDb -v ON_ERROR_STOP=1 -f /tmp/mobg-initial-demo.sql
if ($LASTEXITCODE -ne 0) { throw 'Initial seed failed; stop here.' }
docker compose exec -T db psql -X -U postgres -d $demoDb -c 'SELECT user_id,user_name,email FROM users ORDER BY user_id;'
. ./scripts/set-seed-env.ps1
npm run seed:demo -- --database $demoDb --w5
if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed; stop and inspect.' }
npm run check:demo -- --database $demoDb
npm run db:verify -- --database $demoDb
```

Select the displayed Owner ID (1 on this fresh DB). Enter passwords through the
hidden prompt; do not supply them in chat. The legacy SQL seed creates only domain
data. The TypeScript provisioner uses Better Auth, retains domain IDs and existing
credentials, and never attaches an unrelated account by matching email alone.
Existing account passwords are not changed by rerunning seed.

| Process-only input | Purpose |
|---|---|
| `SEED_DOMAIN_USER_ID` | Existing Owner domain ID, verified before selection |
| `SEED_OWNER_PASSWORD`, `SEED_MEMBER_PASSWORD`, `SEED_OUTSIDER_PASSWORD` | Hidden local input; original passwords are needed for Login checks |
| `SEED_MEMBER_EMAIL`, `SEED_OUTSIDER_EMAIL` | Optional stable overrides for the documented default accounts |
| `DEMO_REFERENCE_DATE` | Optional valid `YYYY-MM-DD`; normally omit to use PostgreSQL's Bangkok date |

W5 seed also retains the W2 Shared/Private projects and adds Main Demo, Completed,
Empty and DELETE Sandbox. It prints actual project/task IDs; do not assume IDs from
another database. See the W5 report for the task matrix and demo sequence.

On rerun, the recorded W2 and W5 IDs and business fixtures must still match before
any legacy project seed or account creation can run. Changed
task fields, memberships, comments, deleted tasks/projects or a changed explicit
reference date cause a nonzero exit and preserve edits. W5 fixture creation is one
transaction; account provisioning/W2 fixtures are separate existing operations.
Do not treat the whole CLI as one transaction after a provisioning failure: use the
existing private reconciliation procedure. The W5 seed uses a maintenance table lock;
stop API/other writers during seeding.

The initial reference date is retained. The unfinished task due two days earlier
remains overdue as days advance; a rerun never moves edited due dates. Today/future
tasks naturally become overdue later, so recompute expected counts using `db:verify`.
For a fresh today/tomorrow demonstration, create a **new** test DB with a new name.

`check:demo` creates and signs out temporary Better Auth sessions. It verifies native
auth + DB mapping, not HTTP or browser behavior. `db:verify` is read-only and compares
raw-task calculations to Dashboard, My Tasks, High-priority and project functions.
Run on an idle DB; service calls use separate queries, so concurrent edits can cause
a mismatch. Unlinked legacy users are reported separately, not silently provisioned.

```powershell
Remove-Item Env:SEED_OWNER_PASSWORD,Env:SEED_MEMBER_PASSWORD,Env:SEED_OUTSIDER_PASSWORD -ErrorAction SilentlyContinue
```

## Backup and verified restore

Stop API/seed writers first. The script checks the exact source name, verifies that
Node and Docker connect to the same PostgreSQL cluster, and refuses an existing
restore target. The restore name must start `mobg_w5_restore_`.

```powershell
# backend/, POSTGRES_DB still selects the intended source
$restoreDb = 'mobg_w5_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
npm run db:backup -- --database $demoDb --restore-database $restoreDb
```

This uses Docker's PostgreSQL 17 `pg_dump` custom format with an exported snapshot,
then `pg_restore --single-transaction --exit-on-error` into a NEW database. All public
table rows (including auth data), column definitions, constraints, indexes, sequences
and public function definitions are compared in memory; no contents/digests are printed.
It checks restored schema and relationships, then removes only its own restore DB.
The source is never reset or overwritten. It holds SHARE table locks during capture;
use an idle source to avoid waits and sequence changes outside transactions.

The archive stays in the OS temporary directory under `mobg-private-backups` by
default. Supply `--directory` with a private folder **outside the repository** for
longer retention. Temporary folders can be cleaned by the OS. The filename is printed,
the contents are not. Files are opened exclusively; existing backups are never replaced.
On Windows, directory ACLs govern access: choose your own private user folder; the
dump is not encrypted. Do not upload it, paste it, or add it to Git.

### Recover later from a retained archive

If the original source is unavailable, restore a trusted archive using Docker tools
into a newly named database. No `--clean`, `--create`, volume deletion or existing
target is used. From the repository root, select the exact archive privately:

```powershell
$archive = Read-Host 'Absolute path of the private .dump archive'
if (!(Test-Path -LiteralPath $archive -PathType Leaf)) { throw 'Archive not found.' }
$recoveredDb = 'mobg_w5_restore_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
$containerArchive = '/tmp/mobg-restore-' + [guid]::NewGuid().ToString('N') + '.dump'
Write-Host "New recovery target: $recoveredDb"
docker compose exec -T db createdb -U postgres $recoveredDb
if ($LASTEXITCODE -ne 0) { throw 'Target exists or creation failed; stop.' }
try {
    docker compose exec -T db psql -X -U postgres -d $recoveredDb -Atc 'SELECT current_database();'
    if ($LASTEXITCODE -ne 0) { throw 'Target connection failed.' }
    docker compose cp $archive "db:$containerArchive"
    if ($LASTEXITCODE -ne 0) { throw 'Archive copy failed.' }
    docker compose exec -T db pg_restore -U postgres -d $recoveredDb --single-transaction --exit-on-error --no-owner --no-acl $containerArchive 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'Restore failed; inspect the isolated target privately.' }
} finally {
    docker compose exec -T db rm -f -- $containerArchive
}
$env:POSTGRES_DB = $recoveredDb
cd backend
npm run db:verify -- --database $recoveredDb
```

Keep this recovered database for inspection; this procedure does not delete it. For
Login checks, use the original account passwords via hidden input, and run `check:demo`.
The automated rehearsal verifies byte-equivalent logical content; the manual recovery
path verifies integrity but cannot compare with an unavailable source. The manual
operator procedure has not been tried by a teammate.

## Repeatable verification

From `backend/`:

```powershell
npm run typecheck
npm run typecheck:tests
npm run build
npm run test:db
npm run test:demo-rehearsal
```

`test:db` creates `mobg_w2_test_<pid>_<random>` and runs DB tests plus the existing
task HTTP suite. The prefix is historical. `test:demo-rehearsal` needs Docker and
creates `mobg_w5_demo_<pid>_<random>` with disposable in-memory passwords, runs W5
CLI twice, native Login/Logout, the independent oracle and backup/restore. Both
remove only databases created by that invocation; the rehearsal retains its private
backup. This does not prove browser integration or teammate setup.

## Stop/start without deleting data

From the repository root in a terminal without the test `POSTGRES_DB` override:

```powershell
docker compose stop db
docker compose start db
docker compose ps
```

`docker compose down` removes containers/network but keeps the named `mobg_pgdata`
volume; `docker compose up -d` reuses it. No migration/seed is needed on each restart.

## Destructive operations — outside normal setup

- `docker compose down -v` deletes the volume and its database data. It is **not**
  part of setup, testing, backup or recovery, and was not run for W5.
- Never reset/drop `mobg_db` or restore over an existing development/shared database.
- To remove an intentionally retained test database later, first inspect its exact
  name and ownership; delete only that test resource. Automated scripts already
  clean their own unique databases and refuse pre-existing restore targets.
- For the demo's delete action, use only `MobG W5 DELETE Sandbox` and its
  `DELETE ME - sandbox task` IDs from the seed output. Seeding after a deletion
  deliberately stops instead of recreating it. Use a fresh DB for another rehearsal.
