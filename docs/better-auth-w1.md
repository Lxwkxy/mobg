# Better Auth W1 scope

Requested by Pai on 2026-10-11, before W2 starts.
Branch: better-auth-w1. Starting commit: 4054fce81dd6edf732ae5cb9648ac591d029e073.
These are the implementation criteria for the W1 changes authorized in this chat.

## W1 deliverables

1. Prepare Express + TypeScript + ESM and dev/build/start/typecheck scripts.
2. Reuse PostgreSQL/Compose and the shared pool. Keep existing project mock responses.
3. Configure Better Auth and mount its Express 5 handler before JSON parsing.
4. Define API origin, trusted frontend origin, private secret and cookie credentials.
5. Prepare a new migration after 004, preserving existing users, numeric IDs,
   domain foreign keys, demo data and the historical sessions migration.
6. Prepare the React auth client while keeping the existing W1 mock Login UI.
7. Update auth/database contracts and setup guides. Do not keep custom bcrypt or
   custom session functions as the new implementation plan.
8. Keep project Owner/Member authorization rules and numeric MobG business IDs.

## Identity decision

Better Auth 1.7.7's documented core field mapping excludes id. Mapping id directly
to users.user_id is unsupported. Use separate auth_users with Better Auth string IDs,
and a nullable, unique users.auth_user_id foreign key linking a domain profile.
Existing domain users remain unlinked until explicitly provisioned in W2.
Never parse auth.user.id as a MobG numeric user ID or link by an unverified email.
A valid session without a linked domain user must be denied access in W2.

## W2 handoff

- Pai: provision demo credentials through Better Auth's server API in an isolated
  seed process, then link the resulting auth ID to the intended existing users row.
  Public signup stays disabled in the serving configuration. Keep new-user
  provisioning and profile creation atomic; stop and reconcile on failed linking.
  Resolve normalized-email collisions before provisioning; do not merge silently.
- Pai: implement FindDomainUserByAuthId and FindProjectMembership, propagating DB errors.
- Book: read a validated session using auth.api.getSession/fromNodeHeaders, load the
  linked domain user and validate its BIGINT before converting to a safe integer.
  Deny missing/expired sessions with 401 and unlinked profiles with 403.
  Then implement business guards, membership permissions and database-backed routes.
- Bar: replace mock Login and localStorage identity with authClient.signIn.email,
  getSession/useSession and signOut; retrieve numeric MobG profile from the business API.
  Validate refresh/logout/expiry flows with Book and Pai.
- Do not add responsive work here; it remains W4.

## Execution status

Migration 005 is prepared, not applied. No real account has been seeded.
No runtime Login, database check, migration or automated test has been run for this change.
The W1 project routes and local frontend authentication remain mocks and are unsuitable
as production authorization.
