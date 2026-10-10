# MobG

A team project for managing projects, tasks, members, and comments.

## Repository Structure

| Path | Purpose |
|---|---|
| web/ | Frontend application |
| backend/ | Database connection module and connection check |
| database/migrations/ | Database schema scripts |
| database/seeds/ | Demo data |
| database/queries/ | SQL examples |
| compose.yml | PostgreSQL development service and persistent volume |

## Development Setup

1. Copy `.env.example` to `.env` and configure local credentials.
2. Follow [Database Setup](database/README.md) to start PostgreSQL and import the schema and demo data.
3. Follow [Backend Database Connection](backend/README.md) to install dependencies and check the connection.

For an existing database, start the service from the repository root:

```powershell
docker compose up -d db
```

## Database Documentation

- [Database setup and SQL examples](database/README.md)
- [Schema and UI mapping](database/schema-mapping.md)
- [Backend database connection](backend/README.md)

## Current Implementation Status

| Area | Current status |
|---|---|
| Frontend | A local Next.js, TypeScript, and Tailwind scaffold exists in web/ but is not yet committed. |
| Backend database connection | Implemented using pg and dotenv in CommonJS JavaScript files. |
| Express API | Not yet implemented in the shared repository. |
| Backend TypeScript | Not yet configured. |
| Database | PostgreSQL 17, schema migrations, and demo data are available. |
| Setup documentation | Database and connection setup guides are available. |

The database connection files are in backend/.
Docker Compose and the environment template are at the repository root.
Book's Express mock server, hash helper, and API contract are in
[PR #5](https://github.com/Lxwkxy/mobg/pull/5), reviewed at commit 9c68bd7;
they are not yet part of this branch. Pai accepted the Login/database
contracts on 2026-10-10. Backend TypeScript remains unconfigured.

## Current Database Setup

- PostgreSQL 17 runs in Docker.
- A named volume preserves database data.
- The schema contains eight tables after migrations 001-004, including Login session storage.
- The backend provides a shared PostgreSQL connection pool.
- The connection check successfully reads the demo project.

## Remaining Integration Work

- Validate required task due dates in the API.
- Enforce at least one assignee when creating and updating tasks.
- Restrict task assignees to project members.
- Support multiple assignees per task.
- Complete Book's environment connection check using the agreed backend/db.cjs pool.
- Implement the agreed account/membership/session functions and usable account seeds in W2.
- Have another teammate follow the setup guides.
