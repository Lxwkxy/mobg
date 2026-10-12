# W2 frontend handoff (for Bar)

What is ready on the backend after W2-Book-01 and W2-Book-02, and how to call it.
Types: `backend/src/contracts/api.ts`, re-exported by `web/types/index.ts`.
Complete rules: [API contract](../backend/API-CONTRACT.md).

## Setup

- API origin: `http://localhost:5000` (`NEXT_PUBLIC_AUTH_URL` in `web/.env.local`).
- Web origin must be exactly `http://localhost:3000`; the backend allows credentials
  only for `CORS_ORIGIN`. Use `localhost` consistently, not `127.0.0.1`.
- Every request must send cookies: `credentials: "include"` on `fetch`.
  `web/lib/auth-client.ts` already sets this for Better Auth.
- Public signup is disabled. Accounts are provisioned by the team
  ([procedure](w2-account-provisioning.md)); ask Pai for a test account.
- `web/AGENTS.md` warns that this Next.js version differs from older versions.
  Read the guides in `node_modules/next/dist/docs/` before changing routing or data code.

## Login flow

1. Sign in with the Better Auth client:
   `authClient.signIn.email({ email, password })`. Its errors use Better Auth's own
   shape, not the business envelope. Show one generic message for wrong credentials
   and a separate message for network failures.
2. Then call `GET /api/me`. This returns the numeric MobG profile. Keep it in React
   state or context. Do not store identity in `localStorage` (`mobg_current_user`
   and `authService.ts` are W1 mocks to remove).
3. Sign out with `authClient.signOut()` and clear the in-memory profile.

`GET /api/me` outcomes:

| Status | Meaning | UI |
|---|---|---|
| 200 | `{ success: true, user: { userId, userName, email } }` | Logged in |
| 401 `UNAUTHENTICATED` | No session or expired | Redirect to `/login` |
| 403 `FORBIDDEN` | Session exists but no MobG profile is linked | Show "account is not set up", offer sign out |

Auth IDs are strings and never appear in business responses. Business IDs are numbers.

## Business error envelope

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ { "field": "dueDate", "message": "..." } ] } }
```

Read `details[].field` and `details[].message` to show per-field errors. The top-level
`message` can be generic (for example "Request validation failed").

| Status | Code | Typical cause |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad body, query, ID or date order |
| 401 | `UNAUTHENTICATED` | Missing or expired session |
| 403 | `FORBIDDEN` | No linked profile, or role too low (Member editing/deleting a project) |
| 404 | `NOT_FOUND` | Unknown project or user is not a member (indistinguishable by design) |
| 500 | `INTERNAL_ERROR` | Server or database error |

## Endpoints available now

All require a session. Dates are `YYYY-MM-DD`; timestamps are ISO 8601 UTC.

| Method | URL | Role | Notes |
|---|---|---|---|
| GET | /api/me | Logged in | Current MobG user |
| GET | /api/users | Logged in | For picking initial members; ordered by name |
| GET | /api/projects?status=&page=&pageSize= | Logged in | Only the user's projects, newest first |
| POST | /api/projects | Logged in | Creator becomes Owner; returns 201 and `myRole: "Owner"` |
| GET | /api/projects/:projectId | Owner, Member | Includes `myRole` |
| PATCH | /api/projects/:projectId | Owner | Send only changed fields; `null` clears `projectDescription` and `dueDate` |
| DELETE | /api/projects/:projectId | Owner | Ask for confirmation in the UI first |
| GET | /api/projects/:projectId/members | Owner, Member | Owner first; feeds assignee lists in W3 |

Query rules for the project list:

- `status` is `To do`, `In progress` or `Done`; URL-encode it (`status=In%20progress`).
- `page` starts at 1; `pageSize` defaults to 10 with a maximum of 50. Invalid values
  return 400, not a silent default.
- `pagination` is `{ page, pageSize, totalItems, totalPages }`. A page beyond the end
  returns an empty `projects` array with the correct totals.

Create body:

```json
{ "projectName": "Website Redesign", "startDate": "2026-10-12", "dueDate": "2026-12-01", "memberIds": [2, 3] }
```

- Required: `projectName` (max 150) and `startDate`. The frontend initializes
  `startDate` to today in Asia/Bangkok.
- `dueDate` is optional and must be later than `startDate`.
- Send no `createdBy` or role fields; unknown keys are rejected with 400.
- An unknown user in `memberIds` returns 400 with `details[0].field = "memberIds"`.

After task status changes (W3), re-fetch the project because `derivedStatus` and
`progressPercent` are computed on every read.

## Not available yet

Add/remove members, tasks, My Tasks, comments, activity and dashboard endpoints are
still contract-only (W3 and later). Keep the existing mock data for those screens.
Dashboard `highPriorityCount` and scope are not agreed yet.

## Quick manual check

```powershell
# Sign in (Origin header is required for POST to /api/auth/*)
curl.exe -i -c cookies.txt -H "Origin: http://localhost:3000" -H "Content-Type: application/json" --data "@login.json" http://localhost:5000/api/auth/sign-in/email
curl.exe -s -b cookies.txt http://localhost:5000/api/me
```

Do not commit `login.json` or `cookies.txt`.
