# Task comments

Verified on 2026-11-18; review fixes rechecked on 2026-11-19. The task detail page at
`/projects/:projectId/tasks/:taskId` now loads and posts persisted comments.
The existing `comments` table is used; no migration is required.

## API and permissions

- `GET /api/projects/:projectId/tasks/:taskId/comments`: `200`, oldest first,
  with comment ID as the tie-breaker for equal timestamps.
- `POST` to the same URL with `{ "commentText": "Looks good" }`: `201` with the saved comment.
- Both project Owners and Members may comment on tasks created by or assigned to others.
  The backend takes the author from the session and rejects forged author fields.
- Blank text is rejected after trimming. Text is rendered as plain text, preserving line breaks.
- Anonymous/expired sessions receive `401`; a session without a MobG profile receives `403`.
  Non-members, removed members, missing tasks and cross-project task IDs receive `404`.
- Writes acquire the project's existing membership lock and recheck access before insertion.
  Removing the author while a comment waits for that lock prevents the comment from being saved.
- Task deletion cascades its comments. Database errors return the standard safe `500` response.

## Verification

All checks below passed:

| Check | Result |
|---|---|
| Backend typecheck and test typecheck | PASS |
| Frontend typecheck and lint | PASS |
| `taskRoutes.test.ts` with the optional browser test enabled | 21/21 PASS |
| Comment UI tests at 375px and 1440px, including error recovery and session revalidation | 4/4 PASS |
| Browser → real HTTP API → PostgreSQL, then page reload | PASS |

The integration suite used PostgreSQL 18 in a temporary local cluster and a fresh
database created by `run-db-tests.ts`, with the repository migrations and seed applied.
The test database was dropped and the temporary cluster stopped afterwards.
No project database data was changed.

Run the HTTP suite against an available local PostgreSQL instance configured through
the root `.env`:

```powershell
cd backend
npm run test:db -- taskRoutes.test.ts
```

For the real browser-to-database case, start the web dev server first, then set its
URL before running the same suite. Chrome and the root Playwright dependency are required:

```powershell
# From web/, in a separate terminal:
npm run dev -- --hostname 127.0.0.1 --port 3100

# From backend/:
$env:COMMENTS_WEB_URL = 'http://127.0.0.1:3100'
npm run test:db -- taskRoutes.test.ts
```

That browser case forwards API requests to the isolated test backend using a real
Member session. It verifies the saved row directly and reloads the page to verify persistence.
Without `COMMENTS_WEB_URL`, only that browser case is skipped.

The separate UI tests use intercepted API fixtures to exercise layout, blank input,
plain-text rendering, load retry, preservation of a draft after a failed POST and
after same-account focus verification, and draft isolation when the account changes:

```powershell
# From the repository root, with the web dev server running:
$env:COMMENTS_WEB_URL = 'http://127.0.0.1:3100'
node --test web/test/task-comments.mjs
```
