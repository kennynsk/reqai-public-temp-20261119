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

  async workflowFinalRow(client, { tenantId, ownerUserId, workflowJobId }) {
    const result = await client.query(`SELECT v.* FROM ${this.schema}.requirements_versions v
      JOIN ${this.schema}.jobs j ON j.tenant_id=v.tenant_id AND j.id=v.source_job_id
      WHERE v.tenant_id=$1 AND ($2::text IS NULL OR (v.owner_user_id=$2 AND j.owner_user_id=$2))
        AND ((j.id=$3 AND j.type='DECOMPOSITION' AND v.decisions->>'skippedResearch'='true')
          OR (j.parent_job_id=$3 AND j.type='RESEARCH' AND j.configuration_snapshot->>'featureMode'='REQUIREMENTS_INSIGHTS' AND v.research_job_id=j.id))
      ORDER BY v.created_at DESC, v.id DESC LIMIT 1`, [tenantId, ownerUserId, workflowJobId]);
    return result.rows[0] || null;
  }

  async findWorkflowFinal(scope) {
    return withTenantTransaction(this.pool, scope.tenantId, (client) => this.workflowFinalRow(client, scope));
  }

  async create({ tenantId, ownerUserId, id, sourceJobId, baseVersionId = null, researchJobId = null, decisions = {}, event = null, expectedLatestVersionId, clientMutationId = null, mutationHash = null, workflowJobId = null, workflowOwnerId = null }) {
    return withTenantTransaction(this.pool, tenantId, async (client) => {
      await client.query(`SELECT id FROM ${this.schema}.jobs WHERE tenant_id=$1 AND id=$2 FOR UPDATE`, [tenantId, workflowJobId || sourceJobId]);
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
      const publishFinal = workflowJobId && (researchJobId || decisions.skippedResearch === true);
      if (publishFinal) {
        const current = await this.workflowFinalRow(client, { tenantId, ownerUserId: workflowOwnerId, workflowJobId });
        if (current && current.id !== baseVersionId) throw new ApiError({ status: 409, code: 'WORKFLOW_FINAL_CONFLICT', message: 'A newer final version is already available for this task.' });
      }
      const result = await client.query(
        `INSERT INTO ${this.schema}.requirements_versions(
           id, tenant_id, owner_user_id, source_job_id, base_version_id, research_job_id, decisions, client_mutation_id, mutation_hash, created_at
         ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,clock_timestamp()) RETURNING *`,
        [id, tenantId, ownerUserId, sourceJobId, baseVersionId, researchJobId, JSON.stringify(decisions), clientMutationId, mutationHash],
      );
      if (event) for (const jobId of new Set([sourceJobId, ...(publishFinal ? [workflowJobId] : [])])) {
        const job = await client.query(`UPDATE ${this.schema}.jobs
          SET sequence=sequence+1, version=version+1, updated_at=now()
          WHERE tenant_id=$1 AND id=$2 RETURNING sequence`, [tenantId, jobId]);
        await client.query(`INSERT INTO ${this.schema}.outbox_events(
          event_id, tenant_id, aggregate_type, aggregate_id, sequence, event_type, schema_version, payload
          ) VALUES($1,$2,'job',$3,$4,$5,'1.0',$6::jsonb)`,
        [randomUUID(), tenantId, jobId, job.rows[0].sequence, event.type, JSON.stringify({ ...event.payload, jobId })]);
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
