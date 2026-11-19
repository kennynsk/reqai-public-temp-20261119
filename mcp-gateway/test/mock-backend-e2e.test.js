import { createHash } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { createApp } from '../../server/src/app.js';
import { loadConfig as loadBackendConfig } from '../../server/src/config/env.js';
import { MockLlmProvider } from '../../server/src/provider/mock-llm-provider.js';
import { createRequirementsIntegrationService } from '../../server/src/services/requirements-integration-service.js';
import { createHttpRuntime } from '../src/http-server.js';
import { createMetrics } from '../src/metrics.js';
import { createReqAiClient } from '../src/rest-client.js';

const VERSION_ID = '00000000-0000-4000-8000-000000000001';

function iso() { return '2026-08-25T00:00:00.000Z'; }

test('both MCP starts complete through ReqAI REST and the mock provider', async () => {
  const backendConfig = loadBackendConfig({ LLM_PROVIDER_MODE: 'mock' }, { loadFiles: false });
  const provider = new MockLlmProvider({ delayMs: 0 });
  const jobs = new Map();
  let sequence = 100;
  const nextUuid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const artifacts = new Map();
  const artifactRepository = {
    async upload({ readable, expectedSha256, contentType }) {
      const chunks = []; for await (const chunk of readable) chunks.push(chunk);
      const content = Buffer.concat(chunks);
      assert.equal(createHash('sha256').update(content).digest('hex'), expectedSha256);
      const row = { id: nextUuid(), sha256: expectedSha256, content_type: contentType, size_bytes: content.length, created_at: iso(), content };
      artifacts.set(row.id, row); return row;
    },
    async validateMaterial({ artifactId }) { return artifacts.get(artifactId) || { id: VERSION_ID, sha256: 'a'.repeat(64), content_type: 'text/markdown', size_bytes: Buffer.byteLength('# BABOK report') }; },
    async metadata({ artifactId }) { return artifacts.get(artifactId) || { id: VERSION_ID, content_type: 'text/markdown', size_bytes: Buffer.byteLength('# BABOK report') }; },
    async streamTo({ writable }) { writable.end('# BABOK report'); },
  };
  const jobService = {
    async cancel({ jobId }) {
      const job = jobs.get(jobId);
      jobs.set(jobId, { ...job, status: 'CANCELLED' });
      return { job: { id: jobId, input_artifact_id: job.inputArtifactId, type: job.type, status: 'CANCELLED', configuration_snapshot: { featureMode: job.mode }, created_at: iso(), updated_at: iso() } };
    },
    async create({ body }) {
      const jobId = nextUuid();
      const row = { jobId, parentJobId: body.parentJobId || null, inputArtifactId: body.inputArtifactId, type: body.type, mode: body.options.mode, status: 'ACCEPTED', outcome: null, progress: 0, currentStep: null, message: null, resultArtifactId: null, createdAt: iso(), startedAt: null, completedAt: null, updatedAt: iso() };
      jobs.set(jobId, row);
      setImmediate(async () => {
        const marker = body.type === 'DECOMPOSITION' ? 'Разложи бизнес-задачу на три типа требований' : 'Проведи исследование требований';
        await provider.complete({ model: 'mock', messages: [{ role: 'user', content: marker }] });
        jobs.set(jobId, { ...row, status: 'SUCCEEDED', outcome: 'COMPLETE', progress: 100, message: 'Mock provider complete', resultArtifactId: nextUuid(), startedAt: iso(), completedAt: iso(), updatedAt: iso() });
      });
      return { job: { id: jobId, status: 'ACCEPTED' }, replayed: false };
    },
  };
  const requirementsIntegrationService = createRequirementsIntegrationService({
    config: backendConfig,
    jobService,
    uuid: nextUuid,
    artifactRepository,
    requirementsVersionService: { resolveResearchSource: async ({ versionId }) => ({ inputArtifactId: versionId, parentJobId: VERSION_ID, inputSha256: 'b'.repeat(64) }) },
  });
  const jobQueryService = {
    async get({ jobId }) { return jobs.get(jobId); },
    async result({ jobId }) {
      const job = jobs.get(jobId);
      return { jobId, parentJobId: job.parentJobId, inputArtifactId: job.inputArtifactId, type: job.type, status: 'SUCCEEDED', outcome: job.outcome, mode: job.mode, summary: job.message, resultArtifactId: job.resultArtifactId, resultContentUrl: `/api/v1/jobs/${jobId}/result/content`, failedSteps: [], modelAttempts: [] };
    },
  };

  const { app } = createApp({ config: backendConfig, services: { requirementsIntegrationService, jobQueryService, jobService, artifactRepository } });
  const backend = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => backend.once('listening', resolve));
  const backendUrl = `http://127.0.0.1:${backend.address().port}`;
  const gatewayConfig = { enabled: true, production: false, bodyLimitBytes: 1_100_000, responseLimitBytes: 262_144, maxConcurrency: 8, path: '/mcp', allowedHosts: [], buildVersion: '1.0.0', schemaVersion: '3.0.0', host: '127.0.0.1', port: 0, backendUrl, backendTimeoutMs: 1000, authTimeoutMs: 1000 };
  const gateway = createHttpRuntime({ config: gatewayConfig, client: createReqAiClient({ config: gatewayConfig }), metrics: createMetrics() });
  gateway.setBackendReady(true);
  await gateway.listen();
  const mcp = new Client({ name: 'mock-e2e', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${gateway.server.address().port}/mcp`), { requestInit: { headers: { authorization: 'Bearer mock-human' } } });
  await mcp.connect(transport);
  try {
    const text = 'Требования к заявке';
    const upload = await fetch(`${backendUrl}/api/v1/artifacts`, { method: 'POST', headers: { authorization: 'Bearer mock-human', 'content-type': 'text/plain', 'X-Content-SHA256': createHash('sha256').update(text).digest('hex') }, body: text });
    assert.equal(upload.status, 201);
    const artifactId = (await upload.json()).artifactId;
    assert.equal(artifacts.get(artifactId).content.toString(), text);
    const starts = [
      ['decompose_requirements', { idempotencyKey: 'mock-decompose-0001', inputArtifactId: artifactId }],
      ['research_requirements', { idempotencyKey: 'mock-version-research', versionId: VERSION_ID }],
    ];
    for (const [name, args] of starts) {
      const accepted = await mcp.callTool({ name, arguments: args });
      assert.equal(accepted.structuredContent.status, 'ACCEPTED');
      await new Promise((resolve) => setImmediate(resolve));
      const status = await mcp.callTool({ name: 'get_task_status', arguments: { jobId: accepted.structuredContent.jobId } });
      const result = await mcp.callTool({ name: 'get_task_result', arguments: { jobId: accepted.structuredContent.jobId } });
      assert.equal(status.structuredContent.status, 'SUCCEEDED');
      assert.equal(result.structuredContent.outcome, 'COMPLETE');
      assert.match(result.structuredContent.resultContentUrl, /\/api\/v1\/jobs\//);
      const content = await fetch(`${backendUrl}/api/v1/jobs/${accepted.structuredContent.jobId}/result/content?format=raw`, { headers: { authorization: 'Bearer mock-human' } });
      assert.equal(await content.text(), '# BABOK report');
    }
    const pendingId = nextUuid();
    jobs.set(pendingId, { jobId: pendingId, inputArtifactId: artifactId, type: 'DECOMPOSITION', mode: 'DECOMPOSITION', status: 'RUNNING' });
    const cancelled = await fetch(`${backendUrl}/api/v1/jobs/${pendingId}/cancel`, { method: 'POST', headers: { authorization: 'Bearer mock-human' } });
    assert.equal(cancelled.status, 202);
    assert.equal(jobs.get(pendingId).status, 'CANCELLED');
  } finally {
    await mcp.close();
    await gateway.close();
    await new Promise((resolve) => backend.close(resolve));
  }
});
