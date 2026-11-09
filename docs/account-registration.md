# Account registration

User-approved additional scope, separate from W5: Pai owns Register, email verification
before public-account Login, and password reset. This supersedes the original plan's
"no public signup" constraint. W3/W4 task/member APIs are not changed.

## Behavior

- `/register`: name, email, password and confirmation; success goes to `/verify-email`.
- `/verify-email`: check inbox/resend, success or invalid/expired-link state.
- `/forgot-password`: generic acknowledgement, including for unknown emails.
- `/reset-password`: set/confirm password; missing/invalid/expired links can request a new one.
- Verification lasts one hour; reset lasts 30 minutes, is single-use and revokes existing sessions.
- New public accounts have a MobG profile but no memberships or access to other projects.
- Existing trusted provisioned accounts retain Login and their numeric domain IDs. They are
  not silently marked email-verified. Verification is enforced when creating a session for a
  public account; the server-only registration kind cannot be selected by signup clients.
- Duplicate signup is enumeration-safe and never replaces a password or claims a profile.

## Local setup

Use private `.env` files. Never commit credentials or action links.

```powershell
# From repo root: same retained PostgreSQL volume; separate local email capture service
docker compose up -d db
docker compose -p mobg-registration-mail -f compose.mail.yml up -d

# From backend/: inspect your exact target first; apply only missing migrations
npm ci
npm run db:status
npm run db:migrate -- --database YOUR_EXACT_DATABASE_NAME
npm run dev

# From web/: set NEXT_PUBLIC_AUTH_URL in .env.local to match BETTER_AUTH_URL
npm ci
npm run dev -- --hostname localhost
```

Migration 007 adds a server-only registration kind and a trigger that creates a new domain
profile in Better Auth's PostgreSQL signup transaction. It preserves existing data and does
not attach old profiles by email. The migration is not run automatically at startup.

Defaults: web `http://localhost:3000`, API `http://localhost:5000`, inbox
`http://localhost:8025`, SMTP `127.0.0.1:1025`. Mailpit captures mail locally, even for
addresses ending in `.test`; it does not send real mail. Open an email in the inbox and click
its action link. To stop the inbox: `docker compose -p mobg-registration-mail -f compose.mail.yml stop`.

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` and optionally `SMTP_USER`/
`SMTP_PASSWORD` for a real provider. Production requires explicit host/from; configure HTTPS,
real sender/domain credentials and reverse-proxy IP handling before public deployment.
Do not expose Mailpit publicly. For LAN development, all web/API origins must match the current
computer IP, and Next dev must allow that hostname (e.g. start it with `--hostname YOUR_IP`).

## Checks

With PostgreSQL and Mailpit running, `npm run test:db -- registration.test.ts` from backend/
uses its own temporary DB, applies migrations 001-007 and removes only that DB afterward.
It tests verification, profile/access, reset/session revocation, tampering, callbacks, expiry
and credential-write rollback. Existing seed/provisioning tests remain separate regressions.

Browser checks use real HTTP and SMTP, not mocked accounts. Start web on port 3400 with
`NEXT_PUBLIC_AUTH_URL=http://localhost:5400`, then from backend/ set:

```powershell
$env:ACCOUNT_WEB_URL='http://localhost:3400'
$env:REGISTRATION_BACKEND_PORT='5400'
# PLAYWRIGHT_MODULE may point to an external Playwright installation with Chrome support.
npm run test:db -- registration.test.ts
```

The test starts/stops its own API. It covers Register → verification → Login/Logout → reset →
new-password Login and layouts at 320×740, 390×430, 768×1024 and 1440×900.
Set `ACCOUNT_ARTIFACTS` outside `.next` to retain screenshots across builds.

References: [Better Auth email/password](https://www.better-auth.com/docs/authentication/email-password),
[email](https://www.better-auth.com/docs/concepts/email),
[PostgreSQL](https://www.better-auth.com/docs/adapters/postgresql).

Verified 2026-11-09: full backend suite including the production-browser account flow
67/67 passed (no skips); auth layouts 16 viewport/page combinations passed; existing
responsive regression 44 scenarios passed. Backend source/tests typechecks/build and
web typecheck/lint/build passed. Standards/Spec review: 0 remaining findings.
All writes/migrations ran only in disposable test DBs; the registration migration was not applied to
the existing development DB. SMTP delivery was tested with Mailpit, not a real provider.
The existing Next.js version still emits a security warning; upgrade before public deployment.

## W5 integration (2026-11-09)

Combined the W5 branch at `5e38677` with account registration at `37f3b1f` locally.
W5 metadata keeps migration 006; registration is now 007. The shared schema inspector
and test runner include both; account provisioning can omit demo metadata, but it
requires the registration schema used by its auth config. W5 seeding requires all seven.

Combined validation: 70/70 tests passed, including real production-browser accounts.
The W5 rehearsal upgraded a separate six-migration database through the real migration
CLI, ran it again without changes, seeded/reran, checked Owner/Member/Outsider Login,
verified the W4 summary oracle, and completed backup/restore. Backup comparison now
includes user triggers and compares source/restored migration states, preserving the
public-profile trigger along with data/functions/indexes/sequences. Both rehearsal DBs
were removed; the private test archive remains outside Git. The development DB was not migrated.

Integration review: the main agent checked conflict resolutions against both parent
revisions and found no remaining issues. Independent Standards/Spec reviewers could
not complete this integration recheck because their usage quota was exhausted; the
earlier account-feature reviews above are separate results, not an independent approval
of this merge. Local typechecks/build and the combined execution evidence are complete.
