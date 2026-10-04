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

## Current Database Setup

- PostgreSQL 17 runs in Docker.
- A named volume preserves database data.
- The schema contains seven tables.
- The backend provides a shared PostgreSQL connection pool.
- The connection check successfully reads the demo project.

## Pending Team Coordination

- Confirm task due-date and assignee requirements.
- Confirm whether assignees must be project members.
- Agree with the backend developer on module integration.
- Have another teammate follow the setup guides.