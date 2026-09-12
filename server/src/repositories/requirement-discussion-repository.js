import { randomUUID } from 'node:crypto';
import { withTenantTransaction } from '../db/transaction.js';

const mapDiscussion = (row) => row && ({
  discussionId: row.id,
  tenantId: row.tenant_id,
  ownerUserId: row.owner_user_id,
  jobId: row.job_id,
  anchorId: row.anchor_id,
  anchorType: row.anchor_type,
  createdAt: new Date(row.created_at).toISOString(),
  updatedAt: new Date(row.updated_at).toISOString(),
});

const mapMessage = (row) => row && ({
  messageId: row.id,
  discussionId: row.discussion_id,
  role: row.role,
  status: row.status,
  text: row.body,
  clientMessageId: row.client_message_id || null,
  generationId: row.generation_id || null,
  contextSnapshotId: row.context_snapshot_id || null,
  errorCode: row.error_code || null,
  createdAt: new Date(row.created_at).toISOString(),
  completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
});

const mapAttempt = (row) => row && ({
  attemptId: row.id,
  discussionId: row.discussion_id,
  userMessageId: row.user_message_id,
  assistantMessageId: row.assistant_message_id,
  contextSnapshotId: row.context_snapshot_id,
  baseVersionId: row.base_version_id || null,
  generationId: row.generation_id,
  model: row.model,
  promptVersion: row.prompt_version,
  status: row.status,
  errorCode: row.error_code || null,
  startedAt: new Date(row.started_at).toISOString(),
  completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
  ...(row.snapshot_manifest ? {
    contextSummary: {
      baseVersionId: row.base_version_id || null,
      manifest: row.snapshot_manifest || {},
      includedBytes: Number(row.snapshot_included_bytes || 0),
      omitted: row.snapshot_omitted || [],
      unsavedDraft: Boolean(row.snapshot_unsaved_draft),
    },
  } : {}),
});

