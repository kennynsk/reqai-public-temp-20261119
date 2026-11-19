import { withTenantTransaction } from '../db/transaction.js';

export class EventRepository {
  constructor(pool, { schema = 'reqai' } = {}) { this.pool = pool; this.schema = `"${schema}"`; }
  async claimForKafka({ tenantId, limit }) { return withTenantTransaction(this.pool, tenantId, async (client) => { const result = await client.query(
    `WITH c AS (SELECT event_id FROM ${this.schema}.outbox_events WHERE tenant_id = $1 AND status IN ('PENDING','FAILED') AND available_at <= now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT $2)
     UPDATE ${this.schema}.outbox_events e SET status='PUBLISHING',attempts=attempts+1,updated_at=now() FROM c WHERE e.tenant_id = $1 AND e.event_id=c.event_id RETURNING e.*`, [tenantId, limit]); return result.rows; }); }
  async markPublished({ tenantId, eventIds }) { if (!eventIds.length) return; return withTenantTransaction(this.pool, tenantId, (client) => client.query(`UPDATE ${this.schema}.outbox_events SET status='PUBLISHED',published_at=now(),last_error_code=NULL,updated_at=now() WHERE tenant_id = $1 AND event_id=ANY($2::uuid[])`, [tenantId, eventIds])); }
  async markFailed({ tenantId, eventIds, reasonCode }) { if (!eventIds.length) return; return withTenantTransaction(this.pool, tenantId, (client) => client.query(`UPDATE ${this.schema}.outbox_events SET status='FAILED',available_at=now()+interval '5 seconds',last_error_code=$3,updated_at=now() WHERE tenant_id = $1 AND event_id=ANY($2::uuid[])`, [tenantId, eventIds, reasonCode])); }
  async listJobEvents({ tenantId, jobId, afterSequence = 0, limit = 100 }) { return withTenantTransaction(this.pool, tenantId, async (client) => { const result = await client.query(`SELECT event_id,event_type,schema_version,sequence,payload,created_at FROM ${this.schema}.outbox_events WHERE tenant_id = $1 AND aggregate_id=$2 AND sequence>$3 ORDER BY sequence LIMIT $4`, [tenantId, jobId, afterSequence, limit]); return result.rows; }); }
}
