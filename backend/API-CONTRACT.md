# MobG — API Contract, Authentication, Permissions, and Data Rules (W1)

A shared contract for Bar (Frontend) and Pai (Database / Functions).  
Reference schema: [`../database/schema-mapping.md`](../database/schema-mapping.md)

Week 1 delivers this contract only. Real endpoints are implemented from week 2.

Status indicators:

- **[Confirmed]**: Already agreed upon in `schema-mapping.md` or existing code.
- **[Confirmed by Pai]**: Proposed by Backend and accepted by Pai in `schema-mapping.md` (Book's PR #5, accepted 2026-10-10).
- **[Confirmed by Pai · Bar pending]**: Accepted by Pai; it changes what the frontend sends or receives, so Bar still needs to confirm.
- **[Proposed]**: Proposed by Backend; awaiting team confirmation from Bar / Pai.

## Confirmation Status

Pai's acceptance is limited to the Login, database, and session contracts. `schema-mapping.md` states that it does not approve every proposed API or permission rule in PR #5.

| Area | Status |
|---|---|
| Login by email, email normalization, `bcryptjs` with cost 10 | Accepted by Pai |
| `findUserForLoginByEmail`, `findProjectMembership` contracts | Accepted by Pai (implementation in W2) |
| ID boundaries (decimal strings in DB results, safe positive integers in the API) | Accepted by Pai |
| Database-backed sessions: `sessions` table (migration `004_add_sessions.sql`), cookie, and the three session functions | Accepted by Pai (functions in W2) |
| Creator becomes `Owner` and project creation transaction; role values exactly `Owner` and `Member` | Accepted by Pai |
| **Permission matrix** (section 5) and **member-removal policy** (section 8) | **Needs separate team confirmation** |
| Project deletion cascade, `isOverdue`, status filter parameter, numeric `priority` in the API, response field names | **Proposed**; needs Bar and Pai |
| Sections 10–11 (endpoint and database function contracts for the feature endpoints) | **Proposed**; needs Bar and Pai |
| Bar | Pending. Please confirm the items tagged "Bar pending" (numeric IDs, `credentials: 'include'`) and review sections 5 and 8–10. |

---

## 0. Running the Backend

```powershell
docker compose up -d                 # From the repository root
cd backend
npm ci
npm start                            # Runs node server.cjs
```

- **Port**: Configured via `PORT` in `.env` (default: **5000**).
- **CORS**: Configured via `CORS_ORIGIN` (default: `http://localhost:5173`). Must specify an explicit origin (wildcard `*` is not permitted because cookies/credentials are used).
- **Health Check**: `GET http://localhost:5000/api/health`
- **Database Verification**: Run `node check-db.cjs` (must return `MobG Demo Project` with exit code 0).
- **Frontend Requirement**: Must send `credentials: 'include'` (Fetch API) or `withCredentials: true` (Axios) on every request.

Full setup steps are in [`README.md`](README.md) in this folder.

---

## 1. Login / Logout / Current User

| Endpoint | Request Body | Success Response | Error Response |
|---|---|---|---|
| `POST /api/auth/login` | `{ email, password }` | `200` `{ success, user }` + sets session cookie | `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` |
| `GET /api/auth/me` | None | `200` `{ success, user }` | `401 UNAUTHENTICATED` |
| `POST /api/auth/logout` | None | `200` `{ success, message }` + clears cookie | Idempotent (no error on duplicate calls) |

- **User Object**: `{ userId, userName, email }`. **[Confirmed]** `password_hash` must **never** be exposed in any API response.
- **Login Identifier**: `email` (unique constraint in `users.email`). `user_name` is non-unique and must not be used as an account identifier. **[Confirmed]**
- **Account Status**: The database schema does not have an account status column; there is no "suspended account" state. **[Confirmed]**
- **[Confirmed by Pai]** `email`: Validate it as a string, then apply `.trim().toLowerCase()` before the database lookup. Account inserts and updates, including demo seeds, must store the same normalized email (PostgreSQL's `UNIQUE` on `users.email` is case-sensitive). Before normalizing existing accounts, Pai checks for collisions with `lower(btrim(email))` and resolves them explicitly.
- **[Proposed]** Return the generic message and code `401 INVALID_CREDENTIALS` for both non-existent emails and incorrect passwords to prevent account enumeration.

---

## 2. Session Management **[Confirmed by Pai]**

- Use **Database-backed Sessions** (stateless JWT and in-memory session stores are avoided so that logouts invalidate sessions immediately, server restarts do not disconnect users, and no session library is required). Reading the cookie needs `cookie-parser` or a small manual parser; choose one in W2.
- **Token**: `token = crypto.randomBytes(32).toString('hex')`, sent in the cookie. The database stores only `crypto.createHash('sha256').update(token, 'utf8').digest('hex')` (64 lowercase hex characters). Lookup and logout hash the exact cookie text the same way; hashing the original random Buffer gives a different digest. The raw token is never stored.
- **Cookie Specification**: Name `mobg_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, with a 7-day TTL.
- **Database**: Migration `004_add_sessions.sql` creates the `sessions` table (accepted by Pai; the runtime functions are W2 work):
  `session_id` (BIGINT identity PK), `user_id` (BIGINT FK → `users`, `ON DELETE CASCADE`), `token_hash` (TEXT UNIQUE), `created_at` (TIMESTAMPTZ, default `CURRENT_TIMESTAMP`), `expires_at` (TIMESTAMPTZ, no default; must be later than `created_at`).
  - The backend supplies `expires_at` explicitly (now + 7 days). The table does not enforce the seven-day lifetime or delete expired rows by itself.
  - Reads must require `expires_at > CURRENT_TIMESTAMP`; an expired row may remain in the table.
  - Indexes on `user_id` and `expires_at` support removing a user's sessions and cleaning up expired rows.
  - The table does not grant project membership; use `findProjectMembership` for that.
- **Lifecycle Behavior** **[Proposed · Bar pending]**:
  - **Page Refresh**: Frontend invokes `GET /api/auth/me` on initial mount. If `200 OK`, keep current view.
  - **Logout**: Delete the database session record, clear the cookie, and redirect to the Login view.
  - **Expired / Missing Session**: Protected endpoints respond with `401 UNAUTHENTICATED`. Frontend redirects user to Login (no automated retries).
- `user_id` used for authorization checks must be derived strictly from the validated backend session—never from the request body or query parameters. **[Confirmed]**

---

## 3. Password Hashing

- Use **bcryptjs** (already listed in `package.json`) with cost `10`. Verification is performed using `bcrypt.compare(plain, hash)`. Do not trim or lowercase passwords. The existing `TEXT` column fits bcrypt hashes, so no password-column migration is needed. **[Confirmed by Pai]**
- **Credential Generation for Pai**: Run `node hash-helper.cjs "<sample_password>"` and copy the resulting hash into `users.password_hash`.
- The hash in the demo seed is currently a placeholder. Valid accounts must be created using this script before Login testing in W2. **[Confirmed]**
- Use sample passwords strictly for demonstration purposes.

---

## 4. Core Database Function Contracts (Coordinated with Pai)

These five functions support Login, sessions, and permission checks. All are **[Confirmed by Pai]**; implementation is W2 work. Functions for the feature endpoints are in section 11.

| Function | Parameters | Returns |
|---|---|---|
| `findUserForLoginByEmail(email)` | `email: string`, already trimmed and lowercase | `{ user_id: string, user_name, email, password_hash }` or `null` |
| `findProjectMembership(project_id, user_id)` | `project_id: number`, `user_id: number` (positive safe integers) | `{ project_id: string, user_id: string, role }` or `null` |
| `createSession(user_id, token_hash, expires_at)` | `user_id: number`, `token_hash`: SHA-256 hex string, `expires_at`: future `Date` | `void` after the insert |
| `findSessionUser(token_hash)` | `token_hash`: SHA-256 hex string | `{ user_id: string, user_name, email }` for an unexpired matching session, otherwise `null` |
| `deleteSession(token_hash)` | `token_hash`: SHA-256 hex string | `void`; deleting an absent token succeeds |

- Database errors must be **re-thrown**, not swallowed to return `null`. A return value of `null` strictly denotes "record not found" (or, for sessions, "no usable session").
- `findProjectMembership` returns `null` for both non-existent projects and non-member users. Membership alone does not authorize all actions; the backend must inspect the returned `role`. `role` is exactly `Owner` or `Member`; an unknown role must not be granted any permission.
- `password_hash` is for backend authentication only and is never returned by `findSessionUser` or included in any API response.
- **ID Boundaries** **[Confirmed by Pai · Bar pending]**:
  - Database results keep `BIGINT` values as decimal strings (`pg` default). Do not change the global `pg` `BIGINT` parser and never round a large ID.
  - The backend converts an ID to a number only after checking `Number.isSafeInteger(id) && id > 0`. The API therefore supports only the positive safe-integer subset of `BIGINT`.
  - IDs from URLs or bodies must be validated in full before conversion (`1abc` is invalid, not `1`). An invalid request ID returns `400 VALIDATION_ERROR`. Do not run a SQL lookup with a rounded ID.
  - A stored ID outside the safe-integer range is an explicit backend error (`500 INTERNAL_ERROR`), never a rounded or truncated ID.

---

## 5. Permission Matrix (Roles: `Owner` vs `Member`)

| Action | Authenticated User | Member | Owner | Status |
|---|:---:|:---:|:---:|---|
| Create Project | ✅ (Assigned Owner role) | - | - | [Confirmed] |
| Read Project / Tasks / Member List | ❌ | ✅ | ✅ | [Proposed] |
| Create / Edit Task (including status and assignees) | ❌ | ✅ | ✅ | [Proposed] |
| Delete Task | ❌ | ❌ | ✅ | [Proposed] |
| Edit / Delete Project | ❌ | ❌ | ✅ | [Proposed] |
| Add / Remove Members | ❌ | ❌ | ✅ | [Proposed] |
| Read / Add Comments | ❌ | ✅ | ✅ | [Proposed] |
| Read Activity | ❌ | ✅ | ✅ | [Proposed] |
| List Users (for member selection), Dashboard, My Tasks | ✅ (own scope) | - | - | [Proposed] |

Pai accepted the `Owner` / `Member` role values and the project creation rules below. The permission matrix itself, including who may edit or delete, still needs separate team confirmation.

**Project Creation Rules** [Confirmed by Pai]:
- `projects.created_by` is set from the authenticated session user.
- The creator is assigned the `Owner` role. Additional selected members receive the `Member` role.
- If the creator is included in the selected members list, keep only one membership row with role `Owner` (do not overwrite with `Member`).
- Project and member records must be created within a **single database transaction**, returning success only after a complete `COMMIT`.

**Access Control Enforcement** **[Proposed]**:
- Unauthenticated request → `401 UNAUTHENTICATED`
- Non-member or non-existent project → `404 NOT_FOUND` (do not disclose whether the project exists)
- Project member with insufficient permissions → `403 FORBIDDEN`

---

## 6. Values, Mappings, and Validation Rules

### Status Mapping [Confirmed]
The database preserves existing names; the API maps them to UI display labels:

| DB `status_name` | API `status` / UI Label |
|---|---|
| `To Do` | `To do` |
| `Doing` | `In progress` |
| `Done` | `Done` |

- Backend resolves `status_id` dynamically from `task_statuses` by name. Hardcoded integer status IDs are prohibited.
- New tasks default to `To Do`. The backend must supply the `status_id` explicitly (the schema has no default constraint).
- There is no fourth status called "Not started".

### Priority [Confirmed DB · Proposed API · Bar pending]
The database stores `SMALLINT` (`1` = High, `2` = Medium, `3` = Low) with a `CHECK` constraint.  
API sends and receives priority as numeric values (`1 | 2 | 3`). The frontend handles localization/labeling.

### Required Fields & Constraints [Confirmed]

| Entity / Field | Validation Rule |
|---|---|
| Project: `projectName` | Required (maximum 150 characters) |
| Project: `startDate` | Required; defaults to current date in `Asia/Bangkok` (user editable) |
| Project: `dueDate` | Optional; if provided, must be **strictly later than** `startDate` (same date is rejected) |
| Task: `taskTitle` | Required (maximum 200 characters) |
| Task: `priority` | Required (`1`, `2`, or `3`; schema has no default) |
| Task: `dueDate` | **Required** (enforced by migration 002) |
| Task: `assigneeIds` | Required **(minimum 1 assignee)**; all assignees must belong to the project; distinct users only |
| Task: `description` | Optional |

- Every task must keep at least one assignee **in every status, including `Done`**. The last assignee cannot be removed from a task without assigning a replacement.
- Date string format must be `YYYY-MM-DD`. Malformed dates return `400 VALIDATION_ERROR`.
- *Note*: Minimum assignee count and project membership checks are currently **not enforced at the database level** and must be validated by the Backend in W2.

---

## 7. Progress, Derived Status, and Overdue Calculation

### Project Progress [Confirmed]
- `totalTasks` = Count of distinct `task_id` rows for the project.
- `completedTasks` = Count of tasks where status is `Done`.
- `progressPercent = ROUND(100.0 * completedTasks / totalTasks)`. If `totalTasks == 0`, return `0` (avoid division by zero).
- Examples: 4/10 = 40, 8/12 = 67. Tasks with multiple assignees are counted exactly once.
- Calculated on the fly from tasks and statuses; no separate progress column is stored.

### Derived Project Status (`derivedStatus`) [Confirmed]
Evaluated sequentially using the following precedence rules:

| Condition | `derivedStatus` |
|---|---|
| Project has no tasks, or every task is `To Do` | `To do` |
| Project has at least 1 task, and all tasks are `Done` | `Done` |
| All other cases (contains `In progress` tasks, or mixed `To do` and `Done`) | `In progress` |

- Recalculated upon every project read. Frontend must re-fetch project details after task status updates.
- Status filters (`All`, `To do`, `In progress`, `Done`) must be validated and applied by the backend **prior** to pagination.
- Filter query parameter **[Proposed]** (`schema-mapping.md` leaves the exact parameter and response field names to be agreed): `GET /api/projects?status=To do|In progress|Done` (omitted returns all; URL-encode the value, e.g. `status=In%20progress`).

### Overdue Calculation (`isOverdue`) **[Proposed]**
- A task is overdue if `dueDate < today` (evaluated in `Asia/Bangkok` date comparison) **and** `status != 'Done'`. Completed tasks are never overdue.
- The API delivers `isOverdue: boolean` computed by the backend; the frontend should not duplicate this calculation.
- Extended Dashboard metrics (High priority counts, user-scoped metrics) will be finalized in W2.

---

## 8. Cascading and Deletion Policies

- **Deleting a Task**: Associated comments are automatically deleted via `ON DELETE CASCADE` on `comments.task_id` [Confirmed]. Assignee associations in `task_assignees` are removed (Pai to verify FK behavior).
- **Deleting a Project** (`Owner` only) **[Proposed]**: Tasks, assignees, comments, and project membership rows are deleted within a single database transaction. The frontend must prompt for explicit confirmation before invocation. *(Pai must verify whether foreign keys for `tasks`, `project_members`, and `task_assignees` have `CASCADE` configured or require manual ordered deletion).*
- **Removing a Member from a Project** (`Owner` only) **[Proposed]** (`schema-mapping.md` says the member-removal policy needs separate team confirmation):
  - If the member is the **sole assignee of any task in the project, regardless of the task's status (including `Done`)** → Reject with `409 CONFLICT` (`reason: SOLE_ASSIGNEE`). Every task must keep at least one assignee, so completed tasks are covered too. The response lists the affected tasks.
  - If every task the member is assigned to has at least one other assignee → Remove the member from those tasks and from the project within the same transaction.
  - The last remaining `Owner` cannot be removed from the project → Reject with `409 CONFLICT` (`reason: LAST_OWNER`).
  - A user who is not a member of the project → `404 NOT_FOUND`.

---

## 9. Standard Response Envelope and Error Codes

Success envelope: `{ "success": true, ... }`  
Failure envelope: `{ "success": false, "error": { "code": string, "message": string, "details"?: array } }`

| HTTP Status | Error Code | Trigger Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing or invalid fields, malformed JSON, invalid ID, invalid query parameter, date ordering violation |
| `401` | `INVALID_CREDENTIALS` | Invalid email or password |
| `401` | `UNAUTHENTICATED` | Missing or expired session cookie |
| `403` | `FORBIDDEN` | Insufficient permissions for the requested action |
| `404` | `NOT_FOUND` | Route not found, project or task not found, or user is not a project member |
| `409` | `CONFLICT` | Action violates business rules (removing a sole assignee of any task including `Done`, removing the last Owner, adding someone who is already a member) |
| `500` | `INTERNAL_ERROR` | Internal server or unhandled database exception (no stack trace leaked) |

### Error JSON Payloads

```json
// 400 Validation Error (e.g., POST /api/auth/login without password)
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Missing required fields",
    "details": [
      { "field": "password", "message": "password is required" }
    ]
  }
}

