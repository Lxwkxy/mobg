# MobG Database Setup

This guide explains how to prepare the MobG database using Docker or a locally installed PostgreSQL server.

## Setup with Docker

### Prerequisites

- Docker Desktop is installed and running.
- You have cloned this repository.
- Run the following commands from the MobG repository root, where `compose.yml` is located.

The Compose service is named `db` and uses PostgreSQL 17.

### 1. Prepare the environment file

If your repository root does not yet contain an `.env` file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and set `POSTGRES_PASSWORD` to your local development password. Keep the actual `.env` file out of Git.

The development connection settings are:

| Setting | Value |
|---|---|
| Host | `127.0.0.1` |
| Host port | `5433` |
| Container port | `5432` |
| Database | `mobg_db` |
| Database user | `postgres` |

The PostgreSQL image uses the initialization credentials and database name when it first initializes an empty data directory. Editing `.env` afterward does not change the credentials stored in an existing database.

### 2. Start PostgreSQL

```powershell
docker compose up -d
docker compose exec -T db pg_isready -U postgres -d mobg_db
```

Continue when the readiness check reports `accepting connections`. If it is still starting, wait briefly and run the readiness check again.

The Compose configuration publishes PostgreSQL at `127.0.0.1:5433` on the development machine.

### 3. Import the schema into a new database

Copy the schema file into the container and run it with `psql`:

```powershell
docker compose cp .\database\migrations\001_initial_schema.sql db:/tmp/mobg_schema.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/mobg_schema.sql
```

Verify the tables and initial task statuses:

```powershell
docker compose exec -T db psql -U postgres -d mobg_db -c "\dt"
docker compose exec -T db psql -U postgres -d mobg_db -c "SELECT status_id, status_name FROM task_statuses ORDER BY status_id;"
```

At this step, migration 001 creates seven core tables. Migration 004 adds the eighth table, sessions. The initial statuses should include `To Do`, `Doing`, and `Done`.

Starting the container and importing the application schema are separate steps. The initial schema file creates missing tables; it does not update the structure of tables that already exist.

#### Apply migration 002

For a new database, apply this migration after `001_initial_schema.sql`
and before importing demo data.

For an existing database, apply it once when upgrading to the schema
that requires task due dates. Before applying it, check for tasks without
a due date:

```powershell
docker compose exec -T db psql -U postgres -d mobg_db -c "SELECT task_id, task_title FROM tasks WHERE due_date IS NULL;"
```

Continue only when the query returns `(0 rows)`. If any tasks are listed,
assign valid due dates to those tasks before continuing.

Apply the migration:

```powershell
docker compose cp .\database\migrations\002_require_task_due_date.sql db:/tmp/002_require_task_due_date.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/002_require_task_due_date.sql
```

Successful execution reports `BEGIN`, `ALTER TABLE`, and `COMMIT`.
If the migration fails, resolve the error before importing demo data or
continuing with backend setup.

This migration makes task due dates mandatory. Project due dates remain
optional. Restarting the container does not require rerunning migrations.

#### Apply migration 003

Apply `003_add_project_start_date.sql` after migration `002` and before
importing demo data into a new database. For an existing database, apply
it once when upgrading to the project start-date rules.

For the existing demo database, the migration uses each project's creation
date in Asia/Bangkok as its initial start date. This is a backfill policy,
not proof of the actual historical start date. Review this policy before
applying the migration to a database containing real project records.

```powershell
docker compose cp .\database\migrations\003_add_project_start_date.sql db:/tmp/003_add_project_start_date.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/003_add_project_start_date.sql
```

Successful execution reports `BEGIN`, the schema changes, an `UPDATE`
row count, and `COMMIT`. Stop and resolve any error before continuing.
The migration rejects existing non-NULL end dates that are not strictly
later than the backfilled start date; it does not change end dates.

New projects default to today's date in Asia/Bangkok and cannot have a
NULL start date. Users may choose another start date. End dates remain
optional, but must be strictly later than the start date when provided.

#### Apply migration 004

Apply `004_add_sessions.sql` after migration `003` and before importing
demo data into a new database. For an existing database that already has
migrations 001-003, apply only 004 once. Do not rerun earlier migrations.

```powershell
docker compose cp .\database\migrations\004_add_sessions.sql db:/tmp/004_add_sessions.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/004_add_sessions.sql
```

Successful execution reports BEGIN, CREATE TABLE, two CREATE INDEX results,
and COMMIT. Stop on errors. If sessions already exists, inspect its schema
and migration history before proceeding; do not drop it or mask a mismatch.

```powershell
docker compose exec -T db psql -U postgres -d mobg_db -c "\d sessions"
```

There are eight application tables after migration 004. It adds session
storage without changing existing users, projects, tasks, or demo data.
The earlier unexecuted activity-table draft numbered 004 was withdrawn;
this migration is for sessions only.

The database stores a unique SHA-256 token digest, not a raw cookie token.
Session expiry must be after creation. This is the legacy custom-session schema, retained as history. Better Auth uses
auth_sessions from 005 and handles the new session lifetime and validation.
No Login or session runtime function is implemented by this migration.

