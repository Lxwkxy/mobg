BEGIN;

-- CREATE: add a temporary project for the demo user.
INSERT INTO projects (
    project_name,
    project_description,
    due_date,
    created_by
)
SELECT
    'CRUD Practice Project',
    'Temporary row used in CRUD examples.',
    CURRENT_DATE + 7,
    user_id
FROM users
WHERE email = 'demo-member@example.test'
RETURNING project_id, project_name, due_date;

-- READ: retrieve the project and its creator.
SELECT
    p.project_id,
    p.project_name,
    p.project_description,
    p.due_date,
    u.user_name AS created_by
FROM projects AS p
JOIN users AS u ON u.user_id = p.created_by
WHERE p.project_name = 'CRUD Practice Project';

-- UPDATE: change the project description.
UPDATE projects
SET project_description = 'Updated description for the CRUD example.'
WHERE project_name = 'CRUD Practice Project'
RETURNING project_id, project_name, project_description;

-- DELETE: remove the temporary project.
DELETE FROM projects
WHERE project_name = 'CRUD Practice Project'
RETURNING project_id, project_name;

-- Undo the practice changes so they do not remain in the database.
ROLLBACK;