// 400 Invalid Date Range
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "dueDate must be later than startDate",
    "details": [
      { "field": "dueDate", "message": "must be later than startDate" }
    ]
  }
}

// 401 Unauthenticated (e.g., GET /api/auth/me without valid cookie)
{
  "success": false,
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication required. Please log in."
  }
}

// 401 Invalid Credentials
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect"
  }
}

// 403 Forbidden (e.g., Member attempting to delete a project)
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action"
  }
}

// 404 Not Found (Non-member or non-existent project)
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found"
  }
}

// 409 Conflict (Removing a member who is the sole assignee of a task, in any status including Done)
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Member is the sole assignee of one or more tasks (including completed tasks). Reassign those tasks before removing.",
    "details": [
      { "reason": "SOLE_ASSIGNEE", "taskId": 7, "taskTitle": "Write final report", "status": "Done" }
    ]
  }
}

// 409 Conflict (Removing the last Owner)
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "The last Owner cannot be removed from the project.",
    "details": [ { "reason": "LAST_OWNER" } ]
  }
}
```

---

## 10. Endpoint Contracts **[Proposed]**

Status: all endpoints below are contract only in W1. Only `GET /api/health` and the mock auth/project routes exist (see section 12).

**Conventions**
- Base path `/api`. Requests and responses are JSON.
- Every endpoint except `GET /api/health` and `POST /api/auth/login` requires a valid session (`401 UNAUTHENTICATED` otherwise).
- Endpoints with `:projectId` apply the access rules in section 5 (non-member or unknown project → `404`; insufficient role → `403`). A task is only reachable through the project it belongs to; a task from another project returns `404`.
- IDs are numbers. Dates are `YYYY-MM-DD`. Timestamps are ISO 8601 UTC strings.
- Status values in the API are the UI labels `To do | In progress | Done` (section 6).

### 10.1 Endpoint summary

| Method | URL | Role | Purpose | DB functions (section 11) |
|---|---|---|---|---|
| POST | `/api/auth/login` | Public | Log in | `findUserForLoginByEmail`, `createSession` |
| GET | `/api/auth/me` | Logged in | Current user | `findSessionUser` |
| POST | `/api/auth/logout` | Any | Log out | `deleteSession` |
| GET | `/api/users` | Logged in | Users to pick as members | `listUsers` |
| GET | `/api/projects` | Logged in | My projects (filter, pagination) | `listProjectsForUser` |
| POST | `/api/projects` | Logged in | Create project; creator becomes Owner | `createProjectWithMembers`, `getProjectById` |
| GET | `/api/projects/:projectId` | Owner, Member | Project details | `findProjectMembership`, `getProjectById` |
| PATCH | `/api/projects/:projectId` | Owner | Edit project | `findProjectMembership`, `updateProject`, `getProjectById` |
| DELETE | `/api/projects/:projectId` | Owner | Delete project | `findProjectMembership`, `deleteProject` |
| GET | `/api/projects/:projectId/members` | Owner, Member | Member list (also the assignee dropdown) | `findProjectMembership`, `listProjectMembers` |
| POST | `/api/projects/:projectId/members` | Owner | Add a member | `findProjectMembership`, `addProjectMember` |
| DELETE | `/api/projects/:projectId/members/:userId` | Owner | Remove a member | `findProjectMembership`, `removeProjectMember` |
| GET | `/api/projects/:projectId/tasks` | Owner, Member | Task list | `findProjectMembership`, `listTasksByProject` |
| POST | `/api/projects/:projectId/tasks` | Owner, Member | Create task | `findProjectMembership`, `listProjectMembers`, `createTask`, `getTaskById` |
| GET | `/api/projects/:projectId/tasks/:taskId` | Owner, Member | Task details | `findProjectMembership`, `getTaskById` |
| PATCH | `/api/projects/:projectId/tasks/:taskId` | Owner, Member | Edit task, change status, change assignees | `findProjectMembership`, `getTaskById`, `listProjectMembers`, `updateTask` |
| DELETE | `/api/projects/:projectId/tasks/:taskId` | Owner | Delete task | `findProjectMembership`, `getTaskById`, `deleteTask` |
| GET | `/api/tasks/mine` | Logged in | My Tasks (assigned to me) | `listTasksForAssignee` |
| GET | `/api/projects/:projectId/tasks/:taskId/comments` | Owner, Member | Comments of a task | `findProjectMembership`, `getTaskById`, `listCommentsByTask` |
| POST | `/api/projects/:projectId/tasks/:taskId/comments` | Owner, Member | Add a comment | `findProjectMembership`, `getTaskById`, `createComment` |
| GET | `/api/projects/:projectId/activity` | Owner, Member | Project activity feed | `findProjectMembership`, `listActivityByProject` |
| GET | `/api/projects/:projectId/tasks/:taskId/activity` | Owner, Member | Task activity feed | `findProjectMembership`, `getTaskById`, `listActivityByTask` |
| GET | `/api/dashboard` | Logged in | Dashboard counts | `getDashboardSummary` |

### 10.2 Auth

`POST /api/auth/login`

```json
// Request
{ "email": "demo@mobg.local", "password": "password123" }

