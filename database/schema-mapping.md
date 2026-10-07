# MobG Schema Mapping

This document maps database columns to the application's UI data requirements.

## Users and Login Data

| Data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| User ID | users.user_id | BIGINT | No | Primary key; generated automatically |
| Display name | users.user_name | VARCHAR(100) | No | Not unique; do not assume it uniquely identifies an account |
| Email | users.email | VARCHAR(255) | No | Unique; supports account lookup by email |
| Password hash | users.password_hash | TEXT | No | Backend-only; never include in public API responses |

Users are linked to project membership through project_members.user_id
and to task assignments through task_assignees.user_id.

The current schema has no account-status column.

The demo password hash is a placeholder and cannot be used to log in.
Usable demo accounts require the password-hashing helper agreed with
the backend developer.

The Login identifier, account-lookup input/output, password-hashing
library, and session storage requirements remain to be agreed with Book.

### Proposed Account Lookup Contract

Status: proposed; requires agreement with the backend developer.

Function name: findUserForLoginByEmail

Input:
- email: string

Return when an account exists:
- user_id
- user_name
- email
- password_hash

Return when no account matches:
- null

Database failures:
- Propagate the error to the backend; do not return null.

Responsibilities:
- Pai provides the database lookup.
- Book validates Login input and verifies the supplied password
  using the agreed hashing library.
- password_hash is for backend authentication only and must never
  be included in public API responses.

Email matching and normalization rules must be agreed with Book.
The function is not implemented yet.

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

### Confirmed Creator Membership Rule

- When creating a project, set projects.created_by from the user identity verified by the backend's Login mechanism.
- Insert a project_members row for the creator with role Owner.
- Other users selected as initial members receive role Member.
- If the creator is included in the selected member list, keep one membership row with role Owner; do not overwrite it with Member.
- Create the project and its initial membership rows in the same transaction on the same database connection.
- Return creation success only after all required inserts commit.
- projects.created_by records who created the project; project_members.role describes the user's project membership role.
- The existing foreign keys do not automatically create the creator's membership row. The project-creation function must do this explicitly.
- The demo seed already inserts the creator as Owner. The general project-creation function is not implemented yet.
- These initial membership rules are confirmed by Pai; the team permission matrix and backend integration remain to be agreed with Book.

### Proposed Membership Lookup Contract

Status: proposed; requires agreement with the backend developer.

Function name: findProjectMembership

Input:
- project_id
- user_id

Return when membership exists:
- project_id
- user_id
- role

Return when no matching membership exists:
- null

Database failures:
- Propagate the error to the backend; do not return null.

Responsibilities:
- Pai reads project_members using both IDs.
- For authorization checks, Book supplies the current user ID from verified Login state, not a client-supplied identity claim.
- Book applies the agreed permission rules using the returned role.
- Returning a membership proves membership only; it does not itself authorize every operation.
- A null result means no matching membership; it does not distinguish a nonexistent project from a nonmember without another lookup.

The function is not implemented yet. Owner/Member permissions, ID types,
and the final function signature remain to be agreed with Book.

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

## Confirmed Project Date Requirements

- Every project must have a start date.
- New projects default to the current date in Asia/Bangkok; users can choose another date.
- The frontend must initialize the date input; the database default does not populate the UI.
- The start date is separate from project_create_date, which records when the project record was created.
- Project end dates remain optional. When provided, the end date must be strictly later than the start date; the same date is rejected.
- Migration 003 backfills existing demo records using their creation date in Asia/Bangkok. This is a migration policy for demo data, not evidence of the actual historical start date.

## Confirmed Task Requirements

| Requirement | Rule |
|---|---|
| Due date | Every task must have a due date. |
| Minimum assignees | Every task must have at least one assignee. |
| Multiple assignees | A task may have multiple assignees. |
| Project membership | Every assignee must belong to the task's project. |

These requirements apply when creating and updating tasks.
The last assignee cannot be removed without assigning a replacement.

## Confirmed Task Status Mapping

| Meaning | Database status_name | UI label |
|---|---|---|
| Not yet started | To Do | To do |
| Work in progress | Doing | In progress |
| Completed | Done | Done |

- Keep the existing database status names and identifiers.
- New tasks start in the To Do status. The backend must supply its actual status_id when inserting a task; the schema does not currently define a default for tasks.status_id.
- Retrieve status IDs from task_statuses; do not assume fixed numeric IDs.
- Display Doing as In progress in the UI.
- Replace Not started with To do in the create-task form's initial-status text.
- Not started is not a separate fourth status.
- This section records the agreed display mapping and initial-state rule; frontend and API implementation remain pending.

