import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelExecutor, validateModelPolicy } from '../src/services/model-executor.js';

const policy = Object.freeze({
  models: ['GC-Max', 'GC-M', 'GC-Lite'], maxAttemptsPerModel: 2, requestTimeoutMs: 1000,
  retryInitialDelayMs: 10, retryMaxDelayMs: 100, maxConcurrency: { 'GC-Max': 1, 'GC-M': 1, 'GC-Lite': 1 },
});

function harness(outcomes) {
  const calls = []; let index = 0; let now = 0;
  const executor = createModelExecutor({
    clock: () => new Date(now), sleep: async (ms) => { now += ms; }, uuid: () => `attempt-${index}`,
    coordination: {
      async acquire(input) { calls.push(['acquire', input.model]); return { id: `lease-${input.model}` }; },
      async success(input) { calls.push(['success', input.model]); },
      async failure(input) { calls.push(['failure', input.model, input.reasonCode]); },
    },
    attempts: { async start() {}, async finish(input) { calls.push(['attempt', input.status, input.reasonCode]); } },
    provider: { async complete({ model }) { const outcome = outcomes[index++]; if (outcome instanceof Error) throw outcome; return { text: 'ok', model, requestId: 'p1', usage: {} }; } },
  });
  return { calls, executor };
}

test('model policy is immutable and bounded to three models/two attempts', () => {
  const snapshot = validateModelPolicy(policy);
  assert.equal(Object.isFrozen(snapshot.models), true);
  assert.throws(() => validateModelPolicy({ models: ['a','b','c','d'], maxAttemptsPerModel: 2 }));
  assert.throws(() => validateModelPolicy({ models: ['a'], maxAttemptsPerModel: 3 }));
});

test('timeout retries primary then falls back and reports actual model', async () => {
  const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  const { executor } = harness([timeout, timeout, { ok: true }]);
  const result = await executor.execute({ tenantId: 't', jobId: 'j', stepId: 's', messages: [], policy, deadlineAt: new Date(10_000), executionSite: 'dc-a' });
  assert.equal(result.requestedModel, 'GC-Max');
  assert.equal(result.actualModel, 'GC-M');
  assert.equal(result.fallbackApplied, true);
  assert.deepEqual(result.history.map((x) => x.reasonCode), ['MODEL_TIMEOUT', 'MODEL_TIMEOUT']);
});

test('unknown and authentication errors do not retry or fallback', async () => {
  for (const error of [new Error('unknown'), Object.assign(new Error('forbidden'), { status: 403 })]) {
    const { executor, calls } = harness([error]);
    await assert.rejects(() => executor.execute({ tenantId: 't', jobId: 'j', stepId: 's', messages: [], policy, deadlineAt: new Date(10_000), executionSite: 'dc-a' }));
    assert.equal(calls.filter(([name]) => name === 'acquire').length, 1);
  }
});

test('deadline stops retries before another paid call', async () => {
  const timeout = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
  const { executor, calls } = harness([timeout]);
  await assert.rejects(
    () => executor.execute({ tenantId: 't', jobId: 'j', stepId: 's', messages: [], policy: { ...policy, retryInitialDelayMs: 100 }, deadlineAt: new Date(50), executionSite: 'dc-a' }),
    (error) => error.reasonCode === 'JOB_DEADLINE_EXPIRED',
  );
  assert.equal(calls.filter(([name]) => name === 'acquire').length, 1);
});

test('persistence failures release capacity without opening the model circuit', async () => {
  const calls = [];
  const executor = createModelExecutor({
    coordination: {
      async acquire() { return { id: 'lease-1' }; },
      async release() { calls.push('release'); },
      async failure() { calls.push('failure'); },
    },
    attempts: { async start() { throw Object.assign(new Error('foreign key violation'), { code: '23503' }); } },
    provider: { async complete() { calls.push('provider'); } },
  });
  await assert.rejects(() => executor.execute({ tenantId: 't', jobId: 'j', stepId: 's', messages: [], policy, deadlineAt: new Date(Date.now() + 10_000), executionSite: 'dc-a' }));
  assert.deepEqual(calls, ['release']);
});
