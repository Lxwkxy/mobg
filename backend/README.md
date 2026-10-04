# MobG Backend — Database Connection

This module connects the Node.js backend to PostgreSQL using `pg` and `dotenv`. It is intended for use by the team's Express API.

The development database runs PostgreSQL 17 in Docker.

## Prerequisites

- Node.js and npm are installed.
- Docker Desktop is running.
- The database schema and demo data have been imported using the [database setup guide](../database/README.md).

## Connection settings

`db.cjs` reads the `.env` file at the MobG repository root, one directory above `backend`.

| Variable | Development value |
|---|---|
| `POSTGRES_HOST` | `127.0.0.1` |
| `POSTGRES_PORT` | `5433` |
| `POSTGRES_DB` | `mobg_db` |
| `POSTGRES_USER` | `postgres` |
| `POSTGRES_PASSWORD` | The password configured on your machine |

Use the root `.env.example` as a template. Keep the actual `.env` file out of Git.

These settings apply when the backend runs on the development machine and PostgreSQL runs in Docker.

## Start the database

Run these commands from the MobG repository root, where `compose.yml` is located:

```powershell
docker compose up -d
docker compose exec -T db pg_isready -U postgres -d mobg_db
```

Continue when the readiness check reports `accepting connections`. If the database is still starting, wait briefly and run the readiness check again.

For a new database, follow the database setup guide to import the schema and demo data before running the connection check.

## Install dependencies and check the connection

Starting from the MobG repository root:

```powershell
cd backend
npm ci
node check-db.cjs
```

The output should include `MobG Demo Project`. A successful check exits with code `0`.

In PowerShell, inspect the exit code immediately after running the check:

```powershell
$LASTEXITCODE
```

## Use the shared connection pool

A CommonJS file in the same directory as `db.cjs` can load the pool with:

```javascript
const pool = require("./db.cjs");
```

Call `await pool.query(...)` inside an async function and read the returned records from `result.rows`.

Reuse the shared pool while the Express server is running. Close it when the server shuts down. The standalone `check-db.cjs` script closes its pool after the check finishes.

## Troubleshooting

If the connection fails, check that:

- Docker Desktop is running.
- PostgreSQL reports `accepting connections`.
- The host, port, database, username, and password in the root `.env` are correct.
- The schema has been imported into `mobg_db`.

The check script prints an error message and exits with code `1` when its database query fails.

To reproduce the configuration error check, temporarily set `POSTGRES_PORT=1` in the root `.env` and run only `node check-db.cjs`. Restore `POSTGRES_PORT=5433` afterward and rerun the check.

