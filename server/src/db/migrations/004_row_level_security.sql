ALTER TABLE {{APP_SCHEMA}}.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY jobs_tenant_policy ON {{APP_SCHEMA}}.jobs
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.idempotency_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY idempotency_keys_tenant_policy ON {{APP_SCHEMA}}.idempotency_keys
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.job_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.job_steps FORCE ROW LEVEL SECURITY;
CREATE POLICY job_steps_tenant_policy ON {{APP_SCHEMA}}.job_steps
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.job_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.job_dependencies FORCE ROW LEVEL SECURITY;
CREATE POLICY job_dependencies_tenant_policy ON {{APP_SCHEMA}}.job_dependencies
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.job_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY job_attempts_tenant_policy ON {{APP_SCHEMA}}.job_attempts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.artifacts FORCE ROW LEVEL SECURITY;
CREATE POLICY artifacts_tenant_policy ON {{APP_SCHEMA}}.artifacts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{ARTIFACT_SCHEMA}}.artifact_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{ARTIFACT_SCHEMA}}.artifact_content FORCE ROW LEVEL SECURITY;
CREATE POLICY artifact_content_tenant_policy ON {{ARTIFACT_SCHEMA}}.artifact_content
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.outbox_events FORCE ROW LEVEL SECURITY;
CREATE POLICY outbox_events_tenant_policy ON {{APP_SCHEMA}}.outbox_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.webhook_deliveries FORCE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant_policy ON {{APP_SCHEMA}}.webhook_deliveries
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {{APP_SCHEMA}}.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_select_policy ON {{APP_SCHEMA}}.audit_events
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY audit_events_tenant_insert_policy ON {{APP_SCHEMA}}.audit_events
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE {{APP_SCHEMA}}.audit_events IS
  'Append-only application audit log; application role receives SELECT and INSERT only';
