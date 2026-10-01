# MobG Database Setup

This guide explains how to set up the MobG database on your local machine.

## Prerequisites

- PostgreSQL is installed.
- You have cloned this repository to your computer.

## 1. Open SQL Shell (psql)

Open SQL Shell and press Enter to accept the default values:

- Server: `localhost`
- Database: `postgres`
- Port: `5432`
- Username: `postgres`

Enter the password you chose when installing PostgreSQL. Keep this password private and do not commit it to the repository.

After connecting, you should see:

```text
postgres=#
```

## 2. Create the database

At the `postgres=#` prompt, run:

```sql
CREATE DATABASE mobg_db;
```

If `mobg_db` already exists, skip that command. Connect to the database:

```text
\c mobg_db
```

The prompt should now show:

```text
mobg_db=#
```

## 3. Create the tables

In VS Code, right-click `database/migrations/001_initial_schema.sql` and choose **Copy Path**.

In SQL Shell, type `\i` followed by the file path. Change the path separators from `\` to `/`, and keep the single quotes. Replace the example path with the path on your computer:

```text
\i 'C:/path/to/MobG/database/migrations/001_initial_schema.sql'
```

## 4. Verify the setup

Check that all seven tables exist:

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

## Tables

- `users`
- `projects`
- `project_members`
- `task_statuses`
- `tasks`
- `task_assignees`
- `comments`

The `due_date` column exists in both `projects` and `tasks`. Task priority values are `1 = High`, `2 = Medium`, and `3 = Low`.

## Demo Data

After applying the initial schema migration, run `database/seeds/demo.sql` with `psql` to insert sample data for local development. Replace the path below with the location of your local repository:

```sql
\i 'C:/path/to/MobG/database/seeds/demo.sql'
```

The demo user's `password_hash` is a placeholder and cannot be used to log in.

## CRUD Examples

Run `database/queries/crud_examples.sql` with `psql` to see example project create, read, update, and delete queries. The script ends with `ROLLBACK`, so the practice changes are not kept in the database.