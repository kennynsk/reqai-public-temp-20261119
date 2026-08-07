import assert from 'node:assert/strict';
import test from 'node:test';

import { MockLlmProvider } from '../src/provider/mock-llm-provider.js';

test('mock provider emits deterministic valid decomposition JSON', async () => {
  const provider = new MockLlmProvider({ delayMs: 0 });
  const response = await provider.complete({ model: 'GC-Max', messages: [{ role: 'user', content: 'Разложи бизнес-задачу на три типа требований' }] });
  const parsed = JSON.parse(response.text);
  assert.equal(parsed.business[0].id, 'BT-1');
  assert.equal(response.model, 'GC-Max');
});
