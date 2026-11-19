# MobG Schema Mapping

This document maps database columns to the application's UI data requirements.

## Users and Login Data

| Data | Column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| MobG user ID | users.user_id | BIGINT | No | Existing numeric identity and domain foreign keys retained |
| Display name | users.user_name | VARCHAR(100) | No | Business profile; non-unique |
| Email | users.email | VARCHAR(255) | No | Existing unique business email |
| Auth link | users.auth_user_id | TEXT | Yes | Added by 005; unique FK to auth_users.id |
| Legacy password | users.password_hash | TEXT | Yes after 005 | Existing values preserved; unused by Better Auth |

Better Auth owns auth_users (string id, name, email, email_verified, image,
created_at, updated_at), auth_accounts, auth_sessions and auth_verifications.
The configured model/column mapping is backend/src/auth.ts.
Password hashes belong to auth_accounts.password; Better Auth handles hashing.

The link is nullable so existing project/member/task/comment data remains valid.
Public signup is enabled with verification and automatic creation of a new profile
under migration 007. Seed provisioning uses Better Auth and explicitly
attaches the returned ID to the intended domain row. Do not cast
an auth ID to a number, automatically link by email, or duplicate the demo user.
Resolve normalized-email collisions before provisioning. Existing password
placeholders and custom sessions are not automatically migrated.
The FK uses ON DELETE RESTRICT to prevent deleting an auth account linked to a
domain user without an explicit reconciliation step.

### Domain Profile Lookup Contract

findDomainUserByAuthId(authUserId: string) returns
{ user_id: string, user_name: string, email: string, auth_user_id: string }
or null. Input must come from a validated Better Auth session.
Propagate database errors; null means no linked domain row.
The API rejects unlinked sessions with 403 and validates the MobG BIGINT before
conversion. The business user profile remains { userId: number, userName, email }.
See `backend/src/services/authDb.ts` for the implementation.

## Projects

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Project ID | projects.project_id | BIGINT | No | Primary key; generated automatically |
| Project name | projects.project_name | VARCHAR(150) | No | Project name |
| Description | projects.project_description | TEXT | Yes | Optional description |
| Creation time | projects.project_create_date | TIMESTAMPTZ | No | Defaults to CURRENT_TIMESTAMP |
| Start date | projects.start_date | DATE | No | Required; defaults to the current date in Asia/Bangkok; editable by the user |
| End date / due date | projects.due_date | DATE | Yes | Optional; when provided, must be strictly later than start_date |
| Creator ID | projects.created_by | BIGINT | No | Foreign key referencing users.user_id |
| Creator name | users.user_name | VARCHAR(100) | No | Join projects.created_by to users.user_id |

## Tasks

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Task ID | tasks.task_id | BIGINT | No | Primary key; generated automatically |
| Task title | tasks.task_title | VARCHAR(200) | No | Task title |
| Description | tasks.task_description | TEXT | Yes | Optional description |
| Priority | tasks.priority | SMALLINT | No | CHECK constraint: 1 = High, 2 = Medium, 3 = Low |
| Due date | tasks.due_date | DATE | No | Required; enforced by migration 002 |
| Creation time | tasks.task_create_date | TIMESTAMPTZ | No | Defaults to CURRENT_TIMESTAMP |
| Project ID | tasks.project_id | BIGINT | No | Foreign key referencing projects.project_id |
| Status ID | tasks.status_id | SMALLINT | No | Foreign key referencing task_statuses.status_id |
| Creator ID | tasks.created_by | BIGINT | No | Foreign key referencing users.user_id |
| Project name | projects.project_name | VARCHAR(150) | No | Join tasks.project_id to projects.project_id |
| Status name | task_statuses.status_name | VARCHAR(30) | No | Join tasks.status_id to task_statuses.status_id |
| Creator name | users.user_name | VARCHAR(100) | No | Join tasks.created_by to users.user_id |

## Project Members

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Project ID | project_members.project_id | BIGINT | No | Foreign key referencing projects.project_id |
| Member ID | project_members.user_id | BIGINT | No | Foreign key referencing users.user_id |
| Role | project_members.role | VARCHAR(50) | No | Member's role within this project |
| Join date | project_members.date_join | DATE | No | Defaults to CURRENT_DATE |
| Member name | users.user_name | VARCHAR(100) | No | Join project_members.user_id to users.user_id |

Primary key: (project_id, user_id).
Each user can appear only once within the same project.

### Creator Membership Rule

- When creating a project, set projects.created_by from the user identity verified by the backend's Login mechanism.
- Insert a project_members row for the creator with role Owner.
- Other users selected as initial members receive role Member.
- If the creator is included in the selected member list, keep one membership row with role Owner; do not overwrite it with Member.
- Create the project and its initial membership rows in the same transaction on the same database connection.
- Return creation success only after all required inserts commit.
- projects.created_by records who created the project; project_members.role describes the user's project membership role.
- The existing foreign keys do not automatically create the creator's membership row. The project-creation function must do this explicitly.
- The demo seed inserts the creator as Owner. `createProjectWithMembers` in `backend/src/services/projectDb.ts` implements the same rule.

