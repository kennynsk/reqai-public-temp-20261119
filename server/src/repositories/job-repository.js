import { randomUUID } from 'node:crypto';

import { ApiError } from '../errors/api-error.js';
import { assertJobTransition } from '../domain/job-state.js';
import { withTenantTransaction } from '../db/transaction.js';
import { initialJobMetadata } from '../domain/job-metadata.js';

export class JobRepository {
  constructor(pool, { schema = 'reqai', artifactSchema = 'reqai_artifacts' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
    this.artifactSchema = `"${artifactSchema}"`;
  }

  async createAcceptedWithInlineArtifact({ inlineArtifact, ...args }) {
    if (!inlineArtifact) throw new Error('inlineArtifact is required');
    return this.createAccepted({ ...args, inlineArtifact });
  }

  async findById({ tenantId, jobId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM ${this.schema}.jobs WHERE tenant_id = $1 AND id = $2`,
        [tenantId, jobId],
      );
      return result.rows[0] || null;
    });
  }

  async findVisibleById({ tenantId, ownerUserId = null, jobId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM ${this.schema}.jobs
         WHERE tenant_id = $1 AND id = $2 AND ($3::text IS NULL OR owner_user_id = $3)`,
        [tenantId, jobId, ownerUserId],
      );
      return result.rows[0] || null;
    });
  }

  async listVisible({ tenantId, ownerUserId = null, status = null, beforeCreatedAt = null, beforeId = null, limit = 20, q = '', type = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM ${this.schema}.jobs
         WHERE tenant_id = $1
           AND ($2::text IS NULL OR owner_user_id = $2)
           AND ($3::text IS NULL OR status = $3)
           AND ($4::timestamptz IS NULL OR (created_at, id) < ($4, $5::uuid))
           AND ($7='' OR strpos(lower(COALESCE(title,'') || ' ' || search_summary),lower($7))>0)
           AND ($8::text IS NULL OR type=$8)
         ORDER BY created_at DESC, id DESC
         LIMIT $6`,
        [tenantId, ownerUserId, status, beforeCreatedAt, beforeId, Math.min(Math.max(limit, 1), 100) + 1, q, type],
      );
      return result.rows;
    });
  }

  async workflowMetadata({ tenantId, ownerUserId = null, jobId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT COALESCE(p.id,j.id) AS id, COALESCE(p.title,j.title) AS title,
        COALESCE(p.metadata_revision,j.metadata_revision) AS metadata_revision, j.type, j.created_at
        FROM ${this.schema}.jobs j LEFT JOIN ${this.schema}.jobs p ON p.tenant_id=j.tenant_id AND p.id=j.parent_job_id
          AND p.type='DECOMPOSITION' AND ($2::text IS NULL OR p.owner_user_id=$2)
        WHERE j.tenant_id = $1 AND ($2::text IS NULL OR j.owner_user_id=$2) AND j.id=$3`, [tenantId, ownerUserId, jobId]);
      return result.rows[0] || null;
    });
  }

  async updateWorkflowMetadata({ tenantId, ownerUserId = null, jobId, title, expectedRevision, actorId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const target = await client.query(`SELECT COALESCE(p.id,j.id) AS id FROM ${this.schema}.jobs j
        LEFT JOIN ${this.schema}.jobs p ON p.tenant_id=j.tenant_id AND p.id=j.parent_job_id AND p.type='DECOMPOSITION' AND ($2::text IS NULL OR p.owner_user_id=$2)
        WHERE j.tenant_id = $1 AND j.id=$3 AND ($2::text IS NULL OR j.owner_user_id=$2)`, [tenantId, ownerUserId, jobId]);
      if (!target.rows[0]) return null;
      const rootId = target.rows[0].id;
      const updated = await client.query(`UPDATE ${this.schema}.jobs SET title=$4, metadata_revision=metadata_revision+1,
        sequence=sequence+1, version=version+1, updated_at=clock_timestamp()
        WHERE tenant_id = $1 AND id=$2 AND metadata_revision=$3 RETURNING *`, [tenantId, rootId, expectedRevision, title]);
      if (!updated.rows[0]) throw new ApiError({ status: 409, code: 'METADATA_CONFLICT', message: 'The title was changed by another client. Reload it before renaming.' });
      const root = updated.rows[0];
      const children = await client.query(`UPDATE ${this.schema}.jobs SET sequence=sequence+1, version=version+1
        WHERE tenant_id = $1 AND parent_job_id=$2 AND ($3::text IS NULL OR owner_user_id=$3) RETURNING *`, [tenantId, rootId, ownerUserId]);
      for (const row of [root, ...children.rows]) await client.query(`INSERT INTO ${this.schema}.outbox_events(event_id,tenant_id,aggregate_type,aggregate_id,sequence,event_type,schema_version,payload)
        VALUES($1,$2,'job',$3,$4,'job.metadata-updated','1.0',$5::jsonb)`, [randomUUID(), tenantId, row.id, row.sequence, JSON.stringify({ jobId: row.id, metadataJobId: rootId, title, metadataRevision: root.metadata_revision, actorUserId: actorId })]);
      return root;
    });
  }

  async listWorkflows({ tenantId, ownerUserId = null, q = '', type = null, status = null, beforeCreatedAt = null, beforeId = null, limit = 20 }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`WITH visible AS (
        SELECT * FROM ${this.schema}.jobs WHERE tenant_id = $1 AND ($2::text IS NULL OR owner_user_id=$2)
      ), members AS (
        SELECT j.*, COALESCE(p.id,j.id) AS root_id FROM visible j LEFT JOIN visible p ON p.id=j.parent_job_id AND p.type='DECOMPOSITION'
      ) SELECT r.*,
        COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id) FROM members c WHERE c.root_id=r.id AND c.id<>r.id),'[]'::jsonb) AS children,
        (SELECT jsonb_agg(saved.entry) FROM (SELECT jsonb_build_object('jobId',v.source_job_id,'versionId',v.id,'createdAt',v.created_at,'final',v.research_job_id IS NOT NULL OR COALESCE(v.decisions->>'skippedResearch'='true',false)) AS entry
          FROM ${this.schema}.requirements_versions v WHERE v.tenant_id = $1 AND ($2::text IS NULL OR v.owner_user_id=$2) AND v.source_job_id IN (SELECT m.id FROM members m WHERE m.root_id=r.id)
          ORDER BY v.created_at DESC,v.id DESC LIMIT 1) saved) AS saved_versions
        FROM visible r WHERE r.id IN (SELECT DISTINCT root_id FROM members)
          AND ($3='' OR EXISTS(SELECT 1 FROM members m WHERE m.root_id=r.id AND strpos(lower(COALESCE(m.title,'') || ' ' || m.search_summary),lower($3))>0))
          AND ($4::text IS NULL OR EXISTS(SELECT 1 FROM members m WHERE m.root_id=r.id AND m.type=$4))
          AND ($5::text IS NULL OR EXISTS(SELECT 1 FROM members m WHERE m.root_id=r.id AND m.status=$5))
          AND ($6::timestamptz IS NULL OR (r.created_at,r.id)<($6,$7::uuid))
        ORDER BY r.created_at DESC,r.id DESC LIMIT $8`, [tenantId, ownerUserId, q, type, status, beforeCreatedAt, beforeId, limit + 1]);
      const pending = await client.query(`SELECT EXISTS(SELECT 1 FROM ${this.schema}.jobs WHERE tenant_id = $1 AND ($2::text IS NULL OR owner_user_id=$2) AND metadata_indexed_at IS NULL) AS pending`, [tenantId, ownerUserId]);
      return { rows: result.rows, indexingPending: pending.rows[0].pending };
    });
  }

  async backfillMetadata({ tenantId, limit = 100 }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const jobs = await client.query(`SELECT * FROM ${this.schema}.jobs WHERE tenant_id = $1 AND metadata_indexed_at IS NULL ORDER BY created_at,id LIMIT $2 FOR UPDATE SKIP LOCKED`, [tenantId, Math.min(500, Math.max(1, limit))]);
      for (const job of jobs.rows) {
        const source = await client.query(`SELECT substring(c.content from 1 for 8000) AS content FROM ${this.artifactSchema}.artifact_content c JOIN ${this.schema}.artifacts a ON a.id=c.artifact_id AND a.tenant_id=c.tenant_id
          WHERE c.tenant_id = $1 AND c.artifact_id=$2 AND c.chunk_index=0 AND a.content_type LIKE 'text/%' AND a.storage_status='AVAILABLE'`, [tenantId, job.input_artifact_id]);
        const metadata = initialJobMetadata({ text: source.rows[0]?.content?.subarray(0, 8000).toString('utf8'), name: job.configuration_snapshot?.materials?.primary?.name, type: job.type, createdAt: job.created_at });
        await client.query(`UPDATE ${this.schema}.jobs SET title=COALESCE(title,$3),search_summary=$4,metadata_indexed_at=clock_timestamp() WHERE tenant_id = $1 AND id=$2`, [tenantId, job.id, metadata.title, metadata.summary]);
      }
      return jobs.rowCount;
    });
  }

  async getResult({ tenantId, ownerUserId = null, jobId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const jobResult = await client.query(
        `SELECT * FROM ${this.schema}.jobs
         WHERE tenant_id = $1 AND id = $2 AND ($3::text IS NULL OR owner_user_id = $3)`,
        [tenantId, jobId, ownerUserId],
      );
      if (!jobResult.rowCount) return null;
      const steps = await client.query(
          `SELECT step_id, step_type, status, outcome, summary
           FROM ${this.schema}.job_steps WHERE tenant_id = $1 AND job_id = $2 ORDER BY created_at, step_id`,
          [tenantId, jobId],
        );
      const attempts = await client.query(
          `SELECT step_id, requested_model, actual_model, execution_id, attempt, status, reason_code,
                  input_tokens, output_tokens, duration_ms
           FROM ${this.schema}.job_attempts WHERE tenant_id = $1 AND job_id = $2 ORDER BY started_at, id`,
          [tenantId, jobId],
        );
      return { job: jobResult.rows[0], steps: steps.rows, attempts: attempts.rows };
    });
  }

  async createAccepted({
    tenantId,
    ownerUserId,
    idempotencyKey,
    requestHash,
    job,
    event,
    audit,
    admission,
    idempotencyExpiresAt,
    inlineArtifact = null,
  }) {
    try {
      return await withTenantTransaction(this.pool, tenantId, async (client) => {
        await client.query(
          `DELETE FROM ${this.schema}.idempotency_keys
           WHERE tenant_id = $1 AND idempotency_key = $2 AND expires_at <= now()`,
          [tenantId, idempotencyKey],
        );
        const existing = await this.#findIdempotency(client, tenantId, idempotencyKey);
        if (existing) return this.#resolveIdempotency(existing, requestHash);

        if (admission) await this.#enforceAdmission(client, { tenantId, ownerUserId, jobType: job.type, admission });

        if (inlineArtifact) {
          const content = Buffer.from(inlineArtifact.content);
          await client.query(
            `INSERT INTO ${this.schema}.artifacts(
               id,tenant_id,owner_user_id,kind,content_type,size_bytes,sha256,storage_status,expires_at,completed_at
             ) VALUES($1,$2,$3,'INPUT',$4,$5,$6,'AVAILABLE',$7,now())`,
            [job.inputArtifactId, tenantId, ownerUserId, inlineArtifact.contentType, content.length, inlineArtifact.sha256, inlineArtifact.expiresAt],
          );
          for (let offset = 0, index = 0; offset < content.length; offset += 1024 * 1024, index += 1) {
            await client.query(
              `INSERT INTO ${this.artifactSchema}.artifact_content(artifact_id,tenant_id,chunk_index,content) VALUES($1,$2,$3,$4)`,
              [job.inputArtifactId, tenantId, index, content.subarray(offset, offset + 1024 * 1024)],
            );
          }
        }

        let primaryText = inlineArtifact?.content ? Buffer.from(inlineArtifact.content).subarray(0, 8000).toString('utf8') : '';
        if (!primaryText && job.type === 'DECOMPOSITION') {
          const source = await client.query(`SELECT substring(c.content from 1 for 8000) AS content FROM ${this.artifactSchema}.artifact_content c JOIN ${this.schema}.artifacts a ON a.id=c.artifact_id AND a.tenant_id=c.tenant_id
            WHERE c.tenant_id = $1 AND c.artifact_id=$2 AND c.chunk_index=0 AND a.content_type LIKE 'text/%' AND a.storage_status='AVAILABLE'`, [tenantId, job.inputArtifactId]);
          primaryText = source.rows[0]?.content?.subarray(0, 8000).toString('utf8') || '';
        }
        const metadata = initialJobMetadata({ text: primaryText, name: job.configurationSnapshot?.materials?.primary?.name, type: job.type });
        const inserted = await client.query(
          `INSERT INTO ${this.schema}.jobs (
             id, tenant_id, owner_user_id, parent_job_id, type, status, priority,
             input_artifact_id, configuration_snapshot, created_site, deadline_at, sequence, title, search_summary, metadata_indexed_at
           ) VALUES ($1, $2, $3, $4, $5, 'ACCEPTED', $6, $7, $8::jsonb, $9, $10, 1, $11, $12, clock_timestamp())
           RETURNING *`,
          [
            job.id,
            tenantId,
            ownerUserId,
            job.parentJobId,
            job.type,
            job.priority,
            job.inputArtifactId,
            JSON.stringify(job.configurationSnapshot),
            job.createdSite,
            job.deadlineAt,
            metadata.title,
            metadata.summary,
          ],
        );

        await client.query(
          `INSERT INTO ${this.schema}.idempotency_keys (
             tenant_id, idempotency_key, job_id, request_hash, expires_at
           ) VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, idempotencyKey, job.id, requestHash, idempotencyExpiresAt],
        );

        await client.query(
          `INSERT INTO ${this.schema}.outbox_events (
             event_id, tenant_id, aggregate_type, aggregate_id, sequence, event_type, schema_version, payload,
             workflow_dispatch_status
           ) VALUES ($1, $2, 'job', $3, 1, $4, '1.0', $5::jsonb, 'PENDING')`,
          [event.id, tenantId, job.id, event.type, JSON.stringify(event.payload)],
        );

        if (job.parentJobId && job.type === 'RESEARCH' && job.configurationSnapshot?.featureMode === 'REQUIREMENTS_INSIGHTS') {
          const parent = await client.query(
            `UPDATE ${this.schema}.jobs
             SET sequence=sequence+1, version=version+1, updated_at=now()
             WHERE tenant_id = $1 AND id=$2 RETURNING sequence`,
            [tenantId, job.parentJobId],
          );
          await client.query(
            `INSERT INTO ${this.schema}.outbox_events(
               event_id, tenant_id, aggregate_type, aggregate_id, sequence, event_type, schema_version, payload
             ) VALUES($1,$2,'job',$3,$4,'linked-research.created','1.0',$5::jsonb)`,
            [randomUUID(), tenantId, job.parentJobId, parent.rows[0].sequence, JSON.stringify({
              jobId: job.parentJobId,
              linkedJobId: job.id,
              requirementsVersionId: job.inputArtifactId,
              occurredAt: event.payload.occurredAt,
            })],
          );
        }

        await client.query(
          `INSERT INTO ${this.schema}.audit_events (
             id, tenant_id, actor_id, actor_roles, action, target_type, target_id,
             request_id, source_site, metadata
           ) VALUES ($1, $2, $3, $4, $5, 'job', $6, $7, $8, $9::jsonb)`,
          [audit.id, tenantId, ownerUserId, audit.actorRoles, audit.action, job.id, audit.requestId, job.createdSite, JSON.stringify(audit.metadata)],
        );

        return { job: inserted.rows[0], replayed: false };
      });
    } catch (error) {
      if (error?.code !== '23505') throw error;
      return withTenantTransaction(this.pool, tenantId, async (client) => {
        const existing = await this.#findIdempotency(client, tenantId, idempotencyKey);
        if (!existing) throw error;
        return this.#resolveIdempotency(existing, requestHash);
      });
    }
  }

  async #enforceAdmission(client, { tenantId, ownerUserId, jobType, admission }) {
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended('admission:' || tenant_id, 0))
       FROM (VALUES ($1::text)) AS tenant_scope(tenant_id) WHERE tenant_id = $1`,
      [tenantId],
    );
    const result = await client.query(
      `SELECT
         count(*) FILTER (WHERE created_at >= now() - interval '1 minute')::integer AS recent_count,
         count(*) FILTER (WHERE owner_user_id = $2 AND status IN ('ACCEPTED','QUEUED','RUNNING','RETRY_WAIT','CANCEL_REQUESTED'))::integer AS user_active,
         count(*) FILTER (WHERE status IN ('ACCEPTED','QUEUED','RUNNING','RETRY_WAIT','CANCEL_REQUESTED'))::integer AS backlog
       FROM ${this.schema}.jobs WHERE tenant_id = $1`,
      [tenantId, ownerUserId],
    );
    const counters = result.rows[0];
    if (counters.recent_count >= admission.maxPerMinute) {
      throw new ApiError({ status: 429, code: 'JOB_RATE_LIMIT', message: 'Job creation rate limit reached', retryable: true, details: { retryAfterSeconds: 60 } });
    }
    if (counters.user_active >= admission.maxActivePerUser) {
      throw new ApiError({ status: 429, code: 'USER_ACTIVE_JOB_LIMIT', message: 'Active job limit reached for user', retryable: true, details: { retryAfterSeconds: 30 } });
    }
    if (counters.backlog >= admission.hardBacklog) {
      throw new ApiError({ status: 503, code: 'HARD_BACKLOG_LIMIT', message: 'Job backlog hard limit reached', retryable: true, details: { retryAfterSeconds: 60 } });
    }
    if (jobType === 'RESEARCH' && counters.backlog >= admission.softBacklog) {
      throw new ApiError({ status: 429, code: 'SOFT_BACKLOG_LIMIT', message: 'Research admission paused to preserve decomposition capacity', retryable: true, details: { retryAfterSeconds: 30 } });
    }
  }

  async requestCancellation({ tenantId, ownerUserId = null, jobId, event, audit }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const locked = await client.query(
        `SELECT * FROM ${this.schema}.jobs
         WHERE tenant_id = $1 AND id = $2 AND ($3::text IS NULL OR owner_user_id = $3) FOR UPDATE`,
        [tenantId, jobId, ownerUserId],
      );
      if (!locked.rowCount) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      const current = locked.rows[0];
      if (current.status === 'CANCEL_REQUESTED') return { job: current, replayed: true };
      assertJobTransition(current.status, 'CANCEL_REQUESTED');
      const updated = await client.query(
        `UPDATE ${this.schema}.jobs
         SET status = 'CANCEL_REQUESTED', sequence = sequence + 1, version = version + 1, updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND version = $3 RETURNING *`,
        [tenantId, jobId, current.version],
      );
      await client.query(
        `INSERT INTO ${this.schema}.outbox_events (
           event_id, tenant_id, aggregate_type, aggregate_id, sequence, event_type, schema_version, payload,
           workflow_dispatch_status
         ) VALUES ($1, $2, 'job', $3, $4, 'job.cancel-requested', '1.0', $5::jsonb, 'PENDING')`,
        [event.id, tenantId, jobId, Number(current.sequence) + 1, JSON.stringify(event.payload)],
      );
      await client.query(
        `INSERT INTO ${this.schema}.audit_events (
           id, tenant_id, actor_id, actor_roles, action, target_type, target_id, request_id, source_site, metadata
         ) VALUES ($1, $2, $3, $4, 'job.cancel', 'job', $5, $6, $7, '{}'::jsonb)`,
        [audit.id, tenantId, audit.actorId, audit.actorRoles, jobId, audit.requestId, audit.sourceSite],
      );
      return { job: updated.rows[0], replayed: false };
    });
  }

  async #findIdempotency(client, tenantId, idempotencyKey) {
    const result = await client.query(
      `SELECT i.request_hash, j.*
       FROM ${this.schema}.idempotency_keys i
       JOIN ${this.schema}.jobs j ON j.tenant_id = i.tenant_id AND j.id = i.job_id
       WHERE i.tenant_id = $1 AND i.idempotency_key = $2 AND i.expires_at > now()`,
      [tenantId, idempotencyKey],
    );
    return result.rows[0] || null;
  }

  #resolveIdempotency(existing, requestHash) {
    if (existing.request_hash !== requestHash) {
      throw new ApiError({
        status: 409,
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Idempotency key was already used with a different request',
      });
    }
    const { request_hash: ignored, ...job } = existing;
    return { job, replayed: true };
  }

  async transition({ tenantId, jobId, toStatus, outcome = null, patch = {} }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const locked = await client.query(
        `SELECT status, version FROM ${this.schema}.jobs WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, jobId],
      );
      if (!locked.rowCount) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      const current = locked.rows[0];
      assertJobTransition(current.status, toStatus, outcome);

      const result = await client.query(
        `UPDATE ${this.schema}.jobs
         SET status = $3,
             outcome = $4,
             progress = COALESCE($5, progress),
             current_step = COALESCE($6, current_step),
             message = COALESCE($7, message),
             reason_code = COALESCE($8, reason_code),
             execution_site = COALESCE($9, execution_site),
             completed_site = COALESCE($10, completed_site),
             result_artifact_id = COALESCE($11, result_artifact_id),
             started_at = CASE WHEN $3 = 'RUNNING' THEN COALESCE(started_at, now()) ELSE started_at END,
             completed_at = CASE WHEN $3 IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN now() ELSE completed_at END,
             updated_at = now(),
             version = version + 1,
             sequence = sequence + 1
         WHERE tenant_id = $1 AND id = $2 AND version = $12
         RETURNING *`,
        [
          tenantId,
          jobId,
          toStatus,
          outcome,
          patch.progress ?? null,
          patch.currentStep ?? null,
          patch.message ?? null,
          patch.reasonCode ?? null,
          patch.executionSite ?? null,
          patch.completedSite ?? null,
          patch.resultArtifactId ?? null,
          current.version,
        ],
      );
      if (!result.rowCount) {
        throw new ApiError({ status: 409, code: 'JOB_VERSION_CONFLICT', message: 'Job was updated concurrently', retryable: true });
      }
      const job = result.rows[0];
      await client.query(
        `INSERT INTO ${this.schema}.outbox_events(event_id,tenant_id,aggregate_type,aggregate_id,sequence,event_type,payload)
         VALUES($1,$2,'job',$3,$4,'job.status-changed',$5::jsonb)`,
        [randomUUID(), tenantId, jobId, job.sequence, JSON.stringify({ jobId, tenantId, status: job.status, outcome: job.outcome, progress: Number(job.progress), resultArtifactId: job.result_artifact_id, reasonCode: job.reason_code, occurredAt: new Date().toISOString() })],
      );
      return job;
    });
  }

  async updateProgress({ tenantId, jobId, progress, currentStep, message }) {
    const confirmedProgress = Math.max(0, Math.min(99, Math.trunc(Number(progress))));
    if (!Number.isFinite(confirmedProgress) || !currentStep || !message) {
      throw new ApiError({ status: 400, code: 'INVALID_JOB_PROGRESS', message: 'Progress update is invalid' });
    }
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const locked = await client.query(
        `SELECT status, version, sequence, progress, current_step, message
         FROM ${this.schema}.jobs WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, jobId],
      );
      if (!locked.rowCount) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      const current = locked.rows[0];
      if (!['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT'].includes(current.status)) return { job: current, replayed: true };
      const storedProgress = Number(current.progress || 0);
      if (confirmedProgress < storedProgress || (confirmedProgress === storedProgress && current.current_step === currentStep && current.message === message)) {
        return { job: current, replayed: true };
      }

      const updated = await client.query(
        `UPDATE ${this.schema}.jobs
         SET progress = GREATEST(progress, $3),
             current_step = $4,
             message = $5,
             updated_at = now(),
             version = version + 1,
             sequence = sequence + 1
         WHERE tenant_id = $1 AND id = $2 AND version = $6
         RETURNING *`,
        [tenantId, jobId, confirmedProgress, currentStep, message, current.version],
      );
      if (!updated.rowCount) {
        throw new ApiError({ status: 409, code: 'JOB_VERSION_CONFLICT', message: 'Job was updated concurrently', retryable: true });
      }
      const job = updated.rows[0];
      await client.query(
        `INSERT INTO ${this.schema}.outbox_events(
           event_id,tenant_id,aggregate_type,aggregate_id,sequence,event_type,schema_version,payload
         ) VALUES($1,$2,'job',$3,$4,'job.progress','1.0',$5::jsonb)`,
        [randomUUID(), tenantId, jobId, job.sequence, JSON.stringify({
          jobId,
          tenantId,
          status: job.status,
          progress: Number(job.progress),
          currentStep: job.current_step,
          message: job.message,
          occurredAt: new Date().toISOString(),
        })],
      );
      return { job, replayed: false };
    });
  }

  async saveCheckpoint({ tenantId, jobId, stepId, stepType, inputHash, status, outcome = null, resultArtifactId = null, summary = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO ${this.schema}.job_steps (
           job_id, tenant_id, step_id, step_type, status, outcome, input_hash, result_artifact_id, summary,
           started_at, completed_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
           CASE WHEN $5 = 'RUNNING' THEN now() ELSE NULL END,
           CASE WHEN $5 IN ('SUCCEEDED', 'FAILED', 'CANCELLED') THEN now() ELSE NULL END)
         ON CONFLICT (job_id, step_id) DO UPDATE SET
           status = EXCLUDED.status,
           outcome = EXCLUDED.outcome,
           result_artifact_id = COALESCE(EXCLUDED.result_artifact_id, ${this.schema}.job_steps.result_artifact_id),
           summary = COALESCE(EXCLUDED.summary, ${this.schema}.job_steps.summary),
           started_at = COALESCE(${this.schema}.job_steps.started_at, EXCLUDED.started_at),
           completed_at = EXCLUDED.completed_at,
           attempt_count = CASE WHEN EXCLUDED.status = 'RUNNING' THEN ${this.schema}.job_steps.attempt_count + 1 ELSE ${this.schema}.job_steps.attempt_count END,
           updated_at = now()
         WHERE ${this.schema}.job_steps.input_hash = EXCLUDED.input_hash
         RETURNING *`,
        [jobId, tenantId, stepId, stepType, status, outcome, inputHash, resultArtifactId, summary],
      );
      if (!result.rowCount) {
        throw new ApiError({
          status: 409,
          code: 'CHECKPOINT_INPUT_CONFLICT',
          message: 'Checkpoint exists with a different input hash',
        });
      }
      return result.rows[0];
    });
  }

  async findCheckpoint({ tenantId, jobId, stepId, inputHash }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${this.schema}.job_steps WHERE tenant_id = $1 AND job_id = $2 AND step_id = $3 AND input_hash = $4 AND status = 'SUCCEEDED'`, [tenantId, jobId, stepId, inputHash]);
      return result.rows[0] || null;
    });
  }
}
