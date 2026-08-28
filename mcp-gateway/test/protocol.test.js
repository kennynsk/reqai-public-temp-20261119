import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { createHttpRuntime } from '../src/http-server.js';
import { createMetrics } from '../src/metrics.js';
import { GatewayError } from '../src/rest-client.js';

const JOB_ID = '123e4567-e89b-42d3-a456-426614174000';
const ARTIFACT_ID = '223e4567-e89b-42d3-a456-426614174000';
const accepted = { jobId: JOB_ID, status: 'ACCEPTED', statusUrl: `/api/v1/jobs/${JOB_ID}`, eventsUrl: `/api/v1/jobs/${JOB_ID}/events`, resultUrl: `/api/v1/jobs/${JOB_ID}/result`, cancelUrl: `/api/v1/jobs/${JOB_ID}/cancel`, idempotencyReplayed: false };

function fakeClient(calls) {
  const idempotency = new Map();
  return {
    async health() { return { ok: true }; },
    async authenticate(token) {
      calls.push(['authenticate', token]);
      if (['invalid', 'expired', 'wrong-audience'].includes(token)) throw new GatewayError({ status: 401, code: 'UNAUTHORIZED', message: 'Token validation failed' });
      return { userId: token, tenantId: token.startsWith('tenant-b') ? 'tenant-b' : 'tenant-a' };
    },
    async decompose(token, input) {
      calls.push(['decompose', token, input]);
      if (token === 'insufficient-role') throw new GatewayError({ status: 403, code: 'FORBIDDEN', message: 'Insufficient privileges' });
      if (input.businessContext === 'admission') throw new GatewayError({ status: 429, code: 'JOB_RATE_LIMIT', message: 'Admission paused', retryable: true, details: { retryAfterSeconds: 30 } });
      const prior = idempotency.get(`${token}:${input.idempotencyKey}`);
      const body = JSON.stringify({ ...input, idempotencyKey: undefined });
      if (prior && prior !== body) throw new GatewayError({ status: 409, code: 'IDEMPOTENCY_KEY_REUSED', message: 'Key was already used with a different request' });
      if (prior) return { ...accepted, idempotencyReplayed: true };
      idempotency.set(`${token}:${input.idempotencyKey}`, body);
      return accepted;
    },
    async researchRequirements(token, input) { calls.push(['researchRequirements', token, input]); return accepted; },
    async getStatus(token, input) { calls.push(['getStatus', token, input]); if (token.startsWith('tenant-b')) throw new GatewayError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' }); return { jobId: JOB_ID, parentJobId: null, inputArtifactId: ARTIFACT_ID, type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING', outcome: null, progress: 25, currentStep: 'decompose', message: null, resultArtifactId: null, createdAt: '2026-01-01T00:00:00.000Z', startedAt: '2026-01-01T00:00:01.000Z', completedAt: null, updatedAt: '2026-01-01T00:00:02.000Z' }; },
    async getResult(token, input) { calls.push(['getResult', token, input]); return { jobId: JOB_ID, parentJobId: null, inputArtifactId: ARTIFACT_ID, type: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', mode: 'DECOMPOSITION', summary: 'done', resultArtifactId: ARTIFACT_ID, resultContentUrl: `/api/v1/jobs/${JOB_ID}/result/content`, failedSteps: [], modelAttempts: [] }; },
    async getResultContent(token, input) { calls.push(['getResultContent', token, input]); return { jobId: JOB_ID, format: input.format, content: '# Requirements\n\n- Email notification', contentType: 'text/markdown; charset=utf-8' }; },
  };
}

async function fixture(token = 'human-token') {
  const calls = [];
  const config = { enabled: true, bodyLimitBytes: 1_100_000, maxConcurrency: 8, path: '/mcp', allowedHosts: [], buildVersion: '1.0.0', schemaVersion: '2.1.0', host: '127.0.0.1', port: 0 };
  const runtime = createHttpRuntime({ config, client: fakeClient(calls), metrics: createMetrics() });
  runtime.setBackendReady(true);
  await runtime.listen();
  const { port } = runtime.server.address();
  const client = new Client({ name: 'qualification-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  return { calls, runtime, client, transport };
}

test('Streamable HTTP conformance advertises exactly five tools and maps every operation', async () => {
  const value = await fixture();
  try {
    const listed = await value.client.listTools();
    assert.deepEqual(listed.tools.map((tool) => tool.name), ['decompose_requirements', 'research_requirements', 'get_task_status', 'get_task_result', 'get_task_result_content']);
    assert.equal(listed.tools.every((tool) => tool.inputSchema.additionalProperties === false), true);
    const decomposition = await value.client.callTool({ name: 'decompose_requirements', arguments: { idempotencyKey: 'decompose-12345678', businessContext: 'Need' } });
    assert.ok(decomposition.structuredContent, JSON.stringify(decomposition));
    assert.equal(decomposition.structuredContent.jobId, JOB_ID);
    await value.client.callTool({ name: 'research_requirements', arguments: { idempotencyKey: 'version-research-123', versionId: JOB_ID } });
    assert.equal((await value.client.callTool({ name: 'get_task_status', arguments: { jobId: JOB_ID } })).structuredContent.status, 'RUNNING');
    assert.equal((await value.client.callTool({ name: 'get_task_result', arguments: { jobId: JOB_ID } })).structuredContent.outcome, 'COMPLETE');
    const content = await value.client.callTool({ name: 'get_task_result_content', arguments: { jobId: JOB_ID } });
    assert.equal(content.structuredContent.format, 'markdown');
    assert.match(content.structuredContent.content, /Email notification/);
    assert.deepEqual(value.calls.filter(([name]) => name !== 'authenticate').map(([name]) => name), ['decompose', 'researchRequirements', 'getStatus', 'getResult', 'getResultContent']);
    assert.equal(value.calls.filter(([name]) => name !== 'authenticate').every(([, token]) => token === 'human-token'), true);
  } finally { await value.client.close(); await value.runtime.close(); }
});

test('idempotency replay and changed-input conflict preserve canonical semantics', async () => {
  const value = await fixture('service-account-token');
  try {
    const args = { idempotencyKey: 'stable-key-123456', businessContext: 'Need' };
    const first = await value.client.callTool({ name: 'decompose_requirements', arguments: args });
    const replay = await value.client.callTool({ name: 'decompose_requirements', arguments: args });
    const conflict = await value.client.callTool({ name: 'decompose_requirements', arguments: { ...args, businessContext: 'Changed' } });
    assert.equal(first.structuredContent.idempotencyReplayed, false);
    assert.equal(replay.structuredContent.idempotencyReplayed, true);
    assert.equal(conflict.isError, true);
    assert.equal(conflict.structuredContent.error.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(value.calls.filter(([name]) => name === 'decompose').every(([, token]) => token === 'service-account-token'), true);
  } finally { await value.client.close(); await value.runtime.close(); }
});

test('protocol validation rejects tenant, prompt and lineage fields before backend mutation', async () => {
  const value = await fixture();
  try {
    const before = value.calls.length;
    const tenant = await value.client.callTool({ name: 'decompose_requirements', arguments: { idempotencyKey: 'key-123456789012', businessContext: 'Need', tenantId: 'other' } });
    const lineage = await value.client.callTool({ name: 'research_requirements', arguments: { idempotencyKey: 'key-123456789012', versionId: JOB_ID, parentJobId: JOB_ID } });
    assert.equal(tenant.isError, true);
    assert.equal(lineage.isError, true);
    assert.equal(value.calls.slice(before).some(([name]) => name === 'decompose' || name === 'researchRequirements'), false);
  } finally { await value.client.close(); await value.runtime.close(); }
});

test('missing bearer is rejected before MCP initialization', async () => {
  const calls = [];
  const config = { enabled: true, bodyLimitBytes: 100_000, maxConcurrency: 2, path: '/mcp', allowedHosts: [], buildVersion: '1.0.0', schemaVersion: '2.1.0', host: '127.0.0.1', port: 0 };
  const runtime = createHttpRuntime({ config, client: fakeClient(calls), metrics: createMetrics() });
  await runtime.listen();
  try {
    const { port } = runtime.server.address();
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }) });
    assert.equal(response.status, 401);
    assert.equal(calls.length, 0);
  } finally { await runtime.close(); }
});