### Membership Lookup Contract

Function name: findProjectMembership

Input:
- project_id: number, positive safe integer validated by the API
- user_id: number, positive safe integer from verified Login state

Return when membership exists:
- project_id: string (PostgreSQL BIGINT as returned by pg)
- user_id: string (PostgreSQL BIGINT as returned by pg)
- role: string; supported application values are exactly Owner and Member

Return when no matching membership exists:
- null

Database failures:
- Propagate the error to the backend; do not return null.

Responsibilities:
- For authorization checks, the API supplies the current user ID from the validated session.
- The API applies project permissions using the returned role.
- Returning a membership proves membership only; it does not itself authorize every operation.
- A null result means no matching membership; it does not distinguish a nonexistent project from a nonmember without another lookup.

The function is implemented in backend/src/services/projectDb.ts. The current role column is VARCHAR(50)
without a CHECK constraint; account/membership writes must use the agreed
Owner/Member values. Unknown roles must not be granted permissions.

### ID Boundaries

- Keep BIGINT database values as decimal strings inside DB results; do not
  change pg's global BIGINT parser or silently round a large ID.
- The API maps DB snake_case results to public camelCase fields and converts IDs
  to numbers only after validating `Number.isSafeInteger(id)` and `id > 0`.
- Incoming numeric IDs must satisfy the same positive-safe-integer rule.
  URL string IDs must be validated in full before conversion; partial parsing
  of values such as `1abc` is not allowed.
- Invalid request IDs produce a validation error. A stored ID outside the
  public safe-integer range must cause an explicit backend error, not a
  rounded or truncated identity. Do not issue a SQL lookup with a rounded ID.
- The database retains its BIGINT schema; the numeric API supports only the
  positive safe-integer subset. Domain profile IDs follow this boundary; Better Auth IDs remain strings.

## Sessions

Current authentication uses auth_sessions from migration 005, owned by Better Auth.
Its id and user_id are TEXT; user_id references auth_users.id with ON DELETE CASCADE.
Columns: token (unique), expires_at, ip_address, user_agent, created_at and updated_at.
The token is Better Auth's value; do not impose the old token_hash/SHA-256 contract.
Indexes cover user_id and expires_at. The configured session lifetime is seven days.

Better Auth validates sessions. The API obtains session.user.id using getSession and
resolves users.auth_user_id before checking project membership.
The session table proves identity only, not project permissions.

Migration 004 and legacy sessions remain unchanged as history. They are not read
by Better Auth. Existing custom sessions are not converted into active auth sessions.

## Task Assignees

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Task ID | task_assignees.task_id | BIGINT | No | Foreign key referencing tasks.task_id |
| Assignee ID | task_assignees.user_id | BIGINT | No | Foreign key referencing users.user_id |
| Assignee name | users.user_name | VARCHAR(100) | No | Join task_assignees.user_id to users.user_id |

Primary key: (task_id, user_id).
A task can have multiple assignees.

## Comments

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Comment ID | comments.comment_id | BIGINT | No | Primary key; generated automatically |
| Comment text | comments.comment_text | TEXT | No | Comment content |
| Creation time | comments.comment_created_at | TIMESTAMPTZ | No | Defaults to CURRENT_TIMESTAMP |
| Task ID | comments.task_id | BIGINT | No | Foreign key referencing tasks.task_id |
| Author ID | comments.user_id | BIGINT | No | Foreign key referencing users.user_id |
| Author name | users.user_name | VARCHAR(100) | No | Join comments.user_id to users.user_id |

When a task is deleted, its comments are deleted automatically
because comments.task_id uses ON DELETE CASCADE.

## Project Date Requirements

- Every project must have a start date.
- New projects default to the current date in Asia/Bangkok; users can choose another date.
- The frontend must initialize the date input; the database default does not populate the UI.
- The start date is separate from project_create_date, which records when the project record was created.
- Project end dates remain optional. When provided, the end date must be strictly later than the start date; the same date is rejected.
- Migration 003 backfills existing demo records using their creation date in Asia/Bangkok. This is a migration policy for demo data, not evidence of the actual historical start date.

## Task Requirements

| Requirement | Rule |
|---|---|
| Due date | Every task must have a due date. |
| Minimum assignees | Every task must have at least one assignee. |
| Multiple assignees | A task may have multiple assignees. |
| Project membership | Every assignee must belong to the task's project. |

These requirements apply when creating and updating tasks.
The last assignee cannot be removed without assigning a replacement.

## Task Status Mapping

| Meaning | Database status_name | UI label |
|---|---|---|
| Not yet started | To Do | To do |
| Work in progress | Doing | In progress |
| Completed | Done | Done |

