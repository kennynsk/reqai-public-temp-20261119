CREATE TABLE {{APP_SCHEMA}}.jobs (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  parent_job_id uuid REFERENCES {{APP_SCHEMA}}.jobs(id),
  type text NOT NULL CHECK (type IN ('DECOMPOSITION', 'RESEARCH')),
  status text NOT NULL CHECK (status IN (
    'ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT',
    'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED'
  )),
  outcome text CHECK (outcome IS NULL OR outcome IN ('COMPLETE', 'PARTIAL')),
  priority integer NOT NULL DEFAULT 50,
  progress numeric(5,2) NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_step text,
  message text,
  reason_code text,
  input_artifact_id uuid NOT NULL,
  result_artifact_id uuid,
  configuration_snapshot jsonb NOT NULL,
  created_site text NOT NULL,
  execution_site text,
  completed_site text,
  sequence bigint NOT NULL DEFAULT 0,
  version bigint NOT NULL DEFAULT 0,
  deadline_at timestamptz NOT NULL,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'SUCCEEDED' AND outcome IS NOT NULL)
    OR (status <> 'SUCCEEDED' AND outcome IS NULL)
  )
);

CREATE INDEX jobs_tenant_owner_created_idx
  ON {{APP_SCHEMA}}.jobs(tenant_id, owner_user_id, created_at DESC, id DESC);
CREATE INDEX jobs_tenant_status_priority_idx
  ON {{APP_SCHEMA}}.jobs(tenant_id, status, priority DESC, created_at)
  WHERE status IN ('ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED');
CREATE INDEX jobs_parent_idx ON {{APP_SCHEMA}}.jobs(tenant_id, parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX jobs_deadline_idx ON {{APP_SCHEMA}}.jobs(deadline_at) WHERE status IN ('QUEUED', 'RUNNING', 'RETRY_WAIT');

CREATE TABLE {{APP_SCHEMA}}.idempotency_keys (
  tenant_id text NOT NULL,
  idempotency_key text NOT NULL,
  job_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.jobs(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, idempotency_key)
);
CREATE INDEX idempotency_expiry_idx ON {{APP_SCHEMA}}.idempotency_keys(expires_at);

CREATE TABLE {{APP_SCHEMA}}.job_steps (
  job_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.jobs(id) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  step_id text NOT NULL,
  step_type text NOT NULL,
  status text NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  outcome text CHECK (outcome IS NULL OR outcome IN ('COMPLETE', 'PARTIAL')),
  input_hash text NOT NULL,
  result_artifact_id uuid,
  summary jsonb,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, step_id),
  UNIQUE (job_id, step_id, input_hash)
);
CREATE INDEX job_steps_tenant_status_idx ON {{APP_SCHEMA}}.job_steps(tenant_id, status, updated_at);

CREATE TABLE {{APP_SCHEMA}}.job_dependencies (
  job_id uuid NOT NULL,
  step_id text NOT NULL,
  depends_on_step_id text NOT NULL,
  tenant_id text NOT NULL,
  PRIMARY KEY (job_id, step_id, depends_on_step_id),
  FOREIGN KEY (job_id, step_id) REFERENCES {{APP_SCHEMA}}.job_steps(job_id, step_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, depends_on_step_id) REFERENCES {{APP_SCHEMA}}.job_steps(job_id, step_id) ON DELETE CASCADE,
  CHECK (step_id <> depends_on_step_id)
);

CREATE TABLE {{APP_SCHEMA}}.job_attempts (
  id uuid PRIMARY KEY,
  job_id uuid NOT NULL,
  step_id text NOT NULL,
  tenant_id text NOT NULL,
  attempt integer NOT NULL CHECK (attempt > 0),
  requested_model text NOT NULL,
  actual_model text NOT NULL,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  reason_code text,
  provider_request_id text,
  execution_site text NOT NULL,
  input_tokens bigint CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens bigint CHECK (output_tokens IS NULL OR output_tokens >= 0),
  duration_ms bigint CHECK (duration_ms IS NULL OR duration_ms >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  FOREIGN KEY (job_id, step_id) REFERENCES {{APP_SCHEMA}}.job_steps(job_id, step_id) ON DELETE CASCADE,
  UNIQUE (job_id, step_id, actual_model, attempt)
);
CREATE INDEX job_attempts_job_step_idx ON {{APP_SCHEMA}}.job_attempts(tenant_id, job_id, step_id, started_at);

COMMENT ON COLUMN {{APP_SCHEMA}}.jobs.configuration_snapshot IS
  'Immutable model, retry, deadline, chunking and feature settings captured at job creation';
