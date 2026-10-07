BEGIN;

ALTER TABLE projects
    ADD COLUMN start_date DATE;

-- Backfill existing demo data using the creation date.
UPDATE projects
SET start_date =
    (project_create_date AT TIME ZONE 'Asia/Bangkok')::DATE;

ALTER TABLE projects
    ALTER COLUMN start_date SET DEFAULT
        ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Bangkok')::DATE),
    ALTER COLUMN start_date SET NOT NULL;

ALTER TABLE projects
    ADD CONSTRAINT projects_due_date_after_start_date
    CHECK (due_date > start_date);

COMMIT;