// 200 (also sets the mobg_session cookie)
{ "success": true, "user": { "userId": 1, "userName": "Demo Member", "email": "demo@mobg.local" } }
```

`GET /api/auth/me` → `200` `{ "success": true, "user": { "userId": 1, "userName": "Demo Member", "email": "demo@mobg.local" } }`  
`POST /api/auth/logout` → `200` `{ "success": true, "message": "Logged out successfully" }`

### 10.3 Users

`GET /api/users` → `200`

```json
{
  "success": true,
  "users": [
    { "userId": 1, "userName": "Demo Member", "email": "demo@mobg.local" }
  ]
}
```

Ordered by `userName`, then `userId`. `userName` is not unique, so `email` is returned to tell users apart.

### 10.4 Projects

Project object:

```json
{
  "projectId": 1,
  "projectName": "MobG Demo Project",
  "projectDescription": "Demo project for the MobG schema",
  "startDate": "2026-10-07",
  "dueDate": null,
  "createdAt": "2026-10-07T03:15:00.000Z",
  "creatorId": 1,
  "creatorName": "Demo Member",
  "myRole": "Owner",
  "derivedStatus": "In progress",
  "progressPercent": 40,
  "totalTasks": 10,
  "completedTasks": 4
}
```

`GET /api/projects?status=In%20progress&page=1&pageSize=10`
- `status` optional: `To do | In progress | Done`. Applied before pagination.
- `page` default `1`; `pageSize` default `10`, maximum `50`. Invalid values → `400 VALIDATION_ERROR`.
- Order: newest first (`createdAt` descending, then `projectId` descending).

```json
// 200
{
  "success": true,
  "projects": [ { "...": "project object" } ],
  "pagination": { "page": 1, "pageSize": 10, "totalItems": 1, "totalPages": 1 }
}
```

`POST /api/projects` (creator becomes `Owner`; `memberIds` become `Member`)

```json
// Request
{
  "projectName": "Website Redesign",
  "projectDescription": "Optional text",
  "startDate": "2026-10-12",
  "dueDate": "2026-12-01",
  "memberIds": [2, 3]
}

