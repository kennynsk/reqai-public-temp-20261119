ALTER TABLE {{APP_SCHEMA}}.job_attempts
  ADD COLUMN execution_id uuid;

-- Migrations run as the application schema owner while FORCE RLS is enabled;
-- temporarily disable policy evaluation only for this deterministic backfill.
ALTER TABLE {{APP_SCHEMA}}.job_attempts
  DISABLE ROW LEVEL SECURITY;

UPDATE {{APP_SCHEMA}}.job_attempts
SET execution_id = id
WHERE execution_id IS NULL;

ALTER TABLE {{APP_SCHEMA}}.job_attempts
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE {{APP_SCHEMA}}.job_attempts
  FORCE ROW LEVEL SECURITY;

ALTER TABLE {{APP_SCHEMA}}.job_attempts
  ALTER COLUMN execution_id SET NOT NULL;

ALTER TABLE {{APP_SCHEMA}}.job_attempts
  DROP CONSTRAINT IF EXISTS job_attempts_job_id_step_id_actual_model_attempt_key;

ALTER TABLE {{APP_SCHEMA}}.job_attempts
  ADD CONSTRAINT job_attempts_lineage_unique
  UNIQUE (job_id, step_id, actual_model, execution_id, attempt);

CREATE INDEX job_attempts_execution_idx
  ON {{APP_SCHEMA}}.job_attempts(tenant_id, job_id, step_id, execution_id, attempt);