test('invalid, expired and wrong-audience credentials fail during initialization', async () => {
  for (const token of ['invalid', 'expired', 'wrong-audience']) {
    const calls = [];
    const config = { enabled: true, bodyLimitBytes: 100_000, maxConcurrency: 2, path: '/mcp', allowedHosts: [], buildVersion: '1.0.0', schemaVersion: '2.1.0', host: '127.0.0.1', port: 0 };
    const runtime = createHttpRuntime({ config, client: fakeClient(calls), metrics: createMetrics() });
    await runtime.listen();
    try {
      const { port } = runtime.server.address();
      const response = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'x', version: '1' } } }) });
      assert.equal(response.status, 401);
      assert.deepEqual(calls, [['authenticate', token]]);
    } finally { await runtime.close(); }
  }
});

test('backend role and tenant policies remain canonical safe tool errors', async () => {
  const forbidden = await fixture('insufficient-role');
  try {
    const result = await forbidden.client.callTool({ name: 'decompose_requirements', arguments: { idempotencyKey: 'forbidden-1234567', businessContext: 'Need' } });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, 'FORBIDDEN');
  } finally { await forbidden.client.close(); await forbidden.runtime.close(); }

  const otherTenant = await fixture('tenant-b-human');
  try {
    const result = await otherTenant.client.callTool({ name: 'get_task_status', arguments: { jobId: JOB_ID } });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.error, { code: 'JOB_NOT_FOUND', message: 'Job not found', retryable: false, requestId: null });
  } finally { await otherTenant.client.close(); await otherTenant.runtime.close(); }
});

test('admission policy is returned as a safe retryable tool error without fallback', async () => {
  const value = await fixture();
  try {
    const result = await value.client.callTool({ name: 'decompose_requirements', arguments: { idempotencyKey: 'admission-12345678', businessContext: 'admission' } });
    assert.equal(result.isError, true);
    assert.deepEqual(result.structuredContent.error, { code: 'JOB_RATE_LIMIT', message: 'Admission paused', retryable: true, requestId: null, details: { retryAfterSeconds: 30 } });
    assert.equal(value.calls.filter(([name]) => name === 'decompose').length, 1);
  } finally { await value.client.close(); await value.runtime.close(); }
});

test('health, version and metrics endpoints expose only safe operational metadata', async () => {
  const value = await fixture();
  try {
    const base = `http://127.0.0.1:${value.runtime.server.address().port}`;
    assert.equal((await fetch(`${base}/health/live`)).status, 200);
    assert.equal((await (await fetch(`${base}/health/ready`)).json()).backendCompatible, true);
    assert.deepEqual(await (await fetch(`${base}/version`)).json(), { buildVersion: '1.0.0', toolSchemaVersion: '2.1.0', sdk: '1.30.0', transport: 'streamable-http' });
    const metrics = await (await fetch(`${base}/metrics`)).text();
    assert.doesNotMatch(metrics, /human-token|tenant|jobId/);
  } finally { await value.client.close(); await value.runtime.close(); }
});
