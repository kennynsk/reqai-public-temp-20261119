import assert from 'node:assert/strict';
import test from 'node:test';

import { shutdownGraceMs, startRuntime } from '../src/runtime/index.js';

function config(role) {
  return {
    process: {
      role,
      siteId: 'test',
      apiShutdownGraceMs: 30_000,
      workerShutdownGraceMs: 600_000,
    },
  };
}

test('runtime selects API and worker entrypoints by role', async () => {
  const calls = [];
  const api = await startRuntime(config('api'), {
    apiRunner: async () => {
      calls.push('api');
      return { role: 'api' };
    },
  });
  const worker = await startRuntime(config('workflow-worker'), {
    workerRunner: async (value) => {
      calls.push(value.process.role);
      return { role: value.process.role };
    },
  });
  assert.equal(api.role, 'api');
  assert.equal(worker.role, 'workflow-worker');
  assert.deepEqual(calls, ['api', 'workflow-worker']);
});

test('runtime uses role-specific shutdown grace', () => {
  assert.equal(shutdownGraceMs(config('api')), 30_000);
  assert.equal(shutdownGraceMs(config('event-worker')), 600_000);
});
