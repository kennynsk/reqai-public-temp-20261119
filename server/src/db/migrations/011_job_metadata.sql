ALTER TABLE reqai.jobs ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE reqai.jobs ADD COLUMN IF NOT EXISTS search_summary text NOT NULL DEFAULT '';
ALTER TABLE reqai.jobs ADD COLUMN IF NOT EXISTS metadata_revision integer NOT NULL DEFAULT 0;
ALTER TABLE reqai.jobs ADD COLUMN IF NOT EXISTS metadata_indexed_at timestamptz;
CREATE INDEX IF NOT EXISTS jobs_metadata_backfill ON reqai.jobs(tenant_id, created_at, id) WHERE metadata_indexed_at IS NULL;
CREATE INDEX IF NOT EXISTS jobs_workflow_parent ON reqai.jobs(tenant_id, parent_job_id, owner_user_id);
