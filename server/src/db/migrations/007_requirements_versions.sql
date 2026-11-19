CREATE TABLE {{APP_SCHEMA}}.requirements_versions (
  id uuid PRIMARY KEY REFERENCES {{APP_SCHEMA}}.artifacts(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  source_job_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.jobs(id),
  base_version_id uuid REFERENCES {{APP_SCHEMA}}.requirements_versions(id),
  research_job_id uuid REFERENCES {{APP_SCHEMA}}.jobs(id),
  decisions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX requirements_versions_source_idx
  ON {{APP_SCHEMA}}.requirements_versions(tenant_id, source_job_id, created_at DESC, id DESC);
CREATE INDEX requirements_versions_research_idx
  ON {{APP_SCHEMA}}.requirements_versions(tenant_id, research_job_id, created_at DESC, id DESC)
  WHERE research_job_id IS NOT NULL;

ALTER TABLE {{APP_SCHEMA}}.requirements_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.requirements_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY requirements_versions_tenant_policy ON {{APP_SCHEMA}}.requirements_versions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE {{APP_SCHEMA}}.requirements_versions IS
  'Immutable user-reviewed requirements artifacts and their decomposition/research lineage';