// 201
{ "success": true, "project": { "...": "project object with myRole: Owner" } }
```

- `projectName` and `startDate` required; `projectDescription`, `dueDate`, `memberIds` optional.
- Unknown user in `memberIds` → `400 VALIDATION_ERROR` with `details: [{ "field": "memberIds", ... }]`.

`GET /api/projects/:projectId` → `200` `{ "success": true, "project": { ... } }`

`PATCH /api/projects/:projectId` (Owner only; send only the fields to change)

```json
// Request
{ "projectName": "New name", "dueDate": null }

// 200
{ "success": true, "project": { "...": "updated project object" } }
```

- Editable: `projectName`, `projectDescription`, `startDate`, `dueDate`. `null` clears `projectDescription` and `dueDate`.
- At least one field is required. `dueDate` is checked against the new or existing `startDate` (section 6).

`DELETE /api/projects/:projectId` (Owner only) → `200` `{ "success": true, "message": "Project deleted" }` (cascade per section 8).

### 10.5 Members

Member object: `{ "userId": 2, "userName": "Somchai", "email": "somchai@mobg.local", "role": "Member", "joinDate": "2026-10-07" }`

`GET /api/projects/:projectId/members` → `200` `{ "success": true, "members": [ ... ] }`. Order: `Owner` first, then `userName`, then `userId`. This endpoint feeds the assignee dropdown and **must be ready in week 2**.

`POST /api/projects/:projectId/members` (Owner only)

```json
// Request
{ "userId": 4 }

