import assert from 'node:assert/strict';
import test from 'node:test';

import { MockLlmProvider } from '../src/provider/mock-llm-provider.js';
import { parseBabokOutput } from '../src/services/babok-requirements-contract.js';

test('mock delay honours cancellation before producing a result', async () => {
  const controller = new AbortController();
  const pending = new MockLlmProvider({ delayMs: 10000 }).complete({ model: 'test', messages: [], signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('mock provider emits deterministic valid decomposition JSON', async () => {
  const provider = new MockLlmProvider({ delayMs: 0 });
  const response = await provider.complete({ model: 'GC-Max', messages: [{ role: 'user', content: 'Разложи бизнес-задачу на три типа требований' }] });
  const parsed = JSON.parse(response.text);
  assert.equal(parsed.business[0].id, 'BT-1');
  assert.equal(response.model, 'GC-Max');
});

test('mock provider emits a valid BABOK envelope for local workflow qualification', async () => {
  const provider = new MockLlmProvider({ delayMs: 0 });
  const response = await provider.complete({ model: 'glm-5.3', messages: [{ role: 'user', content: 'Верни babok-requirements.v1 JSON' }] });
  const parsed = parseBabokOutput(response.text);
  assert.equal(parsed.schemaVersion, 'babok-requirements.v1');
  assert.equal(parsed.materials.primary.artifactId, 'mock-primary');
});
