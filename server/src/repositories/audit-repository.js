import { randomUUID } from 'node:crypto';

import { withTenantTransaction } from '../db/transaction.js';

export class AuditRepository {
  constructor(pool, { schema = 'reqai' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
  }

  async record({ tenantId, actorId, actorRoles = [], action, targetType, targetId, requestId, sourceSite, metadata = {} }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO ${this.schema}.audit_events (
           id, tenant_id, actor_id, actor_roles, action, target_type, target_id, request_id, source_site, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, occurred_at`,
        [randomUUID(), tenantId, actorId, actorRoles, action, targetType, targetId, requestId || null, sourceSite, metadata],
      );
      return result.rows[0];
    });
  }

  async list({ tenantId, limit = 100, before = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT id, tenant_id, actor_id, actor_roles, action, target_type, target_id, request_id,
                source_site, metadata, occurred_at
         FROM ${this.schema}.audit_events
         WHERE tenant_id = $1 AND ($2::timestamptz IS NULL OR occurred_at < $2)
         ORDER BY occurred_at DESC, id DESC
         LIMIT $3`,
        [tenantId, before, Math.min(Math.max(limit, 1), 500)],
      );
      return result.rows;
    });
  }
}
