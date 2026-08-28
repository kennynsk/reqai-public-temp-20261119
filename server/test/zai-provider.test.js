import assert from 'node:assert/strict';
import test from 'node:test';

import { ZaiProvider } from '../src/provider/zai-provider.js';

test('ZAI provider calls OpenAI-compatible endpoint and normalizes response metadata', async () => {
  let request;
  const provider = new ZaiProvider({
    apiKey: 'secret',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4/',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        id: 'zai-request-1', model: 'glm-5.2',
        choices: [{ message: { content: '  completed  ' } }],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  const result = await provider.complete({ model: 'glm-5.2', messages: [{ role: 'user', content: 'test' }], temperature: 0.2, maxOutputTokens: 16000, thinking: 'disabled', timeoutMs: 1000 });
  assert.equal(request.url, 'https://api.z.ai/api/coding/paas/v4/chat/completions');
  assert.equal(request.options.headers.authorization, 'Bearer secret');
  assert.equal(JSON.parse(request.options.body).model, 'glm-5.2');
  assert.equal(JSON.parse(request.options.body).max_tokens, 16000);
  assert.deepEqual(JSON.parse(request.options.body).thinking, { type: 'disabled' });
  assert.deepEqual(result, { text: 'completed', model: 'glm-5.2', requestId: 'zai-request-1', usage: { inputTokens: 12, outputTokens: 7 } });
});

test('ZAI provider maps app-level disabled reasoning to the minimum supported GLM-5.3-Flash effort', async () => {
  let request;
  const provider = new ZaiProvider({
    apiKey: 'secret',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        id: 'zai-flash-request-1', model: 'glm-5.3-flash', choices: [{ message: { content: 'completed' } }], usage: {},
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  await provider.complete({ model: 'glm-5.3-flash', messages: [], temperature: 0.2, maxOutputTokens: 16000, reasoning: 'disabled', timeoutMs: 1000 });
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'low');
});

test('ZAI provider forwards a selected GLM-5.3-Flash reasoning effort', async () => {
  let request;
  const provider = new ZaiProvider({
    apiKey: 'secret',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({
        id: 'zai-flash-request-2', model: 'glm-5.3-flash', choices: [{ message: { content: 'completed' } }], usage: {},
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });

  await provider.complete({ model: 'glm-5.3-flash', messages: [], temperature: 0.2, maxOutputTokens: 16000, reasoning: 'high', timeoutMs: 1000 });
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.thinking, { type: 'enabled' });
  assert.equal(body.reasoning_effort, 'high');
});

test('ZAI provider classifies authentication failures without returning provider response content', async () => {
  const provider = new ZaiProvider({
    apiKey: 'bad-secret', baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'sensitive provider text' } }), { status: 401 }),
  });
  await assert.rejects(
    provider.complete({ model: 'glm-5.2', messages: [], temperature: 0.2, timeoutMs: 1000 }),
    (error) => error.reasonCode === 'MODEL_HTTP_401' && !error.message.includes('sensitive provider text'),
  );
});

test('ZAI provider classifies nested Undici header timeouts as retryable and preserves request metadata', async () => {
  let request;
  const provider = new ZaiProvider({
    apiKey: 'secret', baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    fetchImpl: async (url, options) => {
      request = { url, options };
      const cause = Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
      throw Object.assign(new TypeError('fetch failed'), { cause });
    },
  });

  await assert.rejects(
    provider.complete({ model: 'glm-5.3', messages: [{ role: 'user', content: 'test' }], temperature: 0.2, maxOutputTokens: 32000, timeoutMs: 1000, requestId: 'request-timeout-1' }),
    (error) => error.reasonCode === 'MODEL_TIMEOUT'
      && error.retryable === true
      && error.fallbackAllowed === true
      && error.providerCode === 'UND_ERR_HEADERS_TIMEOUT'
      && error.requestId === 'request-timeout-1',
  );
  assert.equal(request.options.dispatcher != null, true);
});
