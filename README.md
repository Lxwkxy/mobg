# MobG

Team project for managing projects, tasks, members and comments.

## Stack and status (W5 database preparation)

| Part | Technology / status |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind. Login, account flows and project list/create/overview use APIs; Dashboard and My Tasks still use mocks |
| Backend | Express 5, TypeScript, ESM. Session guards, `GET /api/me`, `GET /api/users` and project CRUD + member list are database-backed. Project task routes (list/detail/create/edit/status/delete) are implemented and covered by HTTP tests; comments, activity, dashboard and My Tasks are contract-only |
| Authentication | Better Auth 1.7.7. Public registration, email verification and password reset; existing provisioned accounts remain supported |
| Database | PostgreSQL 17 in Docker. Migrations 001-005 for core/auth, 006 for W5 seed metadata, 007 for public registration; each developer applies missing migrations to their own database |
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

Configure your SMTP provider to deliver verification and password reset emails to real inboxes.
For local testing, select Mailpit explicitly. See [account registration](docs/account-registration.md).

## Continuous integration

GitHub Actions runs [CI](.github/workflows/ci.yml) on every push and pull request.
It can also be started manually from the Actions tab after the workflow reaches
the default branch. Both jobs use Node.js 24 and install from their lockfiles with
`npm ci`:

- **Web checks**: ESLint, generated Next.js route types and TypeScript, then a
  production build.
- **Backend checks**: TypeScript for source and tests, a production build, then
  database tests against a temporary PostgreSQL 17 service.

The database test runner creates its own database, applies migrations and demo
fixtures, and removes the database afterwards. CI uses disposable test credentials
and needs no repository secrets or connection to a developer's database.

To run the same checks locally after installing dependencies:

```powershell
# From web/
npm run lint
npm run typecheck
npm run build

# From backend/ (test:db requires a running PostgreSQL instance and root .env)
npm run typecheck
npm run typecheck:tests
npm run build
npm run test:db
```

After pushing the workflow, open **Actions > CI** or the PR's **Checks** tab to
inspect failures. Once both jobs have run, configure branch protection or a
ruleset for the default branch, if supported by the repository's GitHub plan,
requiring **Web checks** and **Backend checks** before merging. The workflow
reports results; enforcing them requires that GitHub setting.

## Documentation

- [Shared Trello task plan](docs/specs/MobG_Trello_Tasks_Detailed.md)
- [W1 changes and W2 handoff](docs/better-auth-w1.md)
- [W1 verification results](docs/w1-verification.md)
- [W2 verification and handoff](docs/w2-verification.md)
- [W2 frontend handoff](docs/w2-frontend-handoff.md)
- [W2 account provisioning](docs/w2-account-provisioning.md)
- [W3 API verification and handoff](docs/w3-verification.md)
- [API contract and permissions](backend/API-CONTRACT.md)
- [Database setup](database/README.md)
- [Schema mapping](database/schema-mapping.md)
- [W5 demo, backup/restore and verification evidence](docs/w5-db-verification.md)

Next: connect the task screens to the task API (W3-Bar-01/02) and check the web flow
together; members management, comments, activity, My Tasks and Dashboard follow in W4.
Responsive changes for available pages are merged; unavailable screens and real flows
remain dependencies. W5 DB tooling does not implement Book/Bar features.
