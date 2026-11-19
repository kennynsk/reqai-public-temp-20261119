import { randomUUID } from 'node:crypto';

import { withTenantTransaction } from '../db/transaction.js';
import { increment } from '../observability/metrics.js';

export class RetentionRepository {
  constructor(pool, { schema = 'reqai', artifactSchema = 'reqai_artifacts' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
    this.artifactSchema = `"${artifactSchema}"`;
  }

  async cleanup({ tenantId, batchSize, siteId = 'unknown' }) {
    try {
      const deleted = await withTenantTransaction(this.pool, tenantId, async (client) => {
        const traceResult = await client.query(
          `DELETE FROM ${this.schema}.job_trace_entries
           WHERE tenant_id=$1 AND id IN (
             SELECT id FROM ${this.schema}.job_trace_entries
             WHERE tenant_id=$1 AND expires_at<=now()
             ORDER BY expires_at,id
             FOR UPDATE SKIP LOCKED LIMIT $2
           ) RETURNING id`,
          [tenantId, batchSize],
        );
        const artifactResult = await client.query(
          `WITH expired AS (
             SELECT a.id FROM ${this.schema}.artifacts a
             WHERE a.tenant_id = $1 AND a.expires_at<=now() AND a.legal_hold=false
               AND a.storage_status='AVAILABLE'
               AND NOT EXISTS(
                 SELECT 1 FROM ${this.schema}.jobs j
                 WHERE j.tenant_id = $1
                   AND j.status IN ('ACCEPTED','QUEUED','RUNNING','RETRY_WAIT','CANCEL_REQUESTED')
                   AND (j.input_artifact_id=a.id OR j.result_artifact_id=a.id)
               )
             ORDER BY a.expires_at FOR UPDATE SKIP LOCKED LIMIT $2
           )
           UPDATE ${this.schema}.artifacts a
           SET storage_status='DELETED',deleted_at=now()
           FROM expired e WHERE a.tenant_id = $1 AND a.id=e.id RETURNING a.id`,
          [tenantId, batchSize],
        );
        if (artifactResult.rows.length) {
          await client.query(
            `DELETE FROM ${this.artifactSchema}.artifact_content
             WHERE tenant_id = $1 AND artifact_id=ANY($2::uuid[])`,
            [tenantId, artifactResult.rows.map((row) => row.id)],
          );
        }
        if (artifactResult.rows.length || traceResult.rows.length) {
          await client.query(
            `INSERT INTO ${this.schema}.audit_events(
               id,tenant_id,actor_id,actor_roles,action,target_type,target_id,source_site,metadata
             ) VALUES($1,$2,'maintenance-worker','{operator}','retention.delete','retention-batch',$3,$4,$5::jsonb)`,
            [randomUUID(), tenantId, randomUUID(), siteId, JSON.stringify({
              artifactCount: artifactResult.rows.length,
              traceEntryCount: traceResult.rows.length,
            })],
          );
        }
        return { artifactIds: artifactResult.rows.map((row) => row.id), traceEntryCount: traceResult.rows.length };
      });
      increment('reqai_retention_deleted_total', {}, deleted.artifactIds.length);
      increment('reqai_trace_retention_deleted_total', {}, deleted.traceEntryCount);
      return deleted.artifactIds;
    } catch (error) {
      increment('reqai_retention_failures_total');
      throw error;
    }
  }
}
