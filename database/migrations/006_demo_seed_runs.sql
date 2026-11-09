-- Provisioning metadata only; no change to business rules or account credentials.
BEGIN;
CREATE TABLE demo_seed_runs (
    seed_key TEXT PRIMARY KEY,
    reference_date DATE NOT NULL,
    fixture JSONB NOT NULL
);
COMMIT;
