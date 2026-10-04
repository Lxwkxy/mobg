# MobG Schema Mapping

This document maps database columns to the application's UI data requirements.

## Projects

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Project ID | projects.project_id | BIGINT | No | Primary key; generated automatically |
| Project name | projects.project_name | VARCHAR(150) | No | Project name |
| Description | projects.project_description | TEXT | Yes | Optional description |
| Creation time | projects.project_create_date | TIMESTAMPTZ | No | Defaults to CURRENT_TIMESTAMP |
| Due date | projects.due_date | DATE | Yes | Optional due date |
| Creator ID | projects.created_by | BIGINT | No | Foreign key referencing users.user_id |
| Creator name | users.user_name | VARCHAR(100) | No | Join projects.created_by to users.user_id |

## Tasks

| UI data | Database column | Type | Allows NULL | Notes |
|---|---|---|---|---|
| Task ID | tasks.task_id | BIGINT | No | Primary key; generated automatically |
| Task title | tasks.task_title | VARCHAR(200) | No | Task title |
| Description | tasks.task_description | TEXT | Yes | Optional description |
| Priority | tasks.priority | SMALLINT | No | CHECK constraint: 1 = High, 2 = Medium, 3 = Low |
| Due date | tasks.due_date | DATE | Yes | Optional due date |
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

## Pending UI and API Decisions

These items require confirmation with the team.

| Item | Current database behavior | Decision needed |
|---|---|---|
| Task due date | tasks.due_date allows NULL; the Figma field label includes an asterisk | Must users provide a due date when creating a task? |
| Task assignees | A task can have zero or multiple assignees; the Figma field label includes an asterisk | Is at least one assignee required? Can users select multiple assignees? |
| Assignee membership | task_assignees.user_id references users; it does not enforce project membership | Must every assignee belong to the task's project? |

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