## Confirmed Assignee UI Behavior

- Create/Edit Task forms support selecting multiple project members with checkboxes in a dropdown.
- Selected users are shown as removable name chips.
- Task lists show the first two assignees. When more users are assigned, display +N for the remaining count; for four assignees, show two users and +2.
- Show all assignees in Task Details so the complete list is accessible.
- Use a consistent ordering when choosing the first two users.
- Assignee count is based on distinct users assigned to that task.
- Every task must retain at least one assignee, and every selected user must be a project member.
- This is a confirmed UI requirement; frontend/API implementation remains pending.

## Confirmed Activity Scope

Activity uses the basic scope: task creation and comments only.

| Activity | Source | Actor | Time |
|---|---|---|---|
| Task created | tasks | tasks.created_by joined to users.user_id | tasks.task_create_date |
| Comment added | comments | comments.user_id joined to users.user_id | comments.comment_created_at |

- Read task creation and comment entries from existing records and combine them in the Activity feed.
- A task's feed includes its creation entry and its comments. A project's feed combines entries for tasks belonging to that project.
- Display the actor name, action, event time, and comment text when applicable.
- Order entries by event time, with a stable tie-breaker for equal timestamps.
- The UI must match this scope: remove status-change, priority-change, and assignee-change history entries from the wireframe's Activity examples.
- Current status, priority, and assignees continue to be displayed in the task fields.
- No additional activity table is required for this scope.
- The unexecuted draft migration 004_add_task_activities.sql was withdrawn when the scope changed to basic activity.
- Activity-reading functions, API response format, and frontend integration remain pending.

## Confirmed Project Progress

For each project:

- total_tasks is the number of distinct tasks.task_id values belonging to that project.
- completed_tasks counts those tasks whose joined task_statuses.status_name is Done.
- progress_percent = ROUND(100.0 * completed_tasks / total_tasks).
- Return 0 percent when total_tasks is zero; do not divide by zero.
- Examples: 4/10 tasks = 40 percent; 8/12 tasks = 67 percent.
- Multiple assignees do not increase a task's contribution to either count.
- Compute progress from tasks and statuses; do not persist a separate progress column.
- The formula is confirmed; query/API/frontend integration remains pending.

Other dashboard counts, high-priority count rules, and user-level scope
remain to be confirmed separately.

## Confirmed Derived Project Status

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
- The exact filter parameter and response field names remain to be agreed with the backend developer.
- The rules are confirmed; database function, API, and frontend implementation remain pending for their feature cards.

## Implementation Status

- Migration 002 enforces NOT NULL on tasks.due_date.
- Migration 003 adds projects.start_date, its default and NOT NULL constraint, and the project end-date constraint.
- The composite primary key prevents duplicate task-user assignments.
- Minimum assignee count and project membership are not yet enforced.

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

## UI Review Notes

Source: the MobG.pdf wireframe reviewed during Week 1.

Reviewed screens: Dashboard, Projects, Create Project, Project Settings,
Project Overview, Task List, Create Task, Edit Task, Task Details, and My Tasks.

| Item | Finding | Status / next action |
|---|---|---|
| Project start date | The UI has a user-selectable Start date; it is separate from the record creation timestamp. | Resolved by the confirmed project date rules and migration 003. |
| Project end date | End date in the forms corresponds to projects.due_date. | Optional; must be strictly later than start_date when provided. |
| Task status labels | The UI displays To do, In progress, and Done; the DB retains To Do, Doing, and Done. | Confirmed: new tasks start in To Do; replace the create-form label Not started with To do. Frontend/API implementation remains pending. |
| Multiple assignees | Task lists show two assignees and +N; Task Details shows all assignees. | Confirmed: multi-select dropdown with removable name chips in Create/Edit forms. Frontend/API implementation remains pending. |
| Activity history | Basic activity includes task creation and comments only, read from existing tables. | Confirmed: adjust Activity in the UI to this scope; no additional activity table is required. API/frontend integration remains pending. |
| Progress and counts | Project progress is rounded Done-task count divided by distinct total-task count, multiplied by 100; zero tasks gives 0 percent. | Progress formula confirmed. Other counts and dashboard user scope remain pending; implementation is pending. |
| Project status filter | Project status is derived from the statuses of its tasks. | Confirmed: retain the filter using To do, In progress, and Done; calculate from existing data and filter before pagination. Implementation remains pending. |
