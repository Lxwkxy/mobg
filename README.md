# MobG

Team project for managing projects, tasks, members and comments.

## Stack and W1 status

| Part | Technology / status |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind; W1 pages and local mock Login |
| Backend | Express 5, TypeScript, ESM; project/member sample routes |
| Authentication | Better Auth 1.7.7 configuration and client prepared; real integration in W2 |
| Database | PostgreSQL 17 in Docker; migrations 001-004 plus 005 verified in a separate W1 test DB |
| Identity | Better Auth string IDs link to existing numeric MobG users via users.auth_user_id |

## Setup

1. Copy root `.env.example` to `.env`; set database credentials and a random auth secret.
2. Follow [database setup](database/README.md), applying migrations in order.
3. Follow [backend setup](backend/README.md): npm ci, then npm run dev.
4. In web, copy env.example to .env.local, run npm ci and npm run dev (localhost:3000).

For an existing database, keep its Docker volume and apply only missing migrations.
No migrations or accounts are created by starting the backend.

## Documentation

- [W1 changes and W2 handoff](docs/better-auth-w1.md)
- [W1 verification results and types/validation handoff](docs/w1-verification.md)
- [API contract and permissions](backend/API-CONTRACT.md)
- [Database setup](database/README.md)
- [Schema mapping](database/schema-mapping.md)

W2 completes usable accounts, session guards, frontend Login/logout and real business queries.
Responsive coding remains scheduled for W4.
