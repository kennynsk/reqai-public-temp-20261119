import assert from 'node:assert/strict';
import test from 'node:test';

import { JobTraceRepository } from '../src/repositories/job-trace-repository.js';

function poolWith(handler) {
  const calls = [];
  const client = { async query(sql, params) { calls.push({ sql, params }); return handler(sql, params); }, release() {} };
  return { calls, connect: async () => client };
}

test('trace append allocates a per-job sequence inside a tenant transaction', async () => {
  const row = { id: 'entry-1', job_id: 'job-1', sequence: 2 };
  const pool = poolWith((sql) => sql.includes('INSERT INTO "reqai".job_trace_entries') ? { rows: [row], rowCount: 1 } : { rows: [{ id: 'job-1' }], rowCount: 1 });
  const repository = new JobTraceRepository(pool);
  assert.equal((await repository.append({ tenantId: 'tenant-a', jobId: 'job-1', category: 'WORKFLOW', name: 'Validate' })).sequence, 2);
  const insert = pool.calls.find(({ sql }) => sql.includes('INSERT INTO "reqai".job_trace_entries'));
  assert.match(insert.sql, /COALESCE\(max\(sequence\),0\)\+1/);
  assert.equal(insert.params[1], 'tenant-a');
  assert.equal(insert.params[2], 'job-1');
  assert.ok(pool.calls.some(({ sql }) => sql === 'COMMIT'));
});

test('trace snapshot scopes every source by tenant and job and tolerates empty legacy data', async () => {
  const pool = poolWith((sql) => sql.includes('SELECT * FROM "reqai".jobs')
    ? { rows: [{ id: 'job-1', owner_user_id: 'user-a' }], rowCount: 1 }
    : { rows: [], rowCount: 0 });
  const value = await new JobTraceRepository(pool).snapshot({ tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-1' });
  assert.equal(value.job.id, 'job-1');
  assert.deepEqual(value.entries, []);
  assert.deepEqual(value.artifacts, []);
  for (const { sql, params } of pool.calls.filter(({ sql }) => /job_steps|job_attempts|outbox_events|requirements_versions|job_trace_entries|artifacts/.test(sql))) {
    assert.match(sql, /tenant_id=\$1|tenant_id = \$1/);
    assert.equal(params[0], 'tenant-a');
    assert.equal(params[1], 'job-1');
  }
});
