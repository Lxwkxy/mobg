# W5 frontend verification and demo

Dashboard and My Tasks read the live API. Dashboard shows totals across the
projects the signed-in user belongs to. Its Important Tasks list shows up to five
unfinished tasks assigned to that user, sorted by priority and deadline. My Tasks
shows the user's assignments. Dashboard links can also open the broader Project
Tasks view, where the status editor is available to the Owner and assigned members.

Project Overview and Task Details share the Activity panel. It shows recent task
creation and comments from PostgreSQL. Task Details also has the comment form.
Both views use the same session guards, and the API returns a field error for
project, task and comment text containing NUL.

## Verification

Verified on 2026-11-19 (Asia/Bangkok) using a Windows production build,
Chromium, an isolated PostgreSQL 18 cluster, and Mailpit.

- Web lint, TypeScript and production build passed. Backend type checks and
  build passed. The web browser suites passed 16/16. The database suite passed
  116 checks with one optional account browser test skipped. A separate run
  verified the expanded real-API comment and activity browser case.
- The PostgreSQL suite covers role checks, session expiry, task CRUD, activity
  order and limits, cross-project scope and invalid text. The optional Chromium
  case uses a real Member session and Express routes to verify a posted comment
  in PostgreSQL and in both activity feeds.
- The web browser suites exercise layouts from 320 to 1440 px, navigation,
  Dashboard and My Tasks, loading and failure states, project form validation,
  delete confirmation, the status editor permission, and comment drafts and activity.
  These browser suites use fixtures with the current API response shapes.
- GitHub Actions runs the browser suites after the production build.
  The application bundles Geist and uses Tailwind via PostCSS. The web commands
  use Webpack because the Turbopack CSS worker exited during Windows verification.

To reproduce the browser checks locally, install the root Playwright dependency
with `npm ci` and have Chrome installed. In `web/`, run `npm ci`,
`npm run build` and `npm run start -- --hostname 127.0.0.1 --port 3100`.
Then run the browser checks from the repository root.

```powershell
$env:RESPONSIVE_OUTPUT = 'web/.next/responsive'
node --test web/test/rPai03.mjs web/test/responsive.mjs web/test/task-comments.mjs
```

Screenshots of the verified desktop and mobile layouts go to
`web/.next/responsive/`. The real API browser test also captures
`web/.next/task-comments-smoke.png`. See the
[comment verification commands](comments-verification.md#verification) to run it.

## Team demo

Use a fresh isolated database from the [W5 demo setup](../database/README.md#prepare-a-persistent-isolated-demonstration-database).

The browser rehearsal used real Owner, Member and Outsider sign-ins. It confirmed
the Owner's progress change from 20% to 40%, comment visibility in both Activity
panels, cancel and confirm behavior for a sandbox task, and logout. The Member
had a status editor for an assigned task and saw a read-only status on the Owner's task. The
Outsider saw an empty project list. Screenshots from this rehearsal are
`web/.next/w5-owner-dashboard.png` and `web/.next/w5-member-project-tasks.png`.

1. Sign in as the seeded Owner. Open Dashboard and compare the counts with
   My Tasks. Open **MobG W5 Main Demo** and check its initial 20% progress.
2. Open **Future Medium**, set the status to **Done**, and return to Project
   Overview to see 40%. Post a comment and verify it appears in Task Details
   and the project Activity panel after reopening the page.
3. Sign out and sign in as Member. Open the Dashboard task total to see Project
   Tasks. Compare the status control on an assigned task with the read-only status
   on **Future Medium**. Sign in as Outsider separately to show the empty workspace.
4. Sign in as Owner and use **MobG W5 DELETE Sandbox** to demonstrate deletion.
   Cancel the first prompt and verify the task remains. Confirm deletion on the
   second attempt and check that Main Demo remains intact. Sign out to end the demo.

Public registration and password reset require SMTP. The local test suite uses
Mailpit. Use the [account setup guide](account-registration.md) for actual delivery.
