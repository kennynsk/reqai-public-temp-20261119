CREATE TABLE {{APP_SCHEMA}}.consumed_events (
  tenant_id text NOT NULL, consumer_name text NOT NULL, event_id uuid NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,consumer_name,event_id)
);
ALTER TABLE {{APP_SCHEMA}}.consumed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.consumed_events FORCE ROW LEVEL SECURITY;
CREATE POLICY consumed_events_tenant_policy ON {{APP_SCHEMA}}.consumed_events USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
