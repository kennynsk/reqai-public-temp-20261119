import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { withTenantTransaction } from '../src/db/transaction.js';
import { JobRepository } from '../src/repositories/job-repository.js';

// Opt-in, synthetic records retained; never connect to DATABASE_URL.
test('workflow metadata: scoped search, old pages, orphan children, concurrent rename and resumable backfill', { skip: process.env.REQAI_UX_POSTGRES_TEST !== '1' }, async () => {
  const pool = new pg.Pool({ connectionString: 'postgresql://reqai:reqai-local@127.0.0.1:55432/reqai', max: 5 });
  const tenantId = `ux-metadata-${randomUUID()}`;
  const root = randomUUID(), child = randomUUID(), hidden = randomUUID(), orphan = randomUUID();
  const repository = new JobRepository(pool);
  const scope = { tenantId, ownerUserId: 'alice' };
  try {
    await withTenantTransaction(pool, tenantId, async (client) => {
      const artifact = randomUUID();
      await client.query(`INSERT INTO reqai.artifacts(id,tenant_id,owner_user_id,kind,content_type,size_bytes,sha256,storage_status) VALUES($1,$2,'alice','INPUT','text/plain',100,$3,'AVAILABLE')`, [artifact, tenantId, '0'.repeat(64)]);
      await client.query('INSERT INTO reqai_artifacts.artifact_content(artifact_id,tenant_id,chunk_index,content) VALUES($1,$2,0,$3)', [artifact, tenantId, Buffer.from('Переговорные: повторное открытие комнаты')]);
      const add = async (id, owner, parent, type, date, title) => client.query(`INSERT INTO reqai.jobs(id,tenant_id,owner_user_id,parent_job_id,type,status,outcome,input_artifact_id,configuration_snapshot,created_site,deadline_at,created_at,title)
        VALUES($1,$2,$3,$4,$5,'SUCCEEDED','COMPLETE',$6,'{}','ux-test',now()+interval '1 hour',$7,$8)`, [id, tenantId, owner, parent, type, artifact, date, title]);
      await add(root, 'alice', null, 'DECOMPOSITION', '2026-01-01', null);
      await add(child, 'alice', root, 'RESEARCH', '2026-01-02', 'Тренды комнат');
      await add(hidden, 'bob', null, 'DECOMPOSITION', '2026-01-03', 'Секрет Боба');
      await add(orphan, 'alice', hidden, 'RESEARCH', '2026-01-04', 'Самостоятельное исследование');
      for (let n = 0; n < 25; n++) await add(randomUUID(), 'alice', null, 'DECOMPOSITION', '2026-02-01', `Новая задача ${n}`);
    });
    const first = await repository.listWorkflows({ ...scope, limit: 20 });
    assert.equal(first.rows.length, 21);
    assert.equal(first.indexingPending, true);
    assert.ok(!first.rows.some((row) => row.id === root || row.id === hidden));
    const initialRename = await repository.updateWorkflowMetadata({ ...scope, jobId: root, title: 'Переговорные — согласованное название', expectedRevision: 0, actorId: 'alice' });
    assert.equal(initialRename.metadata_revision, 1);
    let count = 0;
    while (await repository.backfillMetadata({ tenantId, limit: 4 })) count++;
    assert.ok(count > 1);
    assert.equal(await repository.backfillMetadata({ tenantId, limit: 4 }), 0);
    const search = await repository.listWorkflows({ ...scope, q: 'повторное открытие', type: 'RESEARCH', limit: 100 });
    assert.equal(search.indexingPending, false);
    assert.deepEqual(new Set(search.rows.map((row) => row.id)), new Set([root, orphan]));
    assert.equal(search.rows.find((row) => row.id === root).title, initialRename.title);
    assert.equal(search.rows.find((row) => row.id === root).children[0].id, child);
    assert.equal(search.rows.find((row) => row.id === orphan).children.length, 0);
    assert.equal((await repository.listWorkflows({ ...scope, q: 'Секрет Боба' })).rows.length, 0);
    assert.equal(await repository.workflowMetadata({ ...scope, jobId: hidden }), null);
    assert.equal(await repository.updateWorkflowMetadata({ ...scope, jobId: hidden, title: 'Нельзя', expectedRevision: 0, actorId: 'alice' }), null);
    assert.equal((await repository.workflowMetadata({ ...scope, jobId: orphan })).id, orphan);
    assert.equal((await repository.workflowMetadata({ ...scope, jobId: child })).id, root);
    const race = await Promise.allSettled(['Первое', 'Второе'].map((title) => repository.updateWorkflowMetadata({ ...scope, jobId: child, title, expectedRevision: 1, actorId: 'alice' })));
    assert.equal(race.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(race.find((item) => item.status === 'rejected').reason.code, 'METADATA_CONFLICT');
    const wrongTenant = { ...scope, tenantId: `other-${randomUUID()}` };
    assert.equal(await repository.workflowMetadata({ ...wrongTenant, jobId: root }), null);
    assert.equal((await repository.listWorkflows(wrongTenant)).rows.length, 0);
    await withTenantTransaction(pool, tenantId, async (client) => {
      const events = await client.query("SELECT aggregate_id,payload FROM reqai.outbox_events WHERE tenant_id=$1 AND event_type='job.metadata-updated'", [tenantId]);
      assert.equal(events.rows.length, 4);
      assert.deepEqual(new Set(events.rows.map((row) => row.aggregate_id)), new Set([root, child]));
      assert.ok(events.rows.every((row) => row.payload.actorUserId === 'alice'));
    });
  } finally { await pool.end(); }
});
