# MobG web

The Next.js frontend uses the Express API for accounts, projects, tasks,
members, search, Dashboard, My Tasks, comments and activity. See the
[repository setup](../README.md#setup) to start the database and backend.

From `web/`, copy `env.example` to `.env.local`, run `npm ci` and
`npm run dev`, then open [localhost:3000](http://localhost:3000).
Use the same hostname consistently for the frontend, API and Better Auth.

`npm run lint`, `npm run typecheck` and `npm run build` run the web checks.
Development and production builds use Webpack. Geist fonts ship with the local
package and the build can run without reaching Google Fonts.

The [W5 frontend verification](../docs/w5-frontend-verification.md) has the
Playwright commands, screenshots output location and demo steps.

Use Tab and Shift+Tab to move between controls, and Enter or Space to activate
them. The first Tab on a workspace page reveals **Skip to main content**.
Arrow keys navigate menus, search results and project tabs. Escape closes
open menus and confirmation dialogs. On desktop, Ctrl+B toggles the sidebar.