const mapProposal = (row) => {
  if (!row) return null;
  const packageValue = typeof row.package === 'string' ? JSON.parse(row.package) : (row.package || {});
  return {
    proposalId: row.id,
    messageId: row.message_id,
    ...packageValue,
    status: row.status,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
};

export class RequirementDiscussionRepository {
  constructor(pool, { schema = 'reqai' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
  }

  async findByAnchor({ tenantId, ownerUserId = null, jobId, anchorId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${this.schema}.requirement_discussions
        WHERE tenant_id=$1 AND job_id=$2 AND anchor_id=$3
          AND ($4::text IS NULL OR owner_user_id=$4)`, [tenantId, jobId, anchorId, ownerUserId]);
      return mapDiscussion(result.rows[0]);
    });
  }

  async get({ tenantId, ownerUserId = null, discussionId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${this.schema}.requirement_discussions
        WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR owner_user_id=$3)`, [tenantId, discussionId, ownerUserId]);
      return mapDiscussion(result.rows[0]);
    });
  }

  async create({ tenantId, ownerUserId, jobId, anchorId, anchorType }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const id = randomUUID();
      const result = await client.query(`INSERT INTO ${this.schema}.requirement_discussions
        (id,tenant_id,owner_user_id,job_id,anchor_id,anchor_type)
        VALUES($1,$2,$3,$4,$5,$6)
        ON CONFLICT (tenant_id,job_id,anchor_id) DO UPDATE SET updated_at=now()
        RETURNING *`, [id, tenantId, ownerUserId, jobId, anchorId, anchorType]);
      return mapDiscussion(result.rows[0]);
    });
  }

  async listMessages({ tenantId, ownerUserId = null, discussionId, cursor = null, limit = 50 }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const parsedLimit = Math.min(100, Math.max(1, Number(limit) || 50));
      const result = await client.query(`SELECT m.* FROM ${this.schema}.requirement_discussion_messages m
        JOIN ${this.schema}.requirement_discussions d ON d.id=m.discussion_id AND d.tenant_id=m.tenant_id
        WHERE m.tenant_id=$1 AND m.discussion_id=$2 AND ($3::text IS NULL OR d.owner_user_id=$3)
          AND ($4::timestamptz IS NULL OR m.created_at < $4::timestamptz)
        ORDER BY m.created_at DESC,m.id DESC LIMIT $5`, [tenantId, discussionId, ownerUserId, cursor, parsedLimit + 1]);
      const rows = result.rows.slice(0, parsedLimit).reverse();
      const nextCursor = result.rows.length > parsedLimit ? rows[0]?.created_at || null : null;
      return { items: rows.map(mapMessage), nextCursor };
    });
  }

  async findMessageByClientId({ tenantId, ownerUserId = null, discussionId, clientMessageId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT m.*, a.id AS attempt_id, a.status AS attempt_status, a.error_code AS attempt_error_code,
        a.generation_id AS attempt_generation_id, a.model AS attempt_model, a.prompt_version AS attempt_prompt_version,
        a.started_at AS attempt_started_at, a.completed_at AS attempt_completed_at, a.user_message_id, a.assistant_message_id,
        a.context_snapshot_id AS attempt_context_snapshot_id
        FROM ${this.schema}.requirement_discussion_messages m
        JOIN ${this.schema}.requirement_discussions d ON d.id=m.discussion_id
        LEFT JOIN ${this.schema}.requirement_discussion_attempts a ON a.user_message_id=m.id
        WHERE m.tenant_id=$1 AND m.discussion_id=$2 AND m.client_message_id=$3
          AND ($4::text IS NULL OR d.owner_user_id=$4)`, [tenantId, discussionId, clientMessageId, ownerUserId]);
      const row = result.rows[0];
      return row ? {
        userMessage: mapMessage(row),
        attempt: row.attempt_id ? mapAttempt({ id: row.attempt_id, discussion_id: row.discussion_id, user_message_id: row.user_message_id, assistant_message_id: row.assistant_message_id, context_snapshot_id: row.attempt_context_snapshot_id, generation_id: row.attempt_generation_id, model: row.attempt_model, prompt_version: row.attempt_prompt_version, status: row.attempt_status, error_code: row.attempt_error_code, started_at: row.attempt_started_at, completed_at: row.attempt_completed_at }) : null,
      } : null;
    });
  }

  async beginTurn({ tenantId, ownerUserId, discussionId, clientMessageId, text, snapshot, generationId, model, promptVersion }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const discussion = await client.query(`SELECT id FROM ${this.schema}.requirement_discussions WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR owner_user_id=$3) FOR UPDATE`, [tenantId, discussionId, ownerUserId]);
      if (!discussion.rows[0]) {
        const error = new Error('Discussion not found');
        error.code = 'DISCUSSION_NOT_FOUND';
        throw error;
      }
      const previous = await client.query(`SELECT m.*, a.id AS attempt_id, a.status AS attempt_status, a.error_code AS attempt_error_code,
        a.generation_id AS attempt_generation_id, a.model AS attempt_model, a.prompt_version AS attempt_prompt_version,
        a.started_at AS attempt_started_at, a.completed_at AS attempt_completed_at, a.user_message_id, a.assistant_message_id,
        a.context_snapshot_id AS attempt_context_snapshot_id
        FROM ${this.schema}.requirement_discussion_messages m
        LEFT JOIN ${this.schema}.requirement_discussion_attempts a ON a.user_message_id=m.id
        WHERE m.tenant_id=$1 AND m.discussion_id=$2 AND m.client_message_id=$3`, [tenantId, discussionId, clientMessageId]);
      if (previous.rows[0]) {
        const row = previous.rows[0];
        return {
          replayed: true,
          userMessage: mapMessage(row),
          attempt: row.attempt_id ? mapAttempt({ id: row.attempt_id, discussion_id: row.discussion_id, user_message_id: row.user_message_id, assistant_message_id: row.assistant_message_id, context_snapshot_id: row.attempt_context_snapshot_id, generation_id: row.attempt_generation_id, model: row.attempt_model, prompt_version: row.attempt_prompt_version, status: row.attempt_status, error_code: row.attempt_error_code, started_at: row.attempt_started_at, completed_at: row.attempt_completed_at }) : null,
        };
      }
      const userMessageId = randomUUID();
      const assistantMessageId = randomUUID();
      const snapshotId = randomUUID();
      const attemptId = randomUUID();
      await client.query(`INSERT INTO ${this.schema}.requirement_discussion_context_snapshots
        (id,tenant_id,discussion_id,base_version_id,manifest,content,content_hash,included_bytes,omitted,unsaved_draft)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb,$10)`, [snapshotId, tenantId, discussionId, snapshot.baseVersionId || null, JSON.stringify(snapshot.manifest || {}), JSON.stringify(snapshot.content || {}), snapshot.contentHash, snapshot.includedBytes || 0, JSON.stringify(snapshot.omitted || []), Boolean(snapshot.unsavedDraft)]);
      await client.query(`INSERT INTO ${this.schema}.requirement_discussion_messages
        (id,tenant_id,discussion_id,role,status,body,client_message_id,generation_id,context_snapshot_id)
        VALUES($1,$2,$3,'user','completed',$4,$5,$6,$7)`, [userMessageId, tenantId, discussionId, text, clientMessageId, generationId, snapshotId]);
      await client.query(`INSERT INTO ${this.schema}.requirement_discussion_messages
        (id,tenant_id,discussion_id,role,status,body,generation_id,context_snapshot_id)
        VALUES($1,$2,$3,'assistant','pending','',$4,$5)`, [assistantMessageId, tenantId, discussionId, generationId, snapshotId]);
      const attempt = await client.query(`INSERT INTO ${this.schema}.requirement_discussion_attempts
        (id,tenant_id,discussion_id,user_message_id,assistant_message_id,context_snapshot_id,generation_id,model,prompt_version,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'running') RETURNING *`, [attemptId, tenantId, discussionId, userMessageId, assistantMessageId, snapshotId, generationId, model, promptVersion]);
      await client.query(`UPDATE ${this.schema}.requirement_discussions SET updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, discussionId]);
      return { replayed: false, userMessage: mapMessage({ id: userMessageId, discussion_id: discussionId, role: 'user', status: 'completed', body: text, client_message_id: clientMessageId, generation_id: generationId, context_snapshot_id: snapshotId, created_at: new Date(), completed_at: new Date() }), assistantMessage: mapMessage({ id: assistantMessageId, discussion_id: discussionId, role: 'assistant', status: 'pending', body: '', generation_id: generationId, context_snapshot_id: snapshotId, created_at: new Date() }), attempt: mapAttempt(attempt.rows[0]) };
    });
  }

  async beginRetry({ tenantId, ownerUserId, discussionId, userMessageId, snapshot, generationId, model, promptVersion }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const discussion = await client.query(`SELECT id FROM ${this.schema}.requirement_discussions WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR owner_user_id=$3) FOR UPDATE`, [tenantId, discussionId, ownerUserId]);
      if (!discussion.rows[0]) {
        const error = new Error('Discussion not found');
        error.code = 'DISCUSSION_NOT_FOUND';
        throw error;
      }
      const user = await client.query(`SELECT * FROM ${this.schema}.requirement_discussion_messages WHERE tenant_id=$1 AND discussion_id=$2 AND id=$3 AND role='user'`, [tenantId, discussionId, userMessageId]);
      if (!user.rows[0]) return null;
      const assistantMessageId = randomUUID();
      const snapshotId = randomUUID();
      const attemptId = randomUUID();
      await client.query(`INSERT INTO ${this.schema}.requirement_discussion_context_snapshots
        (id,tenant_id,discussion_id,base_version_id,manifest,content,content_hash,included_bytes,omitted,unsaved_draft)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9::jsonb,$10)`, [snapshotId, tenantId, discussionId, snapshot.baseVersionId || null, JSON.stringify(snapshot.manifest || {}), JSON.stringify(snapshot.content || {}), snapshot.contentHash, snapshot.includedBytes || 0, JSON.stringify(snapshot.omitted || []), Boolean(snapshot.unsavedDraft)]);
      await client.query(`INSERT INTO ${this.schema}.requirement_discussion_messages
        (id,tenant_id,discussion_id,role,status,body,generation_id,context_snapshot_id)
        VALUES($1,$2,$3,'assistant','pending','',$4,$5)`, [assistantMessageId, tenantId, discussionId, generationId, snapshotId]);
      const attempt = await client.query(`INSERT INTO ${this.schema}.requirement_discussion_attempts
        (id,tenant_id,discussion_id,user_message_id,assistant_message_id,context_snapshot_id,generation_id,model,prompt_version,status)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'running') RETURNING *`, [attemptId, tenantId, discussionId, userMessageId, assistantMessageId, snapshotId, generationId, model, promptVersion]);
      return { replayed: false, userMessage: mapMessage(user.rows[0]), assistantMessage: mapMessage({ id: assistantMessageId, discussion_id: discussionId, role: 'assistant', status: 'pending', body: '', generation_id: generationId, context_snapshot_id: snapshotId, created_at: new Date() }), attempt: mapAttempt(attempt.rows[0]) };
    });
  }

  async finishAttempt({ tenantId, attemptId, assistantMessageId, status, text = '', errorCode = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const message = await client.query(`UPDATE ${this.schema}.requirement_discussion_messages
        SET status=$3,body=$4,error_code=$5,completed_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, assistantMessageId, status, text, errorCode]);
      const attempt = await client.query(`UPDATE ${this.schema}.requirement_discussion_attempts
        SET status=$3,error_code=$4,completed_at=now()
        WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, attemptId, status === 'completed' ? 'completed' : status, errorCode]);
      if (message.rows[0]) await client.query(`UPDATE ${this.schema}.requirement_discussions SET updated_at=now() WHERE tenant_id=$1 AND id=$2`, [tenantId, message.rows[0].discussion_id]);
      return { message: mapMessage(message.rows[0]), attempt: mapAttempt(attempt.rows[0]) };
    });
  }

  async cancelAttempt({ tenantId, attemptId, assistantMessageId }) {
    return this.finishAttempt({ tenantId, attemptId, assistantMessageId, status: 'cancelled', errorCode: 'DISCUSSION_CANCELLED' });
  }

  async findAttempt({ tenantId, ownerUserId = null, attemptId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT a.*, s.base_version_id, s.manifest AS snapshot_manifest, s.included_bytes AS snapshot_included_bytes,
          s.omitted AS snapshot_omitted, s.unsaved_draft AS snapshot_unsaved_draft FROM ${this.schema}.requirement_discussion_attempts a
        JOIN ${this.schema}.requirement_discussions d ON d.id=a.discussion_id
        LEFT JOIN ${this.schema}.requirement_discussion_context_snapshots s ON s.id=a.context_snapshot_id
        WHERE a.tenant_id=$1 AND a.id=$2 AND ($3::text IS NULL OR d.owner_user_id=$3)`, [tenantId, attemptId, ownerUserId]);
      return mapAttempt(result.rows[0]);
    });
  }

  async latestAttempt({ tenantId, ownerUserId = null, discussionId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT a.*, s.base_version_id, s.manifest AS snapshot_manifest, s.included_bytes AS snapshot_included_bytes,
          s.omitted AS snapshot_omitted, s.unsaved_draft AS snapshot_unsaved_draft FROM ${this.schema}.requirement_discussion_attempts a
        JOIN ${this.schema}.requirement_discussions d ON d.id=a.discussion_id
        LEFT JOIN ${this.schema}.requirement_discussion_context_snapshots s ON s.id=a.context_snapshot_id
        WHERE a.tenant_id=$1 AND a.discussion_id=$2 AND ($3::text IS NULL OR d.owner_user_id=$3)
        ORDER BY a.started_at DESC,a.id DESC LIMIT 1`, [tenantId, discussionId, ownerUserId]);
      return mapAttempt(result.rows[0]);
    });
  }

  async latestProposal({ tenantId, ownerUserId = null, discussionId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT p.* FROM ${this.schema}.requirement_discussion_proposals p
        JOIN ${this.schema}.requirement_discussions d ON d.id=p.discussion_id
        WHERE p.tenant_id=$1 AND p.discussion_id=$2 AND ($3::text IS NULL OR d.owner_user_id=$3)
        ORDER BY p.created_at DESC,p.id DESC LIMIT 1`, [tenantId, discussionId, ownerUserId]);
      return mapProposal(result.rows[0]);
    });
  }

  async storeProposal({ tenantId, discussionId, messageId, proposal }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`INSERT INTO ${this.schema}.requirement_discussion_proposals
        (id,tenant_id,discussion_id,message_id,schema_version,package,base_hash,status)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'available') RETURNING *`, [randomUUID(), tenantId, discussionId, messageId, proposal.schemaVersion, JSON.stringify(proposal), proposal.baseHash]);
      return result.rows[0];
    });
  }

  async markProposal({ tenantId, proposalId, status, receipt = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`UPDATE ${this.schema}.requirement_discussion_proposals SET status=$3,receipt=$4::jsonb,updated_at=now() WHERE tenant_id=$1 AND id=$2 RETURNING *`, [tenantId, proposalId, status, receipt ? JSON.stringify(receipt) : null]);
      return result.rows[0] || null;
    });
  }
}

export { mapDiscussion, mapMessage, mapAttempt };
