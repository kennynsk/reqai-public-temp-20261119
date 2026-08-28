import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { withTenantTransaction } from '../src/db/transaction.js';
import { RequirementsVersionRepository } from '../src/repositories/requirements-version-repository.js';

// Explicitly opt in to the isolated UX database; never use DATABASE_URL here.
test('PostgreSQL serializes competing saves and replays a mutation once', { skip: process.env.REQAI_UX_POSTGRES_TEST !== '1' }, async () => {
  const pool = new pg.Pool({ connectionString: 'postgresql://reqai:reqai-local@127.0.0.1:55432/reqai', max: 5 });
  const tenantId = `ux-test-${randomUUID()}`;
  const sourceJobId = randomUUID();
  const ids = Array.from({ length: 4 }, () => randomUUID());
  const repository = new RequirementsVersionRepository(pool);
  try {
    await withTenantTransaction(pool, tenantId, async (client) => {
      for (const id of ids) await client.query(`INSERT INTO reqai.artifacts(id,tenant_id,owner_user_id,kind,size_bytes,sha256,storage_status) VALUES($1,$2,'ux-test','RESULT',0,$3,'AVAILABLE')`, [id, tenantId, '0'.repeat(64)]);
      await client.query(`INSERT INTO reqai.jobs(id,tenant_id,owner_user_id,type,status,outcome,input_artifact_id,configuration_snapshot,created_site,deadline_at)
        VALUES($1,$2,'ux-test','DECOMPOSITION','SUCCEEDED','COMPLETE',$3,'{}','ux-test',now()+interval '1 hour')`, [sourceJobId, tenantId, ids[0]]);
    });
    const request = (id, clientMutationId) => ({ tenantId, ownerUserId: 'ux-test', sourceJobId, id, expectedLatestVersionId: null, clientMutationId, mutationHash: 'same-content', event: { type: 'requirements.version-created', payload: { jobId: sourceJobId, versionId: id } } });
    const same = await Promise.all([repository.create(request(ids[1], 'same-mutation')), repository.create(request(ids[2], 'same-mutation'))]);
    assert.equal(same[0].id, same[1].id);
    await assert.rejects(repository.create({ ...request(ids[3], 'same-mutation'), mutationHash: 'changed' }), { code: 'VERSION_MUTATION_CONFLICT' });
    await assert.rejects(repository.create(request(ids[3], 'different-mutation')), { code: 'REQUIREMENTS_VERSION_CONFLICT' });
    const next = await repository.create({ ...request(ids[3], 'next-mutation'), expectedLatestVersionId: same[0].id, baseVersionId: same[0].id });
    assert.equal(next.base_version_id, same[0].id);
    await withTenantTransaction(pool, tenantId, async (client) => {
      const versions = await client.query('SELECT count(*)::int AS count FROM reqai.requirements_versions WHERE tenant_id=$1', [tenantId]);
      const events = await client.query('SELECT count(*)::int AS count FROM reqai.outbox_events WHERE tenant_id=$1', [tenantId]);
      assert.equal(versions.rows[0].count, 2);
      assert.equal(events.rows[0].count, 2);
    });
  } finally { await pool.end(); }
});
