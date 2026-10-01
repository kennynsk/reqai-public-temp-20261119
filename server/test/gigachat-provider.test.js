import assert from 'node:assert/strict';
import test from 'node:test';

import { GigaChatProvider } from '../src/provider/gigachat-provider.js';

test('GigaChat adapter forwards caller cancellation to clients that support an abort signal', async () => {
  const controller = new AbortController();
  let received;
  const provider = new GigaChatProvider({ chat: async ({ signal }) => new Promise((_resolve, reject) => {
    received = signal;
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }) });
  const pending = provider.complete({ model: 'test', messages: [], timeoutMs: 10000, signal: controller.signal });
  controller.abort();
  assert.equal(received.aborted, true);
  await assert.rejects(pending, { name: 'AbortError' });
});

test('GigaChat provider forwards the bounded output-token budget', async () => {
  let request;
  const provider = new GigaChatProvider({
    async chat(options) {
      request = options;
      return { id: 'giga-request-1', model: 'GigaChat-2-Max', choices: [{ message: { content: 'completed' } }], usage: { prompt_tokens: 4, completion_tokens: 6 } };
    },
  }, { modelAliases: { 'GC-Max': 'GigaChat-2-Max' } });

  const result = await provider.complete({ model: 'GC-Max', messages: [{ role: 'user', content: 'test' }], temperature: 0.2, maxOutputTokens: 16000, timeoutMs: 1000 });
  assert.equal(request.model, 'GigaChat-2-Max');
  assert.equal(request.max_tokens, 16000);
  assert.deepEqual(result.usage, { inputTokens: 4, outputTokens: 6 });
});
