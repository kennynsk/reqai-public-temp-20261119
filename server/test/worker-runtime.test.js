import assert from 'node:assert/strict';
import test from 'node:test';

import { startWorkerRuntime } from '../src/runtime/worker-runtime.js';

test('workflow worker uses configured namespace, queue, identity and closes cleanly', async () => {
  const calls = [];
  const connection = { async close() { calls.push('connection.close'); } };
  const worker = {
    async run() { calls.push('worker.run'); },
    shutdown() { calls.push('worker.shutdown'); },
  };
  const config = {
    process: { role: 'workflow-worker', siteId: 'dc-a', workerShutdownGraceMs: 600_000 },
    temporal: {
      address: 'temporal:7233', namespace: 'reqai', identity: 'worker-1', buildId: 'reqai-v1',
      workerTaskQueue: 'requirements-research', maxConcurrentActivities: 10,
      tls: { enabled: false },
    },
  };
  const runtime = await startWorkerRuntime(config, {
    activitiesFactory: () => ({ validateInput() {} }),
    ConnectionClass: { async connect(options) { calls.push(['connect', options]); return connection; } },
    WorkerClass: { async create(options) { calls.push(['create', options]); return worker; } },
  });
  await runtime.stop();
  const workerOptions = calls.find((call) => Array.isArray(call) && call[0] === 'create')[1];
  assert.equal(workerOptions.namespace, 'reqai');
  assert.equal(workerOptions.taskQueue, 'requirements-research');
  assert.equal(workerOptions.identity, 'worker-1');
  assert.equal(workerOptions.buildId, 'reqai-v1');
  assert.equal(typeof workerOptions.activities.validateInput, 'function');
  assert.deepEqual(calls.slice(-2), ['worker.shutdown', 'connection.close']);
});

test('maintenance worker backfills job metadata on its own cadence', async () => {
  const calls = [];
  const timers = [];
  const health = {
    beginDrain() { calls.push('health.beginDrain'); },
    async close() { calls.push('health.close'); },
  };
  const pool = { async end() { calls.push('pool.end'); } };
  class FakeRetentionRepository {
    async cleanup(options) {
      calls.push(['retention.cleanup', options]);
      return ['deleted-job'];
    }
  }
  class FakeJobRepository {
    async backfillMetadata(options) {
      calls.push(['job.metadata.backfill', options]);
      return 2;
    }
  }
  const config = {
    process: { role: 'maintenance-worker', siteId: 'dc-a' },
    database: { schema: 'reqai', artifactSchema: 'reqai_artifacts' },
    tenancy: { defaultTenantId: 'tenant-a' },
    retention: { cleanupBatchSize: 500, intervalMs: 3600000 },
    jobMetadataBackfill: { batchSize: 25, intervalMs: 60000 },
  };
  const runtime = await startWorkerRuntime(config, {
    healthServerFactory: async () => health,
    databasePoolFactory: () => pool,
    RetentionRepositoryClass: FakeRetentionRepository,
    JobRepositoryClass: FakeJobRepository,
    setIntervalFn: (callback, intervalMs) => {
      const timer = { callback, intervalMs };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn: (timer) => calls.push(['clearInterval', timer.intervalMs]),
  });

  await runtime.stop();

  const backfill = calls.find(([name]) => name === 'job.metadata.backfill');
  const retention = calls.find(([name]) => name === 'retention.cleanup');
  assert.deepEqual(backfill[1], { tenantId: 'tenant-a', limit: 25 });
  assert.deepEqual(retention[1], { tenantId: 'tenant-a', batchSize: 500, siteId: 'dc-a' });
  assert.deepEqual(timers.map(({ intervalMs }) => intervalMs), [60000, 3600000]);
  assert.deepEqual(calls.filter(([name]) => name === 'clearInterval'), [
    ['clearInterval', 60000],
    ['clearInterval', 3600000],
  ]);
  assert.equal(calls.at(-2), 'health.close');
  assert.equal(calls.at(-1), 'pool.end');
});