// 201
{ "success": true, "member": { "userId": 4, "userName": "Malee", "email": "malee@mobg.local", "role": "Member", "joinDate": "2026-10-12" } }
```

- Unknown user → `400 VALIDATION_ERROR`. Already a member → `409 CONFLICT` (`reason: ALREADY_MEMBER`).
- This version has no endpoint to change a member's role.

`DELETE /api/projects/:projectId/members/:userId` (Owner only) → `200` `{ "success": true, "message": "Member removed" }`. Rules and `409` responses are in section 8.

### 10.6 Tasks

Task object:

```json
{
  "taskId": 1,
  "taskTitle": "Prepare database demo",
  "taskDescription": "Ensure Docker and seed data work correctly",
  "priority": 1,
  "dueDate": "2026-10-11",
  "isOverdue": false,
  "createdAt": "2026-10-07T03:20:00.000Z",
  "projectId": 1,
  "projectName": "MobG Demo Project",
  "status": "To do",
  "createdById": 1,
  "createdByName": "Demo Member",
  "assignees": [
    { "userId": 1, "userName": "Demo Member" }
  ]
}
```

`assignees` lists every assignee ordered by `userName`, then `userId`. The UI shows the first two and `+N` for the rest.

`GET /api/projects/:projectId/tasks?status=To%20do` → `200` `{ "success": true, "tasks": [ ... ] }`
- `status` optional. Order: `dueDate` ascending, then `taskId`. No pagination in this version.

`POST /api/projects/:projectId/tasks`

```json
// Request
{
  "taskTitle": "Write test plan",
  "taskDescription": "Optional text",
  "priority": 2,
  "dueDate": "2026-10-20",
  "assigneeIds": [1, 2]
}

