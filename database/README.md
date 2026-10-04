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

There should be seven tables listed in the schema overview below. The initial statuses should include `To Do`, `Doing`, and `Done`.

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

The `due_date` column exists in both `projects` and `tasks`. After migration `002`, task due dates are required; project due dates remain optional.

Task priority values are `1 = High`, `2 = Medium`, and `3 = Low`.

