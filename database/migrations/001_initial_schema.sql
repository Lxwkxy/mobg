BEGIN;

CREATE TABLE IF NOT EXISTS users (
    user_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    project_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_name VARCHAR(150) NOT NULL,
    project_description TEXT,
    project_create_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_date DATE,
    created_by BIGINT NOT NULL REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS project_members (
    project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    date_join DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_statuses (
    status_id SMALLINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    status_name VARCHAR(30) NOT NULL UNIQUE
);

INSERT INTO task_statuses (status_name)
VALUES ('To Do'), ('Doing'), ('Done')
ON CONFLICT (status_name) DO NOTHING;

CREATE TABLE IF NOT EXISTS tasks (
    task_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_title VARCHAR(200) NOT NULL,
    task_description TEXT,
    priority SMALLINT NOT NULL CHECK (priority IN (1, 2, 3)),
    due_date DATE,
    task_create_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    project_id BIGINT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
    status_id SMALLINT NOT NULL REFERENCES task_statuses(status_id),
    created_by BIGINT NOT NULL REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id BIGINT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
    comment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    comment_text TEXT NOT NULL,
    comment_created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    task_id BIGINT NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(user_id)
);

COMMIT;