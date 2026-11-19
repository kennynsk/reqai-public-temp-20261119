CREATE TABLE {{APP_SCHEMA}}.model_circuit_state (
  tenant_id text NOT NULL,
  model text NOT NULL,
  state text NOT NULL DEFAULT 'CLOSED' CHECK (state IN ('CLOSED','OPEN','HALF_OPEN')),
  failure_count integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  half_open_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, model)
);

CREATE TABLE {{APP_SCHEMA}}.model_leases (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  model text NOT NULL,
  holder_site text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX model_leases_capacity_idx ON {{APP_SCHEMA}}.model_leases(tenant_id, model, expires_at);

ALTER TABLE {{APP_SCHEMA}}.model_circuit_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.model_circuit_state FORCE ROW LEVEL SECURITY;
CREATE POLICY model_circuit_state_tenant_policy ON {{APP_SCHEMA}}.model_circuit_state
  USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE {{APP_SCHEMA}}.model_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.model_leases FORCE ROW LEVEL SECURITY;
CREATE POLICY model_leases_tenant_policy ON {{APP_SCHEMA}}.model_leases
  USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
