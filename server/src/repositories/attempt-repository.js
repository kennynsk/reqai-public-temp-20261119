import { withTenantTransaction } from '../db/transaction.js';

export class AttemptRepository {
  constructor(pool, { schema = 'reqai' } = {}) { this.pool = pool; this.schema = `"${schema}"`; }
  async start({ id, tenantId, jobId, stepId, attempt, requestedModel, actualModel, executionSite }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
      `INSERT INTO ${this.schema}.job_attempts(id,job_id,step_id,tenant_id,attempt,requested_model,actual_model,status,execution_site)
       VALUES($1,$2,$3,$4,$5,$6,$7,'RUNNING',$8)
       ON CONFLICT(job_id,step_id,actual_model,attempt) DO UPDATE SET
         status='RUNNING', reason_code=NULL, completed_at=NULL, execution_site=EXCLUDED.execution_site
       RETURNING id`,
      [id, jobId, stepId, tenantId, attempt, requestedModel, actualModel, executionSite],
      );
      return result.rows[0] || { id };
    });
  }
  async finish({ id, tenantId, status, reasonCode = null, providerRequestId = null, usage = {}, durationMs }) {
    return withTenantTransaction(this.pool, tenantId, (client) => client.query(
      `UPDATE ${this.schema}.job_attempts SET status=$3,reason_code=$4,provider_request_id=$5,input_tokens=$6,output_tokens=$7,duration_ms=$8,completed_at=now()
       WHERE tenant_id=$1 AND id=$2`,
      [tenantId, id, status, reasonCode, providerRequestId, usage.inputTokens ?? null, usage.outputTokens ?? null, durationMs],
    ));
  }
}
