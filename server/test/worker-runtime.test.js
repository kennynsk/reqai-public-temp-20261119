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
