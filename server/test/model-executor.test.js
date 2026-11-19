import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelExecutor, validateModelPolicy } from '../src/services/model-executor.js';

const policy = Object.freeze({
  models: ['GC-Max', 'GC-M', 'GC-Lite'], maxAttemptsPerModel: 2, requestTimeoutMs: 1000,
  retryInitialDelayMs: 10, retryMaxDelayMs: 100, outputTokens: { 'GC-Max': 16000, 'GC-M': 16000, 'GC-Lite': 16000 }, thinking: 'disabled', reasoning: 'disabled', maxConcurrency: { 'GC-Max': 1, 'GC-M': 1, 'GC-Lite': 1 },
});

function harness(outcomes) {
  const calls = []; const budgets = []; const thinkingModes = []; const reasoningLevels = []; let index = 0; let now = 0;
  const executor = createModelExecutor({
    clock: () => new Date(now), sleep: async (ms) => { now += ms; }, uuid: () => `attempt-${index}`,
    coordination: {
      async acquire(input) { calls.push(['acquire', input.model]); return { id: `lease-${input.model}` }; },
      async success(input) { calls.push(['success', input.model]); },
      async failure(input) { calls.push(['failure', input.model, input.reasonCode]); },
    },
    attempts: { async start() {}, async finish(input) { calls.push(['attempt', input.status, input.reasonCode]); } },
    provider: { async complete({ model, maxOutputTokens, thinking, reasoning }) { budgets.push([model, maxOutputTokens]); thinkingModes.push(thinking); reasoningLevels.push(reasoning); const outcome = outcomes[index++]; if (outcome instanceof Error) throw outcome; return { text: 'ok', model, requestId: 'p1', usage: {} }; } },
  });
  return { calls, budgets, thinkingModes, reasoningLevels, executor };
}

test('model policy is immutable and bounded to three models/two attempts', () => {
  const snapshot = validateModelPolicy(policy);
  assert.equal(Object.isFrozen(snapshot.models), true);
  assert.equal(snapshot.outputTokens['GC-Max'], 16000);
  assert.equal(Object.isFrozen(snapshot.outputTokens), true);
  assert.equal(snapshot.thinking, 'disabled');
  assert.equal(snapshot.reasoning, 'disabled');
  assert.throws(() => validateModelPolicy({ models: ['a','b','c','d'], maxAttemptsPerModel: 2 }));
  assert.throws(() => validateModelPolicy({ models: ['a'], maxAttemptsPerModel: 3 }));
  assert.throws(() => validateModelPolicy({ ...policy, thinking: 'auto' }), /Thinking mode/);
  assert.throws(() => validateModelPolicy({ ...policy, reasoning: 'auto' }), /Reasoning level/);
});

test('timeout retries primary then falls back and reports actual model', async () => {
  const timeoutCause = Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
  const timeout = Object.assign(new TypeError('fetch failed'), { cause: timeoutCause });
  const { executor, budgets, thinkingModes, reasoningLevels } = harness([timeout, timeout, { ok: true }]);
  const result = await executor.execute({ tenantId: 't', jobId: 'j', stepId: 's', messages: [], policy, deadlineAt: new Date(10_000), executionSite: 'dc-a' });
  assert.equal(result.requestedModel, 'GC-Max');
  assert.equal(result.actualModel, 'GC-M');
  assert.equal(result.fallbackApplied, true);
  assert.deepEqual(result.history.map((x) => x.reasonCode), ['MODEL_TIMEOUT', 'MODEL_TIMEOUT']);
  assert.deepEqual(budgets, [['GC-Max', 16000], ['GC-Max', 16000], ['GC-M', 16000]]);
  assert.deepEqual(thinkingModes, ['disabled', 'disabled', 'disabled']);
  assert.deepEqual(reasoningLevels, ['disabled', 'disabled', 'disabled']);
});

test('selected reasoning level reaches every model attempt', async () => {
  const { executor, reasoningLevels } = harness([{ ok: true }]);
  await executor.execute({ tenantId: 't', jobId: 'j', stepId: 's', messages: [], policy: { ...policy, models: ['GC-Max'], maxAttemptsPerModel: 1, reasoning: 'high' }, deadlineAt: new Date(10_000), executionSite: 'dc-a' });
  assert.deepEqual(reasoningLevels, ['high']);
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

test('repair trace step can persist under the original checkpoint step', async () => {
  let persistedStepId;
  const executor = createModelExecutor({
    uuid: (() => { let index = 0; return () => `id-${++index}`; })(),
    coordination: { async acquire() { return { id: 'lease-1' }; }, async success() {}, async failure() {} },
    attempts: { async start(input) { persistedStepId = input.stepId; }, async finish() {} },
    provider: { async complete({ model }) { return { text: 'ok', model, requestId: 'p1', usage: {} }; } },
  });
  await executor.execute({ tenantId: 't', jobId: 'j', stepId: 'decompose-chunk:c1:repair', persistenceStepId: 'decompose-chunk:c1', messages: [], policy: { ...policy, models: ['GC-Max'], maxAttemptsPerModel: 1 }, deadlineAt: new Date(Date.now() + 10_000), executionSite: 'dc-a' });
  assert.equal(persistedStepId, 'decompose-chunk:c1');
});

test('provider retries use the remaining total deadline, not the first attempt timeout again', async () => {
  let now = 0;
  const timeouts = [];
  const executor = createModelExecutor({ clock: () => new Date(now), sleep: async (ms) => { now += ms; },
    coordination: { acquire: async () => ({ id: 'lease' }), success: async () => {}, failure: async () => {} },
    attempts: { start: async () => {}, finish: async () => {} },
    provider: { complete: async ({ timeoutMs }) => { timeouts.push(timeoutMs); if (timeouts.length === 1) { now += 700; throw Object.assign(new Error('reset'), { code: 'ECONNRESET' }); } return { text: 'ok', usage: {} }; } },
  });
  await executor.execute({ tenantId: 'test', jobId: 'test', stepId: 'test', messages: [], policy: { ...policy, models: ['GC-Max'] }, deadlineAt: new Date(1000).toISOString() });
  assert.deepEqual(timeouts, [1000, 290]);
});