// 201 (status starts as "To do"; createdById comes from the session)
{ "success": true, "task": { "...": "task object" } }
```

- Required: `taskTitle`, `priority`, `dueDate`, `assigneeIds`. `assigneeIds` needs at least one distinct user, and every user must be a member of the project; otherwise `400 VALIDATION_ERROR` with `details: [{ "field": "assigneeIds", ... }]`.

`GET /api/projects/:projectId/tasks/:taskId` → `200` `{ "success": true, "task": { ... } }`

`PATCH /api/projects/:projectId/tasks/:taskId` (Owner and Member; send only the fields to change)

```json
// Request
{ "status": "In progress", "assigneeIds": [1, 3] }

// 200
{ "success": true, "task": { "...": "updated task object" } }
```

- Editable: `taskTitle`, `taskDescription`, `priority`, `dueDate`, `status`, `assigneeIds`.
- `assigneeIds` replaces the whole assignee list and follows the same rules as create. `dueDate` cannot be `null`.
- After a status change the frontend must re-fetch the project (`derivedStatus` and `progressPercent` change).

`DELETE /api/projects/:projectId/tasks/:taskId` (Owner only) → `200` `{ "success": true, "message": "Task deleted" }`

`GET /api/tasks/mine?status=Done` → `200` `{ "success": true, "tasks": [ ... ] }`
- Tasks assigned to the current user across all projects. Same task object (includes `projectId` and `projectName`). Order: `dueDate` ascending, then `taskId`.

### 10.7 Comments

Comment object: `{ "commentId": 5, "commentText": "Looks good", "createdAt": "2026-10-08T09:00:00.000Z", "userId": 1, "userName": "Demo Member" }`

`GET .../tasks/:taskId/comments` → `200` `{ "success": true, "comments": [ ... ] }` (oldest first)

`POST .../tasks/:taskId/comments`

```json
// Request
{ "commentText": "Looks good" }

