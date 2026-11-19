CREATE TABLE {{APP_SCHEMA}}.requirement_discussions (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  owner_user_id text NOT NULL,
  job_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.jobs(id) ON DELETE CASCADE,
  anchor_id text NOT NULL,
  anchor_type text NOT NULL CHECK (anchor_type IN ('BR','SR','FR','NFR','TR','CON','GAP')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, job_id, anchor_id)
);
CREATE INDEX requirement_discussions_owner_idx
  ON {{APP_SCHEMA}}.requirement_discussions(tenant_id, owner_user_id, updated_at DESC, id DESC);

CREATE TABLE {{APP_SCHEMA}}.requirement_discussion_context_snapshots (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  discussion_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussions(id) ON DELETE CASCADE,
  base_version_id uuid REFERENCES {{APP_SCHEMA}}.requirements_versions(id),
  manifest jsonb NOT NULL DEFAULT '{}',
  content jsonb NOT NULL DEFAULT '{}',
  content_hash text NOT NULL,
  included_bytes integer NOT NULL CHECK (included_bytes >= 0),
  omitted jsonb NOT NULL DEFAULT '[]',
  unsaved_draft boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requirement_discussion_snapshots_idx
  ON {{APP_SCHEMA}}.requirement_discussion_context_snapshots(tenant_id, discussion_id, created_at DESC, id DESC);

CREATE TABLE {{APP_SCHEMA}}.requirement_discussion_messages (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  discussion_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','system')),
  status text NOT NULL CHECK (status IN ('pending','streaming','completed','failed','cancelled')),
  body text NOT NULL DEFAULT '',
  client_message_id text,
  generation_id uuid,
  context_snapshot_id uuid REFERENCES {{APP_SCHEMA}}.requirement_discussion_context_snapshots(id),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (discussion_id, client_message_id)
);
CREATE INDEX requirement_discussion_messages_idx
  ON {{APP_SCHEMA}}.requirement_discussion_messages(tenant_id, discussion_id, created_at, id);

CREATE TABLE {{APP_SCHEMA}}.requirement_discussion_attempts (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  discussion_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussions(id) ON DELETE CASCADE,
  user_message_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussion_messages(id) ON DELETE CASCADE,
  assistant_message_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussion_messages(id) ON DELETE CASCADE,
  context_snapshot_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussion_context_snapshots(id) ON DELETE RESTRICT,
  generation_id uuid NOT NULL,
  model text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('running','completed','failed','cancelled')),
  error_code text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX requirement_discussion_active_attempt_idx
  ON {{APP_SCHEMA}}.requirement_discussion_attempts(discussion_id)
  WHERE status = 'running';
CREATE INDEX requirement_discussion_attempts_idx
  ON {{APP_SCHEMA}}.requirement_discussion_attempts(tenant_id, discussion_id, started_at DESC, id DESC);

CREATE TABLE {{APP_SCHEMA}}.requirement_discussion_proposals (
  id uuid PRIMARY KEY,
  tenant_id text NOT NULL,
  discussion_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussions(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES {{APP_SCHEMA}}.requirement_discussion_messages(id) ON DELETE CASCADE,
  schema_version text NOT NULL,
  package jsonb NOT NULL,
  base_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('available','accepted','rejected','stale','saved')) DEFAULT 'available',
  receipt jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requirement_discussion_proposals_idx
  ON {{APP_SCHEMA}}.requirement_discussion_proposals(tenant_id, discussion_id, created_at DESC, id DESC);

ALTER TABLE {{APP_SCHEMA}}.requirement_discussions ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.requirement_discussions FORCE ROW LEVEL SECURITY;
CREATE POLICY requirement_discussions_tenant_policy ON {{APP_SCHEMA}}.requirement_discussions
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_context_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_context_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY requirement_discussion_snapshots_tenant_policy ON {{APP_SCHEMA}}.requirement_discussion_context_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY requirement_discussion_messages_tenant_policy ON {{APP_SCHEMA}}.requirement_discussion_messages
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY requirement_discussion_attempts_tenant_policy ON {{APP_SCHEMA}}.requirement_discussion_attempts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE {{APP_SCHEMA}}.requirement_discussion_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY requirement_discussion_proposals_tenant_policy ON {{APP_SCHEMA}}.requirement_discussion_proposals
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

COMMENT ON TABLE {{APP_SCHEMA}}.requirement_discussions IS
  'Scoped contextual AI conversations; deleting the owning task cascades history and proposals';
