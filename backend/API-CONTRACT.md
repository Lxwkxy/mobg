# MobG — API Contract, Authentication, Permissions, and Data Rules (W1)

A shared contract for Bar (Frontend) and Pai (Database / Functions).  
Reference schema: `database/schema-mapping.md`

Status indicators:
- **[Confirmed]**: Already agreed upon in `schema-mapping.md` or existing code.
- **[Proposed]**: Proposed by Backend; awaiting confirmation from Bar / Pai.

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
- **[Proposed]** `email`: Apply `.trim().toLowerCase()` prior to database queries. Demo seed scripts must store emails in lowercase (PostgreSQL `users.email` is case-sensitive).
- **[Proposed]** Return the generic message and code `401 INVALID_CREDENTIALS` for both non-existent emails and incorrect passwords to prevent account enumeration.

---

## 2. Session Management **[Proposed]**

- Use **Database-backed Sessions** (stateless JWT and in-memory session stores are avoided so that logouts invalidate sessions immediately, server restarts do not disconnect users, and no extra dependencies are required).
- **Token**: Cryptographically secure 32-byte token (`crypto.randomBytes(32)`), transmitted via cookie. The database stores only the **SHA-256 hash** of the token.
- **Cookie Specification**: Name `mobg_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production, with a 7-day TTL.
- **Database Migration**: Pai will add a `sessions` table via a new migration:
  `session_id` (BIGINT PK), `user_id` (BIGINT FK → `users`), `token_hash` (TEXT UNIQUE), `created_at` (TIMESTAMPTZ), `expires_at` (TIMESTAMPTZ).
- **Lifecycle Behavior**:
  - **Page Refresh**: Frontend invokes `GET /api/auth/me` on initial mount. If `200 OK`, keep current view.
  - **Logout**: Delete the database session record, clear the cookie, and redirect to the Login view.
  - **Expired / Missing Session**: Protected endpoints respond with `401 UNAUTHENTICATED`. Frontend redirects user to Login (no automated retries).
- `user_id` used for authorization checks must be derived strictly from the validated backend session—never from the request body or query parameters. **[Confirmed]**

---

## 3. Password Hashing

- Use **bcryptjs** (already listed in `package.json`) with `saltRounds = 10`. Verification is performed using `bcrypt.compare(plain, hash)`. **[Confirmed library]**
- **Credential Generation for Pai**: Run `node hash-helper.cjs "<sample_password>"` and copy the resulting hash into `users.password_hash`.
- The hash in the demo seed is currently a placeholder. Valid accounts must be created using this script before Login testing in W2. **[Confirmed]**
- Use sample passwords strictly for demonstration purposes.

---

## 4. Database Function Contracts (Coordinated with Pai)

| Function | Parameters | Returns | Status |
|---|---|---|---|
| `findUserForLoginByEmail(email)` | `email: string` | `{ user_id, user_name, email, password_hash }` or `null` | [Proposed → Pending Pai] |
| `findProjectMembership(project_id, user_id)` | `project_id: number`, `user_id: number` | `{ project_id, user_id, role }` or `null` | [Proposed → Pending Pai] |
| `createSession(user_id, token_hash, expires_at)` | `user_id: number`, `token_hash: string`, `expires_at: Date` | `void` | [Proposed] W2 |
| `findSessionUser(token_hash)` | `token_hash: string` | `{ user_id, user_name, email }` or `null` (excludes expired sessions) | [Proposed] W2 |
| `deleteSession(token_hash)` | `token_hash: string` | `void` | [Proposed] W2 |

- Database errors must be **re-thrown**, not swallowed to return `null`. A return value of `null` strictly denotes "record not found".
- `findProjectMembership` returns `null` for both non-existent projects and non-member users. Membership alone does not authorize all actions; the backend must inspect the returned `role`.
- **ID Type Handling**: The `pg` driver returns `BIGINT` and `COUNT` as **strings**. However, the frontend expects `userId` and `projectId` as numbers. **[Proposed]** The backend must cast IDs to safe numbers before serializing API responses. Furthermore, `projectId` from URL params must be validated as a positive integer; otherwise, return `400 BAD REQUEST`.

---

## 5. Permission Matrix (Roles: `Owner` vs `Member`)

| Action | Authenticated User | Member | Owner | Status |
|---|:---:|:---:|:---:|---|
| Create Project | ✅ (Assigned Owner role) | - | - | [Confirmed] |
| Read Project / Tasks / Member List | ❌ | ✅ | ✅ | [Proposed] |
| Create / Edit Task | ❌ | ✅ | ✅ | [Proposed] |
| Delete Task | ❌ | ❌ | ✅ | [Proposed] |
| Edit / Delete Project | ❌ | ❌ | ✅ | [Proposed] |
| Add / Remove Members | ❌ | ❌ | ✅ | [Proposed] |

**Project Creation Rules** [Confirmed by Pai]:
- `projects.created_by` is set from the authenticated session user.
- The creator is assigned the `Owner` role. Additional selected members receive the `Member` role.
- If the creator is included in the selected members list, keep only one membership row with role `Owner` (do not overwrite with `Member`).
- Project and member records must be created within a **single database transaction**, returning success only after a complete `COMMIT`.

**Access Control Enforcement**:
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

### Priority [Confirmed DB / Proposed API]
The database stores `SMALLINT` (`1` = High, `2` = Medium, `3` = Low) with a `CHECK` constraint.  
**[Proposed]** API sends and receives priority as numeric values (`1 | 2 | 3`). The frontend handles localization/labeling.

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

- The last assignee cannot be removed from a task without assigning a replacement.
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
- Filter query parameter **[Proposed]**: `GET /api/projects?status=To do|In progress|Done` (omitted returns all).

### Overdue Calculation (`isOverdue`) **[Proposed]**
- A task is overdue if `dueDate < today` (evaluated in `Asia/Bangkok` date comparison) **and** `status != 'Done'`. Completed tasks are never overdue.
- The API delivers `isOverdue: boolean` computed by the backend; the frontend should not duplicate this calculation.
- Extended Dashboard metrics (High priority counts, user-scoped metrics) will be finalized in W2.

---

## 8. Cascading and Deletion Policies

- **Deleting a Task**: Associated comments are automatically deleted via `ON DELETE CASCADE` on `comments.task_id` [Confirmed]. Assignee associations in `task_assignees` are removed (Pai to verify FK behavior).
- **Deleting a Project** (`Owner` only) **[Proposed]**: Tasks, assignees, comments, and project membership rows are deleted within a single database transaction. The frontend must prompt for explicit confirmation before invocation. *(Pai must verify whether foreign keys for `tasks`, `project_members`, and `task_assignees` have `CASCADE` configured or require manual ordered deletion).*
- **Removing a Member from a Project** **[Proposed]**:
  - If the member is the **sole assignee** on any active task → Reject with `409 CONFLICT` (tasks must retain at least one assignee).
  - If other co-assignees exist on the tasks → Remove the member from those tasks within the same transaction.
  - The last remaining `Owner` cannot be removed from the project → Reject with `409 CONFLICT`.

---

## 9. Standard Response Envelope and Error Codes

Success envelope: `{ "success": true, ... }`  
Failure envelope: `{ "success": false, "error": { "code": string, "message": string, "details"?: array } }`

| HTTP Status | Error Code | Trigger Condition |
|---|---|---|
| `400` | `VALIDATION_ERROR` | Missing or invalid fields, malformed JSON, invalid ID, date ordering violation |
| `401` | `INVALID_CREDENTIALS` | Invalid email or password |
| `401` | `UNAUTHENTICATED` | Missing or expired session cookie |
| `403` | `FORBIDDEN` | Insufficient permissions for the requested action |
| `404` | `NOT_FOUND` | Route not found, project not found, or user is not a project member |
| `409` | `CONFLICT` | Action violates business rules (e.g., removing sole assignee, last owner) |
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

// 409 Conflict (Removing sole assignee)
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Member is the sole assignee of one or more tasks. Reassign tasks before removing."
  }
}
```

---

## 10. Endpoint Readiness Summary

| Endpoint | Readiness Status |
|---|---|
| `GET /api/health` | Fully functional |
| `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` | Mock endpoints active (Live DB auth targeted for W2) |
| `GET /api/projects`, `GET /api/projects/:projectId/members` | Mock endpoints active (Members live in W2) |
| Tasks (`/api/projects/:projectId/tasks`), Create/Update/Delete Projects, Dashboard, Activity | Contract defined; mock endpoints scheduled for W2 |

**Proposed Task Schema for Bar's Mock UI**:
```json
{
  "taskId": 1,
  "taskTitle": "Prepare database demo",
  "taskDescription": "Ensure Docker and seed data work correctly",
  "priority": 1,
  "dueDate": "2026-10-11",
  "isOverdue": false,
  "projectId": 1,
  "projectName": "MobG Demo Project",
  "status": "To do",
  "createdByName": "Demo Member",
  "assignees": [
    { "userId": 1, "userName": "Demo Member" }
  ]
}
```