# MobG Database / Docker guide

Follow the [repository setup](../README.md#setup) to configure the root `.env`,
start PostgreSQL and migrate the development database. See the
[schema mapping](schema-mapping.md) for tables and data rules.

The commands below use PowerShell. Run Compose from the repository root unless
the example explicitly changes directories. Isolated tests and restore require a
PostgreSQL role that can create databases. The backup check also reads
`pg_control_system()` to verify the cluster identity.

## Inspect and migrate an existing database

From `backend/`, with PostgreSQL running, replace `mobg_db` with the exact
configured database name.

```powershell
npm run db:status -- --database mobg_db
npm run db:migrate -- --database mobg_db
npm run db:verify -- --database mobg_db
```

Inspect the reported target and migration state before applying changes.
Migration status is derived from the database structure. A partial schema
requires repair before the tool applies more migrations. A process-level
`POSTGRES_DB` overrides the root `.env`. Clear it or use a fresh terminal to
return to your development database.

| Migration | Result |
|---|---|
| 001 | Seven business tables, statuses To Do / Doing / Done |
| 002 | Task due date required; repair existing NULLs before upgrading |
| 003 | Project start date required, Bangkok default; optional end date strictly later |
| 004 | Legacy sessions retained; not used by Better Auth |
| 005 | Four Better Auth tables and unique nullable `users.auth_user_id` link |
| 006 | `demo_seed_runs`: W5 fixture IDs, reference date and non-secret business snapshot |
| 007 | Public registration kind and transactional MobG profile creation trigger |

Single-account provisioning requires migrations 001–005 and 007.
Demo seeding requires all seven. Keep the demo metadata so seed reruns can
check the saved fixture against current data.

If an earlier checkout already applied the registration SQL under the old 006 filename,
use `db:status` / `db:migrate`: structural detection recognizes it as 007 and does not
reapply it. Do not run the renamed SQL directly against an already-upgraded database.

If using host PostgreSQL instead of Docker, set `POSTGRES_*` to that server and use
the same Node migration/seed/verification commands. The automated Docker backup
check intentionally refuses a different server: use that server's `pg_dump` and
`pg_restore` against a newly created database instead.

## Prepare a persistent, isolated demonstration database

Use a **new** `mobg_w5_demo_*` name. `createdb` fails if it already exists; do not
drop/recreate an existing target. Start PostgreSQL with Compose before setting the override.
Keep the selected database for the demonstration; it is separate from `mobg_db`.
If you configured a different PostgreSQL user, replace `postgres` in the commands
with that user.

```powershell
# Repository root, same PowerShell terminal throughout
$demoDb = 'mobg_w5_demo_' + (Get-Date -Format 'yyyyMMdd_HHmmss')
docker compose exec -T db createdb -U postgres $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Database creation failed; stop here.' }
$env:POSTGRES_DB = $demoDb
cd backend
npm run db:status -- --database $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Database inspection failed; stop here.' }
npm run db:migrate -- --database $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Migration failed; stop here.' }
docker compose cp ../database/seeds/demo.sql db:/tmp/mobg-initial-demo.sql
if ($LASTEXITCODE -ne 0) { throw 'Initial seed copy failed; stop here.' }
docker compose exec -T db psql -X -U postgres -d $demoDb -v ON_ERROR_STOP=1 -f /tmp/mobg-initial-demo.sql
if ($LASTEXITCODE -ne 0) { throw 'Initial seed failed; stop here.' }
docker compose exec -T db psql -X -U postgres -d $demoDb -c 'SELECT user_id,user_name,email FROM users ORDER BY user_id;'
. ./scripts/set-seed-env.ps1
npm run seed:demo -- --database $demoDb --w5
if ($LASTEXITCODE -ne 0) { throw 'Provisioning failed; stop and inspect.' }
npm run check:demo -- --database $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Demo Login check failed; stop here.' }
npm run db:verify -- --database $demoDb
if ($LASTEXITCODE -ne 0) { throw 'Database verification failed; stop here.' }
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
another database.

On rerun, the recorded W2 and W5 IDs and business fixtures must still match before
any legacy project seed or account creation can run. Changed
task fields, memberships, comments, deleted tasks/projects or a changed explicit
reference date cause a nonzero exit and preserve edits. W5 fixture creation is one
transaction; account provisioning/W2 fixtures are separate existing operations.
Do not treat the whole CLI as one transaction after a provisioning failure: use the
[private reconciliation procedure](#provision-or-recover-a-single-account). The W5 seed uses a maintenance table lock;
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

### Try the demo in the browser

Start the API with `npm run dev` in the same terminal so it uses the demo database.
In a separate terminal, start the web app using the [repository setup](../README.md#7-start-the-web-app).
Sign in at `/login` using the seeded accounts and the passwords entered during
provisioning. With the default seed, the Owner email is `demo-member@example.test`.

1. As Owner, open **MobG W5 Main Demo**. Set **Future Medium** to **Done** and
   check that project progress increases from 20% to 40%. Add a comment and
   reopen the task to check that it persists.
2. As Member, compare the status control on an assigned task with the read-only
   status of a task assigned only to the Owner. The Outsider sees an empty
   project list.
3. As Owner, use **MobG W5 DELETE Sandbox** to try cancelling and confirming
   task deletion. Keep Main Demo for the other checks.

Use a fresh demo database to repeat the flow from its initial state. Before
returning to normal development, stop the demo API and close its terminal or
clear the overrides in PowerShell.

```powershell
Remove-Item Env:POSTGRES_DB,Env:SEED_DOMAIN_USER_ID,Env:SEED_OWNER_PASSWORD,Env:SEED_MEMBER_PASSWORD,Env:SEED_OUTSIDER_PASSWORD -ErrorAction SilentlyContinue
```

## Provision or recover a single account

Use this when an existing SQL-seeded profile needs Better Auth credentials or
when a test account needs a new profile. From `backend/`, use a dedicated
terminal and set the inputs privately in that terminal:

- Existing profile uses `SEED_DOMAIN_USER_ID`.
- New profile uses `SEED_NAME` and `SEED_EMAIL`. Keep `SEED_DOMAIN_USER_ID` unset.
- Both modes use `SEED_PASSWORD` for initial provisioning. Clear it or close the
  terminal after the command finishes.

```powershell
npm run seed:accounts -- --database YOUR_EXACT_DATABASE_NAME
```

A credential/link failure can leave a reconciliation file in the ignored
`.seed-reconciliation/` directory. Keep the file and inspect it privately.
Fix the cause of the domain write failure and confirm the same database, target
and `verified_creation: true` before retrying with the original target inputs.

```powershell
npm run seed:accounts -- --database YOUR_EXACT_DATABASE_NAME --recover
```

Recovery validates the account ID, email, credential and domain link. It uses
the saved credential and removes the record after success. An unverified
record or mismatched account requires manual reconciliation. Preserve the
account and the record while investigating.

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
path verifies the recovered database's integrity.

## Database checks

See the [backend test commands](../backend/README.md#tests) for disposable
database checks and the API audit.

## Destructive operations — outside normal setup

- `docker compose down -v` deletes the volume and its database data. Use
  `docker compose stop db` to keep your data between sessions.
- Never reset/drop `mobg_db` or restore over an existing development/shared database.
- To remove an intentionally retained test database later, first inspect its exact
  name and ownership; delete only that test resource. Automated scripts already
  clean their own unique databases and refuse pre-existing restore targets.
- For the demo's delete action, use only `MobG W5 DELETE Sandbox` and its
  `DELETE ME - sandbox task` IDs from the seed output. Seeding after a deletion
  deliberately stops instead of recreating it. Use a fresh DB for another rehearsal.