- Keep the existing database status names and identifiers.
- New tasks start in the To Do status. The backend must supply its actual status_id when inserting a task; the schema does not currently define a default for tasks.status_id.
- Retrieve status IDs from task_statuses; do not assume fixed numeric IDs.
- Display Doing as In progress in the UI.
- The create-task form shows To do as the initial status.

## Assignee UI Behavior

- Create/Edit Task forms support selecting multiple project members with checkboxes in a dropdown.
- Selected users are shown as removable name chips.
- Task lists show the first two assignees. When more users are assigned, display +N for the remaining count; for four assignees, show two users and +2.
- Show all assignees in Task Details so the complete list is accessible.
- Use a consistent ordering when choosing the first two users.
- Assignee count is based on distinct users assigned to that task.
- Every task must retain at least one assignee, and every selected user must be a project member.

## Project Progress

For each project:

- total_tasks is the number of distinct tasks.task_id values belonging to that project.
- completed_tasks counts those tasks whose joined task_statuses.status_name is Done.
- progress_percent = ROUND(100.0 * completed_tasks / total_tasks).
- Return 0 percent when total_tasks is zero; do not divide by zero.
- Examples: 4/10 tasks = 40 percent; 8/12 tasks = 67 percent.
- Multiple assignees do not increase a task's contribution to either count.
- Compute progress from tasks and statuses; do not persist a separate progress column.

Dashboard includes all tasks in current Owner/Member projects, regardless of
assignment. High priority means priority 1 and not Done; overdue means before the
current Asia/Bangkok date and not Done. My Tasks additionally requires assignment.

## Derived Project Status

Derive project status from all tasks belonging to the project.
Apply the following rules in order:

| Condition | Derived UI status |
|---|---|
| No tasks, or every task is To Do | To do |
| At least one task exists and every task is Done | Done |
| All other cases, including Doing tasks or a mix of Done and To Do | In progress |

- Use existing task status IDs/names to calculate this value; do not store a separate project status column.
- The Projects screen supports All status, To do, In progress, and Done filters.
- The backend validates the requested filter and applies it before pagination.
- Count each distinct task once, regardless of the number of assignees.
- Recalculate from task data when reading projects; the frontend must refresh relevant project data after task status changes.
- Filter/response contracts are recorded in backend/API-CONTRACT.md section 11.1.

## Task and membership invariants

The composite primary key prevents duplicate task-user assignments. Task and
membership services enforce assignment and current membership rules under a
shared project lock. Run `npm run db:verify -- --database NAME` to audit these
relationships after direct SQL changes.

## Demo fixture metadata and schema

Migration 006 adds `demo_seed_runs(seed_key TEXT PRIMARY KEY, reference_date DATE
NOT NULL, fixture JSONB NOT NULL)`. Its one `mobg-w5-v1` record stores selected domain
IDs, W2/W5 project IDs, task IDs and a non-secret business snapshot. It has no account passwords,
hashes, sessions or tokens. It has no FKs so the explicitly disposable sandbox can
be deleted; rerun detects the difference and refuses to recreate it silently.

Through 005 there are 12 public tables and 14 foreign keys; through 006 there are
13 tables, with the same 14 FKs. Migration 007 keeps these counts and adds the
server-only `auth_users.registration_kind` column plus the `create_registered_profile`
function/trigger for public signup. No stored function is installed through 006.
Business “DB functions” remain TypeScript functions in `services/`:

| Module | Operations |
|---|---|
| `authDb.ts` | `findDomainUserByAuthId` |
| `projectDb.ts` | Membership/profile lists, project CRUD/list/progress; add/remove member |
| `taskDb.ts` | Task list/detail/CRUD, My Tasks and important-task list |
| `dashboardDb.ts` | `getDashboardSummary` |
| `dbHelpers.ts` | Safe numeric ID conversion, transactions and shared project locking |

Relationships: `users.auth_user_id` uniquely references `auth_users.id` with RESTRICT;
auth accounts/sessions cascade from auth users. Projects/tasks/comments reference
domain creators; project members join projects to users; task assignees join tasks
to users; tasks reference statuses. Project deletion cascades tasks/members and then
task comments/assignees. Creator/status references restrict deletion. Legacy sessions
are retained and unused. `auth_verifications` is keyed independently.

## Example Joined Task Record

The following record was retrieved from the demo database by
joining tasks, projects, task_statuses, and users.

| Field | Example value |
|---|---|
| task_id | 1 |
| task_title | Prepare database demo |
| project_name | MobG Demo Project |
| status_name | To Do |
| creator_name | Demo Member |
| priority | 1 (High) |
| due_date | 2026-10-11 |

This example describes query results. The API response format
will be agreed with the backend developer.

```sql
SELECT
    t.task_id,
    t.task_title,
    p.project_name,
    s.status_name,
    u.user_name AS creator_name,
    t.priority,
    t.due_date
FROM tasks AS t
JOIN projects AS p
    ON t.project_id = p.project_id
JOIN task_statuses AS s
    ON t.status_id = s.status_id
JOIN users AS u
    ON t.created_by = u.user_id
ORDER BY t.task_id;
```
