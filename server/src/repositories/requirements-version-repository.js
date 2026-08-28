import { randomUUID } from 'node:crypto';

import { withTenantTransaction } from '../db/transaction.js';
import { ApiError } from '../errors/api-error.js';

export class RequirementsVersionRepository {
  constructor(pool, { schema = 'reqai' } = {}) {
    this.pool = pool;
    this.schema = `"${schema}"`;
  }

  async findMutation({ tenantId, ownerUserId, sourceJobId, clientMutationId }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      const result = await client.query(`SELECT * FROM ${this.schema}.requirements_versions
        WHERE tenant_id=$1 AND owner_user_id=$2 AND source_job_id=$3 AND client_mutation_id=$4`,
      [tenantId, ownerUserId, sourceJobId, clientMutationId]);
      return result.rows[0] || null;
    });
  }

  async create({ tenantId, ownerUserId, id, sourceJobId, baseVersionId = null, researchJobId = null, decisions = {}, event = null, expectedLatestVersionId, clientMutationId = null, mutationHash = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      // All writers lock the same job, including legacy clients without preconditions.
      await client.query(`SELECT id FROM ${this.schema}.jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, sourceJobId]);
      if (clientMutationId) {
        const previous = await client.query(`SELECT * FROM ${this.schema}.requirements_versions
          WHERE tenant_id=$1 AND owner_user_id=$2 AND source_job_id=$3 AND client_mutation_id=$4`,
        [tenantId, ownerUserId, sourceJobId, clientMutationId]);
        if (previous.rows[0]) {
          if (previous.rows[0].mutation_hash !== mutationHash) throw new ApiError({ status: 409, code: 'VERSION_MUTATION_CONFLICT', message: 'Save identity was already used for different content' });
          return previous.rows[0];
        }
      }
      if (expectedLatestVersionId !== undefined) {
        const latest = await client.query(`SELECT id FROM ${this.schema}.requirements_versions
          WHERE tenant_id=$1 AND source_job_id=$2 ORDER BY created_at DESC, id DESC LIMIT 1`, [tenantId, sourceJobId]);
        if ((latest.rows[0]?.id || null) !== expectedLatestVersionId) throw new ApiError({ status: 409, code: 'REQUIREMENTS_VERSION_CONFLICT', message: 'A newer requirements version exists. Compare it before saving.' });
      }
      const result = await client.query(
        `INSERT INTO ${this.schema}.requirements_versions(
           id, tenant_id, owner_user_id, source_job_id, base_version_id, research_job_id, decisions, client_mutation_id, mutation_hash, created_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,clock_timestamp()) RETURNING *`,
        [id, tenantId, ownerUserId, sourceJobId, baseVersionId, researchJobId, JSON.stringify(decisions), clientMutationId, mutationHash],
      );
      if (event) {
        const job = await client.query(
          `UPDATE ${this.schema}.jobs
           SET sequence=sequence+1, version=version+1, updated_at=now()
           WHERE tenant_id=$1 AND id=$2 RETURNING sequence`,
          [tenantId, sourceJobId],
        );
        await client.query(
          `INSERT INTO ${this.schema}.outbox_events(
             event_id, tenant_id, aggregate_type, aggregate_id, sequence, event_type, schema_version, payload
           ) VALUES($1,$2,'job',$3,$4,$5,'1.0',$6::jsonb)`,
          [randomUUID(), tenantId, sourceJobId, job.rows[0].sequence, event.type, JSON.stringify(event.payload)],
        );
      }
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
