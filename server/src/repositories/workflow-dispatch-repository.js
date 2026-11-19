import { withTenantTransaction } from '../db/transaction.js';

export class WorkflowDispatchRepository {
  constructor(pool, { schema = 'reqai' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
  }

  async requeueStalled({ tenantId, staleBefore }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `UPDATE ${this.schema}.outbox_events
         SET workflow_dispatch_status = 'FAILED', workflow_available_at = now(), workflow_last_error_code = 'DISPATCH_LEASE_EXPIRED'
         WHERE tenant_id = $1 AND workflow_dispatch_status = 'DISPATCHING' AND updated_at < $2`,
        [tenantId, staleBefore],
      );
      return result.rowCount;
    });
  }

  async claim({ tenantId, limit }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `WITH candidates AS (
           SELECT event_id FROM ${this.schema}.outbox_events
           WHERE tenant_id = $1 AND event_type IN ('job.accepted', 'job.cancel-requested')
             AND workflow_dispatch_status IN ('PENDING', 'FAILED') AND workflow_available_at <= now()
           ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $2
         )
         UPDATE ${this.schema}.outbox_events e
         SET workflow_dispatch_status = 'DISPATCHING', workflow_attempts = workflow_attempts + 1, updated_at = now()
         FROM candidates c
         WHERE e.tenant_id = $1 AND e.event_id = c.event_id
         RETURNING e.event_id, e.aggregate_id AS job_id, e.event_type, e.payload, e.workflow_attempts`,
        [tenantId, limit],
      );
      if (!result.rows.length) return [];
      const jobs = await client.query(
        `SELECT id, type, owner_user_id, input_artifact_id, configuration_snapshot, deadline_at
         FROM ${this.schema}.jobs WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [tenantId, result.rows.map((row) => row.job_id)],
      );
      const byId = new Map(jobs.rows.map((job) => [job.id, job]));
      return result.rows.map((event) => ({ ...event, job: byId.get(event.job_id) }));
    });
  }

  async markStarted({ tenantId, eventId, jobId, executionSite }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await client.query(
        `UPDATE ${this.schema}.outbox_events
         SET workflow_dispatch_status = 'STARTED', workflow_started_at = now(), workflow_last_error_code = NULL, updated_at = now()
         WHERE tenant_id = $1 AND event_id = $2 AND aggregate_id = $3`,
        [tenantId, eventId, jobId],
      );
      return client.query(
        `UPDATE ${this.schema}.jobs SET status = 'QUEUED', execution_site = $3, updated_at = now(), version = version + 1
         WHERE tenant_id = $1 AND id = $2 AND status = 'ACCEPTED' RETURNING *`,
        [tenantId, jobId, executionSite],
      );
    });
  }

  async markCancellationDispatched({ tenantId, eventId, jobId }) {
    return withTenantTransaction(this.pool, tenantId, (client) => client.query(
      `UPDATE ${this.schema}.outbox_events
       SET workflow_dispatch_status = 'STARTED', workflow_started_at = now(), workflow_last_error_code = NULL, updated_at = now()
       WHERE tenant_id = $1 AND event_id = $2 AND aggregate_id = $3`,
      [tenantId, eventId, jobId],
    ));
  }

  async markFailed({ tenantId, eventId, reasonCode, retryAt }) {
    return withTenantTransaction(this.pool, tenantId, (client) => client.query(
      `UPDATE ${this.schema}.outbox_events
       SET workflow_dispatch_status = 'FAILED', workflow_available_at = $3, workflow_last_error_code = $4, updated_at = now()
       WHERE tenant_id = $1 AND event_id = $2`,
      [tenantId, eventId, retryAt, reasonCode],
    ));
  }
}
