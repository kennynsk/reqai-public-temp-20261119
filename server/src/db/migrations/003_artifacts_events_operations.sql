CREATE TABLE {{APP_SCHEMA}}.artifacts (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('INPUT', 'INTERMEDIATE', 'RESULT', 'RAW_LLM', 'PROMPT')),
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 104857600),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-fA-F0-9]{64}$'),
  storage_status text NOT NULL CHECK (storage_status IN ('UPLOADING', 'AVAILABLE', 'FAILED', 'DELETED')),
  legal_hold boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  deleted_at timestamptz
);
CREATE INDEX artifacts_tenant_owner_created_idx ON {{APP_SCHEMA}}.artifacts(tenant_id, owner_user_id, created_at DESC);
CREATE INDEX artifacts_retention_idx ON {{APP_SCHEMA}}.artifacts(expires_at, id)
  WHERE expires_at IS NOT NULL AND legal_hold = false AND storage_status <> 'DELETED';

CREATE TABLE {{ARTIFACT_SCHEMA}}.artifact_content (
  artifact_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.artifacts(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content bytea NOT NULL CHECK (octet_length(content) <= 1048576),
  PRIMARY KEY (artifact_id, chunk_index)
);

CREATE TABLE {{APP_SCHEMA}}.outbox_events (
  event_id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  event_type text NOT NULL,
  schema_version text NOT NULL DEFAULT '1.0',
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  last_error_code text,
  workflow_dispatch_status text NOT NULL DEFAULT 'NOT_APPLICABLE'
    CHECK (workflow_dispatch_status IN ('NOT_APPLICABLE', 'PENDING', 'DISPATCHING', 'STARTED', 'FAILED')),
  workflow_attempts integer NOT NULL DEFAULT 0 CHECK (workflow_attempts >= 0),
  workflow_available_at timestamptz NOT NULL DEFAULT now(),
  workflow_started_at timestamptz,
  workflow_last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aggregate_id, sequence)
);
CREATE INDEX outbox_pending_idx ON {{APP_SCHEMA}}.outbox_events(status, available_at, created_at)
  WHERE status IN ('PENDING', 'FAILED');
CREATE INDEX outbox_workflow_pending_idx
  ON {{APP_SCHEMA}}.outbox_events(workflow_dispatch_status, workflow_available_at, created_at)
  WHERE workflow_dispatch_status IN ('PENDING', 'FAILED', 'DISPATCHING');

CREATE TABLE {{APP_SCHEMA}}.webhook_deliveries (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.outbox_events(event_id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'DELIVERING', 'DELIVERED', 'FAILED', 'DLQ')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  response_status integer,
  reason_code text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id)
);
CREATE INDEX webhook_retry_idx ON {{APP_SCHEMA}}.webhook_deliveries(status, next_attempt_at)
  WHERE status IN ('PENDING', 'FAILED');

CREATE TABLE {{APP_SCHEMA}}.audit_events (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  actor_id text NOT NULL,
  actor_roles text[] NOT NULL DEFAULT '{}',
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  request_id text,
  source_site text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_tenant_time_idx ON {{APP_SCHEMA}}.audit_events(tenant_id, occurred_at DESC, id DESC);
CREATE INDEX audit_retention_idx ON {{APP_SCHEMA}}.audit_events(occurred_at, id);

CREATE TABLE {{APP_SCHEMA}}.operational_state (
  scope text PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('NORMAL', 'ACCEPT_AND_QUEUE', 'DRAIN', 'REJECT_NEW', 'FAILOVER_IN_PROGRESS')),
  reason text,
  version bigint NOT NULL DEFAULT 0,
  updated_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO {{APP_SCHEMA}}.operational_state(scope, mode, updated_by)
VALUES ('global', 'NORMAL', 'migration')
ON CONFLICT (scope) DO NOTHING;
