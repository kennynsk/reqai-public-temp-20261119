import assert from 'node:assert/strict';
import test from 'node:test';

import { JobRepository } from '../src/repositories/job-repository.js';

function repositoryPool({ checkpointConflict = false, cancellationStatus = 'RUNNING' } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT status, version, sequence, progress')) return { rowCount: 1, rows: [{ status: 'RUNNING', version: 2, sequence: 4, progress: 20, current_step: 'prepare', message: 'Подготавливаем данные' }] };
      if (sql.includes('SELECT status, version')) return { rowCount: 1, rows: [{ status: 'RUNNING', version: 2 }] };
      if (sql.includes('SELECT * FROM "reqai".jobs') && sql.includes('FOR UPDATE')) {
        return { rowCount: 1, rows: [{ id: params[1], status: cancellationStatus, sequence: 1, version: 2 }] };
      }
      if (sql.includes("SET status = 'CANCEL_REQUESTED'")) return { rowCount: 1, rows: [{ id: params[1], status: 'CANCEL_REQUESTED', version: 3 }] };
      if (sql.includes('UPDATE "reqai".jobs') && sql.includes('GREATEST(progress')) return { rowCount: 1, rows: [{ id: params[1], status: 'RUNNING', progress: params[2], current_step: params[3], message: params[4], sequence: 5, version: 3 }] };
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
  assert.ok(pool.calls.some(({ sql }) => sql.includes('job.cancel-requested') && sql.includes("'PENDING'")));
  assert.ok(pool.calls.some(({ sql }) => sql.includes('audit_events')));
  assert.ok(pool.calls.some(({ sql }) => sql === 'COMMIT'));
});

test('repeated cancellation is idempotent and does not publish another event', async () => {
  const pool = repositoryPool({ cancellationStatus: 'CANCEL_REQUESTED' });
  const repository = new JobRepository(pool);
  const result = await repository.requestCancellation({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: '00000000-0000-4000-8000-000000000001',
    event: { id: '00000000-0000-4000-8000-000000000002', payload: { status: 'CANCEL_REQUESTED' } },
    audit: { id: '00000000-0000-4000-8000-000000000003', actorId: 'user-a', actorRoles: ['user'], requestId: 'req-1', sourceSite: 'dc-a' },
  });
  assert.equal(result.replayed, true);
  assert.equal(pool.calls.some(({ sql }) => sql.includes('job.cancel-requested')), false);
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

test('progress projection advances monotonically and publishes an ordered event', async () => {
  const pool = repositoryPool();
  const repository = new JobRepository(pool);
  const result = await repository.updateProgress({
    tenantId: 'tenant-a',
    jobId: '00000000-0000-4000-8000-000000000001',
    progress: 30,
    currentStep: 'model',
    message: 'AI анализирует требования',
  });
  assert.equal(result.replayed, false);
  assert.equal(result.job.progress, 30);
  const update = pool.calls.find(({ sql }) => sql.includes('GREATEST(progress'));
  assert.deepEqual(update.params.slice(2, 5), [30, 'model', 'AI анализирует требования']);
  const event = pool.calls.find(({ sql }) => sql.includes("'job.progress'"));
  assert.ok(event);
  assert.equal(event.params[3], 5);
  assert.equal(JSON.parse(event.params[4]).currentStep, 'model');
});

test('progress projection ignores an older milestone without publishing', async () => {
  const pool = repositoryPool();
  const repository = new JobRepository(pool);
  const result = await repository.updateProgress({
    tenantId: 'tenant-a',
    jobId: '00000000-0000-4000-8000-000000000001',
    progress: 10,
    currentStep: 'validate',
    message: 'Проверяем данные',
  });
  assert.equal(result.replayed, true);
  assert.equal(pool.calls.some(({ sql }) => sql.includes("'job.progress'")), false);
});
