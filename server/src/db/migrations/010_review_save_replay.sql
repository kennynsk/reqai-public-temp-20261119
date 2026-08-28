ALTER TABLE {{APP_SCHEMA}}.requirements_versions
  ADD COLUMN client_mutation_id text,
  ADD COLUMN mutation_hash text;

CREATE UNIQUE INDEX requirements_versions_mutation_idx
  ON {{APP_SCHEMA}}.requirements_versions(tenant_id, owner_user_id, source_job_id, client_mutation_id)
  WHERE client_mutation_id IS NOT NULL;
