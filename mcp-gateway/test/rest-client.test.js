import test from 'node:test';
import assert from 'node:assert/strict';

import { createReqAiClient, GatewayError, parseBearer } from '../src/rest-client.js';

const config = { backendUrl: 'https://reqai.internal', backendTimeoutMs: 1000, authTimeoutMs: 1000, responseLimitBytes: 4096 };
const UUID = '123e4567-e89b-42d3-a456-426614174000';

test('REST mapping preserves bearer, idempotency and strips MCP-only fields', async () => {
  let captured;
  const client = createReqAiClient({ config, fetchImpl: async (url, options) => {
    captured = { url, options };
    return new Response(JSON.stringify({ jobId: UUID }), { status: 202, headers: { 'content-type': 'application/json' } });
  } });
  await client.decompose('secret', { idempotencyKey: 'key-123456789012', businessContext: 'Need' });
  assert.equal(captured.url, 'https://reqai.internal/api/v1/decompositions');
  assert.equal(captured.options.headers.authorization, 'Bearer secret');
  assert.equal(captured.options.headers['idempotency-key'], 'key-123456789012');
  assert.deepEqual(JSON.parse(captured.options.body), { businessContext: 'Need' });
});

test('requirements research path derives lineage only in backend', async () => {
  let captured;
  const client = createReqAiClient({ config, fetchImpl: async (url, options) => { captured = { url, options }; return new Response('{}', { status: 202 }); } });
  await client.researchRequirements('secret', { versionId: UUID, idempotencyKey: 'key-123456789012', model: 'glm' });
  assert.equal(captured.url, `https://reqai.internal/api/v1/requirements/versions/${UUID}/research`);
  assert.deepEqual(JSON.parse(captured.options.body), { model: 'glm' });
});

test('canonical errors retain only approved safe details', async () => {
  const client = createReqAiClient({ config, fetchImpl: async () => new Response(JSON.stringify({ error: { code: 'JOB_RATE_LIMIT', message: 'Wait', retryable: true, requestId: 'req-1', details: { retryAfterSeconds: 30, prompt: 'secret' } } }), { status: 429 }) });
  await assert.rejects(client.getStatus('secret', { jobId: UUID }), (error) => error instanceof GatewayError && error.code === 'JOB_RATE_LIMIT' && error.details.retryAfterSeconds === 30 && !('prompt' in error.details));
});

test('unavailable and timeout failures have stable retryable gateway codes', async () => {
  const unavailable = createReqAiClient({ config, fetchImpl: async () => { throw new TypeError('connection refused'); } });
  await assert.rejects(unavailable.getResult('secret', { jobId: UUID }), (error) => error.code === 'MCP_BACKEND_UNAVAILABLE' && error.retryable);
  const timeout = createReqAiClient({ config: { ...config, backendTimeoutMs: 5 }, fetchImpl: (url, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  await assert.rejects(timeout.getResult('secret', { jobId: UUID }), (error) => error.code === 'MCP_BACKEND_TIMEOUT' && error.retryable);
});

test('bearer parser rejects missing or malformed credentials', () => {
  assert.throws(() => parseBearer(), /Bearer authentication required/);
  assert.throws(() => parseBearer('Basic abc'), /Bearer authentication required/);
  assert.equal(parseBearer('Bearer abc.def'), 'abc.def');
});

test('authentication qualifies the backend v1 domain capability contract', async () => {
  const compatible = createReqAiClient({ config, fetchImpl: async () => new Response(JSON.stringify({ version: 'v1', capabilities: { domainOperations: ['decomposition', 'standalone-research', 'requirements-research'] } }), { status: 200 }) });
  assert.equal((await compatible.authenticate('human-token')).version, 'v1');
  const incompatible = createReqAiClient({ config, fetchImpl: async () => new Response(JSON.stringify({ version: 'v1', capabilities: { domainOperations: ['decomposition'] } }), { status: 200 }) });
  await assert.rejects(incompatible.authenticate('human-token'), (error) => error.code === 'MCP_BACKEND_INCOMPATIBLE' && error.status === 503);
});

test('response size allowlist keeps large artifacts out of MCP payloads', async () => {
  const client = createReqAiClient({ config: { ...config, responseLimitBytes: 32 }, fetchImpl: async () => new Response(JSON.stringify({ protectedArtifact: 'x'.repeat(100) }), { status: 200 }) });
  await assert.rejects(client.getResult('human-token', { jobId: UUID }), (error) => error.code === 'MCP_RESPONSE_TOO_LARGE');
});

test('result-not-ready stays canonical and retryable without a gateway wait loop', async () => {
  let calls = 0;
  const client = createReqAiClient({ config, fetchImpl: async () => { calls += 1; return new Response(JSON.stringify({ error: { code: 'RESULT_NOT_READY', message: 'Job result is not available yet', retryable: true, requestId: 'req-ready' } }), { status: 409 }); } });
  await assert.rejects(client.getResult('human-token', { jobId: UUID }), (error) => error.code === 'RESULT_NOT_READY' && error.retryable);
  assert.equal(calls, 1);
});
