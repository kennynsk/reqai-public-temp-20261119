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
  const jobService = {
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
    artifactRepository: { metadata: async () => ({ id: VERSION_ID, sha256: 'a'.repeat(64) }) },
    requirementsVersionService: { resolveResearchSource: async ({ versionId }) => ({ inputArtifactId: versionId, parentJobId: VERSION_ID, inputSha256: 'b'.repeat(64) }) },
  });
  const jobQueryService = {
    async get({ jobId }) { return jobs.get(jobId); },
    async result({ jobId }) {
      const job = jobs.get(jobId);
      return { jobId, parentJobId: job.parentJobId, inputArtifactId: job.inputArtifactId, type: job.type, status: 'SUCCEEDED', outcome: job.outcome, mode: job.mode, summary: job.message, resultArtifactId: job.resultArtifactId, resultContentUrl: `/api/v1/jobs/${jobId}/result/content`, failedSteps: [], modelAttempts: [] };
    },
  };

  const { app } = createApp({ config: backendConfig, services: { requirementsIntegrationService, jobQueryService } });
  const backend = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => backend.once('listening', resolve));
  const backendUrl = `http://127.0.0.1:${backend.address().port}`;
  const gatewayConfig = { enabled: true, production: false, bodyLimitBytes: 1_100_000, responseLimitBytes: 262_144, maxConcurrency: 8, path: '/mcp', allowedHosts: [], buildVersion: '1.0.0', schemaVersion: '2.0.0', host: '127.0.0.1', port: 0, backendUrl, backendTimeoutMs: 1000, authTimeoutMs: 1000 };
  const gateway = createHttpRuntime({ config: gatewayConfig, client: createReqAiClient({ config: gatewayConfig }), metrics: createMetrics() });
  gateway.setBackendReady(true);
  await gateway.listen();
  const mcp = new Client({ name: 'mock-e2e', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${gateway.server.address().port}/mcp`), { requestInit: { headers: { authorization: 'Bearer mock-human' } } });
  await mcp.connect(transport);
  try {
    const starts = [
      ['decompose_requirements', { idempotencyKey: 'mock-decompose-0001', businessContext: 'Задача' }],
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
    }
  } finally {
    await mcp.close();
    await gateway.close();
    await new Promise((resolve) => backend.close(resolve));
  }
});
