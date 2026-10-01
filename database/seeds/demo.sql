BEGIN;

-- Demo-only account. This is not a real password hash and cannot be used to log in.
INSERT INTO users (user_name, email, password_hash)
VALUES ('Demo Member', 'demo-member@example.test', 'DEMO_ONLY_NOT_A_REAL_HASH')
ON CONFLICT (email) DO NOTHING;

-- Create the sample project once.
INSERT INTO projects (
    project_name,
    project_description,
    due_date,
    created_by
)
SELECT
    'MobG Demo Project',
    'Sample project for local development.',
    CURRENT_DATE + 30,
    u.user_id
FROM users AS u
WHERE u.email = 'demo-member@example.test'
  AND NOT EXISTS (
      SELECT 1
      FROM projects AS p
      WHERE p.project_name = 'MobG Demo Project'
        AND p.created_by = u.user_id
  );

-- Add the demo user as a project member.
INSERT INTO project_members (project_id, user_id, role)
SELECT p.project_id, u.user_id, 'Owner'
FROM projects AS p
JOIN users AS u ON u.user_id = p.created_by
WHERE p.project_name = 'MobG Demo Project'
  AND u.email = 'demo-member@example.test'
ON CONFLICT (project_id, user_id) DO NOTHING;

-- Create one sample task in the To Do status.
INSERT INTO tasks (
    task_title,
    task_description,
    priority,
    due_date,
    project_id,
    status_id,
    created_by
)
SELECT
    'Prepare database demo',
    'Sample task for trying the MobG database.',
    1,
    CURRENT_DATE + 7,
    p.project_id,
    s.status_id,
    u.user_id
FROM projects AS p
JOIN users AS u ON u.user_id = p.created_by
JOIN task_statuses AS s ON s.status_name = 'To Do'
WHERE p.project_name = 'MobG Demo Project'
  AND u.email = 'demo-member@example.test'
  AND NOT EXISTS (
      SELECT 1
      FROM tasks AS t
      WHERE t.project_id = p.project_id
        AND t.task_title = 'Prepare database demo'
  );

-- Assign the task to the demo user.
INSERT INTO task_assignees (task_id, user_id)
SELECT t.task_id, u.user_id
FROM tasks AS t
JOIN users AS u ON u.user_id = t.created_by
JOIN projects AS p ON p.project_id = t.project_id
WHERE p.project_name = 'MobG Demo Project'
  AND t.task_title = 'Prepare database demo'
  AND u.email = 'demo-member@example.test'
ON CONFLICT (task_id, user_id) DO NOTHING;

-- Add one sample comment.
INSERT INTO comments (comment_text, task_id, user_id)
SELECT 'This is a sample comment.', t.task_id, u.user_id
FROM tasks AS t
JOIN users AS u ON u.user_id = t.created_by
JOIN projects AS p ON p.project_id = t.project_id
WHERE p.project_name = 'MobG Demo Project'
  AND t.task_title = 'Prepare database demo'
  AND u.email = 'demo-member@example.test'
  AND NOT EXISTS (
      SELECT 1
      FROM comments AS c
      WHERE c.task_id = t.task_id
        AND c.user_id = u.user_id
        AND c.comment_text = 'This is a sample comment.'
  );

COMMIT;