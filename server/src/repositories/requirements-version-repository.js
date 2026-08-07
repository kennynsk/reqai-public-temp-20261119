import { withTenantTransaction } from '../db/transaction.js';

export class RequirementsVersionRepository {
  constructor(pool, { schema = 'reqai' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
  }

  async create({ tenantId, ownerUserId, id, sourceJobId, baseVersionId = null, researchJobId = null, decisions = {} }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `INSERT INTO ${this.schema}.requirements_versions(
           id, tenant_id, owner_user_id, source_job_id, base_version_id, research_job_id, decisions
         ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
        [id, tenantId, ownerUserId, sourceJobId, baseVersionId, researchJobId, JSON.stringify(decisions)],
      );
      return result.rows[0];
    });
  }

  async findVisibleById({ tenantId, ownerUserId = null, id }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM ${this.schema}.requirements_versions
         WHERE tenant_id=$1 AND id=$2 AND ($3::text IS NULL OR owner_user_id=$3)`,
        [tenantId, id, ownerUserId],
      );
      return result.rows[0] || null;
    });
  }

  async listVisibleByJob({ tenantId, ownerUserId = null, jobId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(
        `SELECT * FROM ${this.schema}.requirements_versions
         WHERE tenant_id=$1
           AND ($2::text IS NULL OR owner_user_id=$2)
           AND (source_job_id=$3 OR research_job_id=$3)
         ORDER BY created_at DESC, id DESC`,
        [tenantId, ownerUserId, jobId],
      );
      return result.rows;
    });
  }
}
