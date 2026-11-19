import { randomUUID } from 'node:crypto';

import { withTenantTransaction } from '../db/transaction.js';

export class ModelCoordinationRepository {
  constructor(pool, { schema = 'reqai', siteId, failureThreshold, windowMs, openMs } = {}) {
    this.pool = pool; this.schema = `"${schema}"`; this.siteId = siteId;
    this.failureThreshold = failureThreshold; this.windowMs = windowMs; this.openMs = openMs;
  }

  async acquire({ tenantId, model, limit, leaseMs }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2, 0)) FROM (VALUES ($1::text)) AS t(tenant_id) WHERE tenant_id = $1`, [tenantId, model]);
      await client.query(`DELETE FROM ${this.schema}.model_leases WHERE tenant_id = $1 AND model = $2 AND expires_at <= now()`, [tenantId, model]);
      const circuit = await client.query(`SELECT * FROM ${this.schema}.model_circuit_state WHERE tenant_id = $1 AND model = $2 FOR UPDATE`, [tenantId, model]);
      const state = circuit.rows[0];
      if (state?.state === 'OPEN' && Date.now() - new Date(state.opened_at).getTime() < this.openMs) return null;
      if (state?.state === 'OPEN') {
        await client.query(`UPDATE ${this.schema}.model_circuit_state SET state='HALF_OPEN', half_open_claimed=true, updated_at=now() WHERE tenant_id=$1 AND model=$2`, [tenantId, model]);
      } else if (state?.state === 'HALF_OPEN' && state.half_open_claimed) return null;
      const count = await client.query(`SELECT count(*)::integer AS count FROM ${this.schema}.model_leases WHERE tenant_id = $1 AND model = $2 AND expires_at > now()`, [tenantId, model]);
      if (count.rows[0].count >= limit) return null;
      const id = randomUUID();
      await client.query(`INSERT INTO ${this.schema}.model_leases(id, tenant_id, model, holder_site, expires_at) VALUES ($1,$2,$3,$4,now()+($5::integer * interval '1 millisecond'))`, [id, tenantId, model, this.siteId, leaseMs]);
      return { id };
    });
  }

  async success({ tenantId, model, leaseId }) {
    return this.#finish(tenantId, model, leaseId, true);
  }
  async release({ tenantId, model, leaseId }) {
    return withTenantTransaction(this.pool, tenantId, (client) => client.query(
      `DELETE FROM ${this.schema}.model_leases WHERE tenant_id=$1 AND model=$2 AND id=$3`,
      [tenantId, model, leaseId],
    ));
  }
  async failure({ tenantId, model, leaseId, reasonCode }) {
    return this.#finish(tenantId, model, leaseId, false, reasonCode);
  }
  async #finish(tenantId, model, leaseId, success, reasonCode) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await client.query(`DELETE FROM ${this.schema}.model_leases WHERE tenant_id=$1 AND model=$2 AND id=$3`, [tenantId, model, leaseId]);
      if (success) return client.query(`INSERT INTO ${this.schema}.model_circuit_state(tenant_id,model) VALUES($1,$2) ON CONFLICT(tenant_id,model) DO UPDATE SET state='CLOSED',failure_count=0,half_open_claimed=false,updated_at=now()`, [tenantId, model]);
      return client.query(
        `INSERT INTO ${this.schema}.model_circuit_state(tenant_id,model,failure_count) VALUES($1,$2,1)
         ON CONFLICT(tenant_id,model) DO UPDATE SET
           failure_count=CASE WHEN ${this.schema}.model_circuit_state.window_started_at < now()-($3::integer*interval '1 millisecond') THEN 1 ELSE ${this.schema}.model_circuit_state.failure_count+1 END,
           window_started_at=CASE WHEN ${this.schema}.model_circuit_state.window_started_at < now()-($3::integer*interval '1 millisecond') THEN now() ELSE ${this.schema}.model_circuit_state.window_started_at END,
           state=CASE WHEN ${this.schema}.model_circuit_state.failure_count+1 >= $4 THEN 'OPEN' ELSE ${this.schema}.model_circuit_state.state END,
           opened_at=CASE WHEN ${this.schema}.model_circuit_state.failure_count+1 >= $4 THEN now() ELSE ${this.schema}.model_circuit_state.opened_at END,
           half_open_claimed=false,updated_at=now()`,
        [tenantId, model, this.windowMs, this.failureThreshold],
      );
    });
  }
}
