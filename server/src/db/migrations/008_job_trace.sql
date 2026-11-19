CREATE TABLE {{APP_SCHEMA}}.job_trace_entries (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  job_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.jobs(id) ON DELETE CASCADE,
  sequence bigint NOT NULL CHECK (sequence > 0),
  category text NOT NULL CHECK (category IN (
    'LIFECYCLE', 'WORKFLOW', 'INSTRUCTIONS', 'CONTEXT', 'VALIDATION',
    'PERSISTENCE', 'MODEL', 'RETRY', 'EVENT', 'ERROR', 'RESULT'
  )),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  status text NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'INFO')),
  step_id text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  input_artifact_id uuid REFERENCES {{APP_SCHEMA}}.artifacts(id) ON DELETE SET NULL,
  output_artifact_id uuid REFERENCES {{APP_SCHEMA}}.artifacts(id) ON DELETE SET NULL,
  detail_artifact_id uuid REFERENCES {{APP_SCHEMA}}.artifacts(id) ON DELETE SET NULL,
  detail_kind text CHECK (detail_kind IS NULL OR detail_kind IN ('INPUT', 'OUTPUT', 'PROMPT', 'INSTRUCTIONS', 'INTERMEDIATE', 'ERROR_STACK')),
  detail_visibility text NOT NULL DEFAULT 'METADATA' CHECK (detail_visibility IN ('METADATA', 'PRIVILEGED', 'SYSTEM_ADMIN')),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence),
  CHECK (completed_at IS NULL OR started_at IS NULL OR completed_at >= started_at)
);

CREATE INDEX job_trace_entries_tenant_job_sequence_idx
  ON {{APP_SCHEMA}}.job_trace_entries(tenant_id, job_id, sequence);
CREATE INDEX job_trace_entries_retention_idx
  ON {{APP_SCHEMA}}.job_trace_entries(expires_at, id)
  WHERE expires_at IS NOT NULL;

ALTER TABLE {{APP_SCHEMA}}.job_trace_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.job_trace_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY job_trace_entries_tenant_policy ON {{APP_SCHEMA}}.job_trace_entries
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

REVOKE UPDATE, DELETE ON {{APP_SCHEMA}}.job_trace_entries FROM PUBLIC;

COMMENT ON TABLE {{APP_SCHEMA}}.job_trace_entries IS
  'Append-only, tenant-scoped semantic diagnostics; sensitive content is stored only in protected artifacts';
