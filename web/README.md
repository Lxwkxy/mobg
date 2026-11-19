# MobG web

The Next.js frontend uses the Express API for accounts, projects, tasks,
members, search, Dashboard, My Tasks and comments. See the
[repository setup](../README.md#setup) to start the database and backend.

From `web/`, run `npm run lint`, `npm run typecheck` and `npm run build`
to check the frontend. Development and production builds use Webpack.
Geist fonts ship with the local package.

## Browser checks

From the repository root, install the browser test dependencies with `npm ci`.
The local suites use Google Chrome. Set up `web/.env.local` as described
in the [repository setup](../README.md#2-create-your-local-settings-files).
Install the web dependencies with `npm ci` from `web/`.

Build and start the production web server in one terminal from the repository root.

```sh
npm --prefix web run build
npm --prefix web run start -- --hostname 127.0.0.1 --port 3100
```

Run the browser checks from the repository root in another terminal.

```powershell
$env:RESPONSIVE_BASE_URL = 'http://127.0.0.1:3100'
$env:COMMENTS_WEB_URL = 'http://127.0.0.1:3100'
$env:RESPONSIVE_OUTPUT = 'web/.next/responsive'
node --test web/test/rPai03.mjs web/test/responsive.mjs web/test/task-comments.mjs
```

These checks use API fixtures and write responsive screenshots to
`web/.next/responsive/`. The backend guide covers the
[real API comment check](../backend/README.md#tests).

## Keyboard controls

Use Tab and Shift+Tab to move between controls, and Enter or Space to activate
them. The first Tab on a workspace page reveals **Skip to main content**.
Arrow keys navigate menus, search results and project tabs. Escape closes
open menus and confirmation dialogs. On desktop, Ctrl+B toggles the sidebar.
