import { randomUUID } from 'node:crypto';

import { withTenantTransaction } from '../db/transaction.js';

export class JobTraceRepository {
  constructor(pool, { schema = 'reqai' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
  }

  async append({
    tenantId, jobId, category, name, status = 'INFO', stepId = null,
    startedAt = null, completedAt = null, durationMs = null, metadata = {},
    inputArtifactId = null, outputArtifactId = null, detailArtifactId = null,
    detailKind = null, detailVisibility = 'METADATA', expiresAt = null,
  }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await client.query(`SELECT id FROM ${this.schema}.jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, jobId]);
      const result = await client.query(
        `INSERT INTO ${this.schema}.job_trace_entries(
           id,tenant_id,job_id,sequence,category,name,status,step_id,started_at,completed_at,duration_ms,
           metadata,input_artifact_id,output_artifact_id,detail_artifact_id,detail_kind,detail_visibility,expires_at
         ) SELECT $1,$2,$3,COALESCE(max(sequence),0)+1,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,$17
           FROM ${this.schema}.job_trace_entries WHERE tenant_id=$2 AND job_id=$3
         RETURNING *`,
        [randomUUID(), tenantId, jobId, category, name, status, stepId, startedAt, completedAt, durationMs,
          JSON.stringify(metadata), inputArtifactId, outputArtifactId, detailArtifactId, detailKind, detailVisibility, expiresAt],
      );
      return result.rows[0];
    });
  }

  async snapshot({ tenantId, ownerUserId = null, jobId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const jobResult = await client.query(
        `SELECT * FROM ${this.schema}.jobs
         WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR owner_user_id=$3)`,
        [tenantId, jobId, ownerUserId],
      );
      if (!jobResult.rowCount) return null;
      const [steps, attempts, events, versions, entries, artifacts] = await Promise.all([
        client.query(`SELECT * FROM ${this.schema}.job_steps WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,step_id`, [tenantId, jobId]),
        client.query(`SELECT * FROM ${this.schema}.job_attempts WHERE tenant_id=$1 AND job_id=$2 ORDER BY started_at,id`, [tenantId, jobId]),
        client.query(`SELECT event_id,event_type,schema_version,sequence,payload,created_at FROM ${this.schema}.outbox_events WHERE tenant_id=$1 AND aggregate_id=$2 ORDER BY sequence,event_id`, [tenantId, jobId]),
        client.query(`SELECT id,source_job_id,base_version_id,research_job_id,created_at FROM ${this.schema}.requirements_versions WHERE tenant_id=$1 AND (source_job_id=$2 OR research_job_id=$2) ORDER BY created_at,id`, [tenantId, jobId]),
        client.query(`SELECT * FROM ${this.schema}.job_trace_entries WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence,id`, [tenantId, jobId]),
        client.query(
          `SELECT id,kind,content_type,size_bytes,sha256,storage_status,expires_at,created_at,completed_at
           FROM ${this.schema}.artifacts WHERE tenant_id=$1 AND id IN (
             SELECT input_artifact_id FROM ${this.schema}.jobs WHERE tenant_id=$1 AND id=$2
             UNION SELECT result_artifact_id FROM ${this.schema}.jobs WHERE tenant_id=$1 AND id=$2
             UNION SELECT result_artifact_id FROM ${this.schema}.job_steps WHERE tenant_id=$1 AND job_id=$2
             UNION SELECT input_artifact_id FROM ${this.schema}.job_trace_entries WHERE tenant_id=$1 AND job_id=$2
             UNION SELECT output_artifact_id FROM ${this.schema}.job_trace_entries WHERE tenant_id=$1 AND job_id=$2
             UNION SELECT detail_artifact_id FROM ${this.schema}.job_trace_entries WHERE tenant_id=$1 AND job_id=$2
           ) ORDER BY created_at,id`,
          [tenantId, jobId],
        ),
      ]);
      return { job: jobResult.rows[0], steps: steps.rows, attempts: attempts.rows, events: events.rows, versions: versions.rows, entries: entries.rows, artifacts: artifacts.rows };
    });
  }

  async findVisibleEntry({ tenantId, ownerUserId = null, jobId, entryId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT e.* FROM ${this.schema}.job_trace_entries e
         JOIN ${this.schema}.jobs j ON j.tenant_id=e.tenant_id AND j.id=e.job_id
         WHERE e.tenant_id=$1 AND e.job_id=$2 AND e.id=$3
           AND ($4::text IS NULL OR j.owner_user_id=$4)`,
        [tenantId, jobId, entryId, ownerUserId],
      );
      return result.rows[0] || null;
    });
  }
}