#### Apply migration 005 (Better Auth foundation)

After 001-004, apply 005 once to the intended database. For an existing database,
apply only missing migrations and keep its volume. Pai verified 005 on
2026-10-11 in mobg_w1_auth_check_20261011; the main app DB is not marked migrated.
See [W1 verification](../docs/w1-verification.md) for observed results.

```powershell
docker compose cp .\database\migrations\005_add_better_auth.sql db:/tmp/005_add_better_auth.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/005_add_better_auth.sql
```

Expected result: BEGIN, four new auth tables and indexes, ALTER TABLE, COMMIT.
Stop on errors; inspect an existing/mismatched schema instead of rerunning or dropping it.
005 adds auth_users/auth_sessions/auth_accounts/auth_verifications and a unique nullable
users.auth_user_id link, and makes legacy password_hash nullable. Existing user IDs,
foreign keys, domain data and sessions are preserved. There are twelve tables after 005.
Better Auth owns new credentials and sessions. W2 seeds and links usable accounts explicitly.

### 4. Import demo data

```powershell
docker compose cp .\database\seeds\demo.sql db:/tmp/mobg_demo.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/mobg_demo.sql
docker compose exec -T db psql -U postgres -d mobg_db -c "SELECT project_name FROM projects;"
```

The results should include `MobG Demo Project`.

The demo user's `password_hash` is a placeholder and cannot be used to log in.

### 5. Start and stop the database

Start the service:

```powershell
docker compose up -d
```

Stop the service and remove its container:

```powershell
docker compose down
```

Database files are stored in the named volume declared as `mobg_pgdata` in Compose. Ordinary `docker compose down` preserves this volume, so a subsequent `up` reuses the existing data.

The `-v` option removes the volume and its database data.

You do not need to reimport the schema or demo data every time you start the service. Once it is ready, follow the [backend connection guide](../backend/README.md) to check access from Node.js.

### 6. Try the CRUD examples

```powershell
docker compose cp .\database\queries\crud_examples.sql db:/tmp/mobg_crud_examples.sql
docker compose exec -T db psql -U postgres -d mobg_db -v ON_ERROR_STOP=1 -f /tmp/mobg_crud_examples.sql
```

The script demonstrates project create, read, update, and delete queries. It ends with `ROLLBACK`, so its practice changes are not kept.

## Setup with locally installed PostgreSQL

### Prerequisites

- PostgreSQL is installed on your machine.
- You have cloned this repository.

### 1. Open SQL Shell (psql)

Open SQL Shell and use your local installation's connection settings. The usual defaults are:

- Server: `localhost`
- Database: `postgres`
- Port: `5432`
- Username: `postgres`

Enter the password you chose when installing PostgreSQL. Keep this password private and out of the repository.

After connecting, the prompt should show:

```text
postgres=#
```

### 2. Create and connect to the database

At the `postgres=#` prompt, run:

```sql
CREATE DATABASE mobg_db;
```

If `mobg_db` already exists, skip the creation command. Connect to it:

```text
\c mobg_db
```

The prompt should now show `mobg_db=#`.

### 3. Import the schema

Replace the example path with your repository's actual location. Use forward slashes and keep the single quotes:

```text
\i 'C:/path/to/MobG/database/migrations/001_initial_schema.sql'
```

#### Apply migration 002

For a new database, run migration `002` after `001` and before importing
demo data. For an existing database, first check for tasks without a due date:

```sql
SELECT task_id, task_title
FROM tasks
WHERE due_date IS NULL;
```

Continue only when the query returns `(0 rows)`. If any tasks are listed,
assign valid due dates before applying the migration.

At the `mobg_db=#` prompt, replace the example path with your repository's
actual location and run:

```text
\set ON_ERROR_STOP on
\i 'C:/path/to/MobG/database/migrations/002_require_task_due_date.sql'
```

Successful execution reports `BEGIN`, `ALTER TABLE`, and `COMMIT`.
If execution fails and the session remains in an aborted transaction,
run `ROLLBACK;`, resolve the error, and rerun the migration before continuing.

Task due dates are required after this migration. Project due dates remain
optional.

#### Apply migration 003

Apply migration `003` after `002` and before importing demo data. It uses
the creation date in Asia/Bangkok to backfill existing demo project start
dates. Review this policy before applying it to real project data.

At the `mobg_db=#` prompt, use your repository's actual path:

```text
\set ON_ERROR_STOP on
\i 'C:/path/to/MobG/database/migrations/003_add_project_start_date.sql'
```

Continue only after a successful `COMMIT`. If the session remains in an
aborted transaction after an error, run `ROLLBACK;` and resolve the error
before rerunning the migration.

Project start dates are required and default to today's date in Asia/Bangkok.
An optional end date must be strictly later than the start date.

#### Apply migration 004

After 003, apply the session migration once using the actual repository path:

