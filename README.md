# MobG

Team project for managing projects, tasks, members and comments.

## Stack and status (end of W2 backend work)

| Part | Technology / status |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind. Login, Topbar and all screens still use local mocks; real integration is Bar's W2/W3 work |
| Backend | Express 5, TypeScript, ESM. Session guards, `GET /api/me`, `GET /api/users` and project CRUD + member list are database-backed. Tasks, comments, activity and dashboard are contract-only |
| Authentication | Better Auth 1.7.7. Sign-in, session and sign-out work with provisioned accounts; public signup is disabled |
| Database | PostgreSQL 17 in Docker. Migrations 001-005; each developer applies them to their own database |
| Identity | Better Auth string IDs link to numeric MobG users through `users.auth_user_id` |

## Setup

1. Copy root `.env.example` to `.env`; set database credentials and a random auth secret.
2. Follow [database setup](database/README.md), applying migrations in order.
3. Follow [backend setup](backend/README.md): `npm ci`, then `npm run dev`.
4. Provision a test account with the
   [account provisioning procedure](docs/w2-account-provisioning.md).
5. In `web`, copy `env.example` to `.env.local`, run `npm ci` and `npm run dev`
   (localhost:3000).

For an existing database, keep its Docker volume and apply only missing migrations.
Starting the backend never creates migrations or accounts.

## Documentation

- [W1 changes and W2 handoff](docs/better-auth-w1.md)
- [W1 verification results](docs/w1-verification.md)
- [W2 verification and handoff](docs/w2-verification.md)
- [W2 frontend handoff](docs/w2-frontend-handoff.md)
- [W2 account provisioning](docs/w2-account-provisioning.md)
- [API contract and permissions](backend/API-CONTRACT.md)
- [Database setup](database/README.md)
- [Schema mapping](database/schema-mapping.md)

Next: W3 adds members management, tasks, comments and activity. Responsive coding
remains scheduled for W4.