// 201
{ "success": true, "comment": { "...": "comment object" } }
```

`commentText` is required and must not be empty after trimming. The author is the session user.

### 10.8 Activity

Scope is task creation and comments only [Confirmed in `schema-mapping.md`].

Activity object:

```json
{
  "activityId": "comment_added:5",
  "activityType": "comment_added",
  "occurredAt": "2026-10-08T09:00:00.000Z",
  "actorId": 1,
  "actorName": "Demo Member",
  "taskId": 1,
  "taskTitle": "Prepare database demo",
  "commentId": 5,
  "commentText": "Looks good"
}
```

- `activityType` is `task_created` or `comment_added`. `commentId` and `commentText` are `null` for `task_created`. `activityId` is `<activityType>:<source row id>` and is unique, for use as a list key.
- `GET /api/projects/:projectId/activity?limit=20` combines entries of all tasks in the project. `GET .../tasks/:taskId/activity?limit=20` returns that task's creation entry and comments.
- `limit` default `20`, maximum `100`. Order: newest first by `occurredAt`, then `activityType`, then source row id descending.
- Response: `{ "success": true, "activities": [ ... ] }`

### 10.9 Dashboard

`GET /api/dashboard` → `200`

```json
{
  "success": true,
  "summary": {
    "projectCount": 3,
    "taskCount": 25,
    "statusCounts": { "todo": 10, "inProgress": 6, "done": 9 },
    "overdueCount": 2,
    "highPriorityCount": 5
  }
}
```

- Scope: projects the current user belongs to. Each distinct task is counted once.
- **[Pending]** `highPriorityCount` (proposed rule: `priority = 1` and status not `Done`) and the dashboard user scope are not confirmed yet in `schema-mapping.md`.

---

## 11. Database Function Contracts for Feature Endpoints **[Proposed]**

Owner of these functions: Pai. Called by the backend.

**Conventions**
- Inputs with several values are passed as one object. All IDs are numbers.
- Rows are returned in `snake_case`. `BIGINT` values stay decimal strings in database results; the backend converts them to numbers only after the safe-integer check and maps names to `camelCase` (section 4, ID Boundaries). `COUNT` values may also arrive as strings.
- `null` means "not found". Database errors are re-thrown. Failed foreign keys and duplicate keys are re-thrown as is, so the backend can map them to `400` or `409`.
- Task `status_name` uses the database names `To Do | Doing | Done`. Project `derived_status` uses the UI labels `To do | In progress | Done` because it is not stored. The backend maps `status_name` to the UI label.
- Functions that change several tables run in one transaction on one connection.
- Dates are compared in `Asia/Bangkok` (section 7).

### 11.1 Users and projects

| Function | Input | Output |
|---|---|---|
| `listUsers()` | none | `[{ user_id, user_name, email }]` ordered by `user_name`, `user_id` |
| `listProjectsForUser({ user_id, status, page, page_size })` | `status`: `null` or `'To do' \| 'In progress' \| 'Done'` (filter applied before paging) | `{ items: [project], total_items }` newest first, where `project` = `{ project_id, project_name, project_description, start_date, due_date, project_create_date, created_by, creator_name, my_role, total_tasks, completed_tasks, progress_percent, derived_status }` |
| `getProjectById(project_id)` | project id | `project` without `my_role`, or `null` |
| `createProjectWithMembers({ project_name, project_description, start_date, due_date, created_by, member_ids })` | `member_ids`: array of ids, may be empty | `{ project_id }`. Creator gets `Owner`, others `Member`, creator is not duplicated; one transaction. An unknown id in `member_ids` throws a foreign key error. |
| `updateProject(project_id, changes)` | `changes`: any of `project_name`, `project_description`, `start_date`, `due_date` | `true` if the project exists, else `false` |
| `deleteProject(project_id)` | project id | `true` if deleted, else `false`. Removes comments, assignees, tasks, memberships, and the project in one transaction. |

### 11.2 Members

| Function | Input | Output |
|---|---|---|
| `listProjectMembers(project_id)` | project id | `[{ user_id, user_name, email, role, date_join }]`, `Owner` first, then `user_name`, `user_id` |
| `addProjectMember(project_id, user_id)` | ids | `{ project_id, user_id, role: 'Member', date_join }`. Duplicate or unknown user throws a key error. |
| `removeProjectMember(project_id, user_id)` | ids | `{ removed: true }` or `{ removed: false, reason }` where `reason` is `NOT_MEMBER`, `LAST_OWNER`, or `SOLE_ASSIGNEE` (the last one also returns `tasks: [{ task_id, task_title, status_name }]`). The sole-assignee check covers tasks in every status including `Done`. On success it removes the user from the project's `task_assignees` rows and from `project_members` in one transaction. |

### 11.3 Tasks

`task` row: `{ task_id, task_title, task_description, priority, due_date, task_create_date, project_id, project_name, status_name, is_overdue, created_by, created_by_name, assignees: [{ user_id, user_name }] }` with `assignees` ordered by `user_name`, `user_id`.

| Function | Input | Output |
|---|---|---|
| `listTasksByProject({ project_id, status_name })` | `status_name`: `null` or `'To Do' \| 'Doing' \| 'Done'` | `[task]` ordered by `due_date`, `task_id` |
| `getTaskById(project_id, task_id)` | ids | `task`, or `null` if the task does not exist **in that project** |
| `listTasksForAssignee({ user_id, status_name })` | as above | `[task]` ordered by `due_date`, `task_id` |
| `createTask({ project_id, task_title, task_description, priority, due_date, created_by, assignee_ids })` | `assignee_ids`: array of ids | `{ task_id }`. Resolves the `To Do` `status_id` by name; inserts the task and its assignees in one transaction. The backend validates membership and the minimum of one assignee first (section 6). |
| `updateTask(task_id, changes)` | `changes`: any of `task_title`, `task_description`, `priority`, `due_date`, `status_name`, `assignee_ids` | `true` if the task exists, else `false`. `status_name` is resolved to `status_id` by name. `assignee_ids` replaces the whole set in the same transaction. |
| `deleteTask(task_id)` | task id | `true` if deleted, else `false`. Removes `task_assignees` rows and the task; comments are removed by `ON DELETE CASCADE`. |

`is_overdue` = `due_date` is before today in `Asia/Bangkok` and `status_name` is not `Done`.

### 11.4 Comments, activity, dashboard

| Function | Input | Output |
|---|---|---|
| `listCommentsByTask(task_id)` | task id | `[{ comment_id, comment_text, comment_created_at, user_id, user_name }]` oldest first |
| `createComment({ task_id, user_id, comment_text })` | `user_id` from the session | the created comment row (same shape) |
| `listActivityByProject(project_id, limit)` | ids and limit | `[activity]` |
| `listActivityByTask(task_id, limit)` | ids and limit | `[activity]` |
| `getDashboardSummary(user_id)` | session user | `{ project_count, task_count, todo_count, in_progress_count, done_count, overdue_count, high_priority_count }` over the user's projects, each task counted once |

`activity` row: `{ activity_type, occurred_at, actor_id, actor_name, task_id, task_title, comment_id, comment_text }`. `activity_type` is `task_created` (source `tasks`, actor `created_by`, time `task_create_date`) or `comment_added` (source `comments`). `comment_id` and `comment_text` are `null` for `task_created`. Order: `occurred_at` descending, then `activity_type`, then the source row id descending.

---

## 12. Endpoint Readiness Summary

| Endpoint | Readiness Status |
|---|---|
| `GET /api/health` | Fully functional |
| `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` | Mock endpoints active (Live DB auth targeted for W2) |
| `GET /api/projects`, `GET /api/projects/:projectId/members` | Mock endpoints active (real versions in W2) |
| All other endpoints in section 10 (users, project create/detail/edit/delete, member add/remove, tasks, My Tasks, comments, activity, dashboard) | Contract defined in sections 10–11; no code yet |
