import assert from 'node:assert/strict';
import test from 'node:test';

import { JobRepository } from '../src/repositories/job-repository.js';

function repositoryPool({ checkpointConflict = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT status, version')) return { rowCount: 1, rows: [{ status: 'RUNNING', version: 2 }] };
      if (sql.includes('SELECT * FROM "reqai".jobs') && sql.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ id: params[1], status: 'RUNNING', sequence: 1, version: 2 }] };
      }
      if (sql.includes("SET status = 'CANCEL_REQUESTED'")) return { rowCount: 1, rows: [{ id: params[1], status: 'CANCEL_REQUESTED', version: 3 }] };
      if (sql.includes('UPDATE "reqai".jobs')) return { rowCount: 1, rows: [{ id: params[1], status: params[2], version: 3 }] };
      if (sql.includes('INSERT INTO "reqai".job_steps')) {
        return checkpointConflict ? { rowCount: 0, rows: [] } : { rowCount: 1, rows: [{ step_id: params[2] }] };
      }
      return { rowCount: 0, rows: [] };
    },
    release() {},
  };
  return { calls, connect: async () => client };
}

test('job repository performs guarded transition in a tenant transaction', async () => {
  const pool = repositoryPool();
  const repository = new JobRepository(pool);
  const result = await repository.transition({
    tenantId: 'tenant-a',
    jobId: '00000000-0000-0000-0000-000000000001',
    toStatus: 'SUCCEEDED',
    outcome: 'COMPLETE',
    patch: { progress: 100, completedSite: 'dc-b' },
  });
  assert.equal(result.status, 'SUCCEEDED');
  assert.ok(pool.calls.some((call) => call.sql.includes('FOR UPDATE')));
  assert.ok(pool.calls.some((call) => call.sql.includes('version = $12')));
});

test('cancellation request updates state and writes outbox and audit atomically', async () => {
  const pool = repositoryPool();
  const repository = new JobRepository(pool);
  const result = await repository.requestCancellation({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: '00000000-0000-4000-8000-000000000001',
    event: { id: '00000000-0000-4000-8000-000000000002', payload: { status: 'CANCEL_REQUESTED' } },
    audit: { id: '00000000-0000-4000-8000-000000000003', actorId: 'user-a', actorRoles: ['user'], requestId: 'req-1', sourceSite: 'dc-a' },
  });
  assert.equal(result.job.status, 'CANCEL_REQUESTED');
  assert.ok(pool.calls.some(({ sql }) => sql.includes('job.cancel-requested')));
  assert.ok(pool.calls.some(({ sql }) => sql.includes('audit_events')));
  assert.ok(pool.calls.some(({ sql }) => sql === 'COMMIT'));
});

test('checkpoint rejects a repeated step with a different input hash', async () => {
  const repository = new JobRepository(repositoryPool({ checkpointConflict: true }));
  await assert.rejects(
    () => repository.saveCheckpoint({
      tenantId: 'tenant-a',
      jobId: '00000000-0000-0000-0000-000000000001',
      stepId: 'analyze',
      stepType: 'LLM',
      inputHash: 'hash-a',
      status: 'SUCCEEDED',
    }),
    (error) => error.code === 'CHECKPOINT_INPUT_CONFLICT',
  );
});