```text
\set ON_ERROR_STOP on
\i 'C:/path/to/MobG/database/migrations/004_add_sessions.sql'
\d sessions
```

Continue only after COMMIT. On an aborted transaction, run ROLLBACK and
resolve the error. Do not rerun a migration already applied to this database.
The schema through 004 has eight tables; legacy sessions are unused by Better Auth.

#### Apply migration 005

After 004, apply the new auth migration once using the actual repository path:

```sql
\i 'C:/path/to/MobG/database/migrations/005_add_better_auth.sql'
```

005 creates four auth tables and adds the users.auth_user_id link. There are twelve
tables afterwards. Existing domain IDs/data are preserved; provisioning is W2 work.

### 4. Verify the setup

```text
\dt
```

Check the initial task statuses:

```sql
SELECT status_id, status_name
FROM task_statuses
ORDER BY status_id;
```

The results should include `To Do`, `Doing`, and `Done`.

### 5. Import demo data or run CRUD examples

Replace the paths below with your repository's actual location:

```text
\i 'C:/path/to/MobG/database/seeds/demo.sql'
\i 'C:/path/to/MobG/database/queries/crud_examples.sql'
```

The demo user's password hash is a placeholder. The CRUD example script ends with `ROLLBACK`, so its practice changes are not kept.

If the backend uses this local PostgreSQL installation, set its host, port, database, username, and password in the root `.env` to match that installation.

## Week 1 Verification Record

Historical checks below were performed before the Better Auth change. They do not
verify migration 005, the TypeScript server or real Better Auth authentication.

Verification date: 2026-10-07.

Pai performed the fresh-database setup in the isolated mobg_w1_check
database, using the existing PostgreSQL Docker service.

Applied in order:

1. 001_initial_schema.sql
2. 002_require_task_due_date.sql
3. 003_add_project_start_date.sql
4. seeds/demo.sql

Evidence and results:

- The shared terminal screenshot shows the demo seed completed with COMMIT.
- The screenshot lists all seven application tables.
- The new demo project has start_date 2026-10-07 and due_date 2026-11-06.
- Pai confirmed the date-column metadata: project start date and task due date are NOT NULL; project due date remains nullable; the start-date default uses Asia/Bangkok.
- Pai confirmed inspection of the primary-key, foreign-key, CHECK, and UNIQUE definitions, including the composite keys, unique email, priority values, and strict project date ordering.

These results cover the fresh import, demo data, and schema metadata
through migration 003. The session migration and current integration checks
are recorded separately below.

### Account/session agreement — 2026-10-10

Pai accepted the Login/database proposal in Book's PR #5 (commit 9c68bd7):
normalized email Login, bcryptjs cost 10, typed account/membership contracts,
Owner/Member values, and DB-backed sessions. See schema-mapping.md for the
exact inputs, outputs, ID conversion boundary, and session schema.

Previous connection and persistence evidence reported by Pai:
- Node.js check-db.cjs returned MobG Demo Project; the valid configuration
  exited 0 and a deliberately invalid port exited 1 before being restored.
- After ordinary docker compose down/up, the demo project and task data
  remained available without reimporting schema or seed data.

Book's PR reuses backend/db.cjs and retains check-db.cjs. A successful
connection check from Book's environment and teammate confirmation of the
setup guide still need to be recorded. Do not infer these from a mock
health endpoint or from Pai's earlier check.

### Session migration verification — 2026-10-10

Pai applied migration 004 to the isolated mobg_w1_check database.

Results:
- Migration completed with COMMIT.
- Inspected session columns, defaults, keys, constraints, and indexes.
- A valid session with a seven-day expiry was inserted successfully.
- Expiry equal to creation was rejected by sessions_expiry_after_creation.
- A duplicate token hash was rejected by sessions_token_hash_key.
- Test transactions were rolled back; no session rows remained.

### Shared connection check — 2026-10-10

- Pai ran backend/check-db.cjs using the shared backend/db.cjs pool.
- The query returned MobG Demo Project and exited with code 0.
- Book's environment check and teammate confirmation of the setup guide remain pending.

These checks verify the schema. Runtime Login/session functions remain W2 work.

## Schema overview

| Table | Purpose |
|---|---|
| `users` | User account information |
| `projects` | Projects and their creators |
| `project_members` | Project membership and roles |
| `task_statuses` | Available task statuses |
| `tasks` | Tasks within projects |
| `task_assignees` | Users assigned to each task |
| `comments` | Comments on tasks and their authors |
| `sessions` | Legacy custom-session storage (004); unused by Better Auth |
| `auth_users` | Better Auth identities (005) |
| `auth_sessions` | Better Auth sessions (005) |
| `auth_accounts` | Better Auth credentials (005) |
| `auth_verifications` | Better Auth verification records (005) |

The `due_date` column exists in both `projects` and `tasks`. After migration `002`, task due dates are required. Migration `003` adds a required project start date; project due dates remain optional, but must be strictly later than the start date when provided.

Task priority values are `1 = High`, `2 = Medium`, and `3 = Low`.
