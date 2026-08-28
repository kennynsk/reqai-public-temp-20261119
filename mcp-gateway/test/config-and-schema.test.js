import test from 'node:test';
import assert from 'node:assert/strict';

import { loadConfig } from '../src/config.js';
import { TOOL_DEFINITIONS, decomposeRequirementsInput, researchRequirementsInput, taskResultContentInput, taskResultContentOutput, taskStatusOutput, taskResultOutput } from '../src/schemas.js';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

test('configuration is disabled by default and production fails closed', () => {
  const local = loadConfig({});
  assert.equal(local.enabled, false);
  assert.equal(local.transport, 'streamable-http');
  assert.throws(() => loadConfig({ NODE_ENV: 'production', MCP_ENABLED: 'true', MCP_PUBLIC_ENDPOINT: 'http://mcp.example/mcp' }), /https/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', MCP_ENABLED: 'true', MCP_PUBLIC_ENDPOINT: 'https://mcp.example/mcp', MCP_ALLOWED_HOSTS: 'mcp.example', MCP_TRANSPORT: 'stdio' }), /streamable-http/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production', MCP_ENABLED: 'true', MCP_PUBLIC_ENDPOINT: 'https://mcp.example/mcp', MCP_ALLOWED_HOSTS: 'mcp.example', MCP_BACKEND_API_URL: 'https://api.example' }), /MCP_READINESS_BEARER_TOKEN/);
  assert.throws(() => loadConfig({ MCP_IAM_AUDIENCE_MODE: 'exchange' }), /forward-same-audience/);
});

test('exactly five versioned tools are exposed and no prompt/resource capability exists', () => {
  assert.deepEqual(Object.keys(TOOL_DEFINITIONS), ['decompose_requirements', 'research_requirements', 'get_task_status', 'get_task_result', 'get_task_result_content']);
  assert.equal(loadConfig({}).schemaVersion, '2.1.0');
});

test('tool input schemas reject unknown and technical identity or lineage fields', () => {
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', businessContext: 'x', tenantId: 'other' }).success, false);
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', businessContext: 'x', inputArtifactId: UUID }).success, false);
  assert.equal(researchRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', versionId: UUID, parentJobId: UUID }).success, false);
});

test('inline content is bounded and artifact references are accepted', () => {
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', businessContext: 'x'.repeat(1_048_577) }).success, false);
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', businessContext: 'x', reasoning: 'high' }).success, true);
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', inputArtifactId: UUID }).success, true);
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', inputArtifactId: UUID, baselineArtifactId: '00000000-0000-4000-8000-000000000002', referenceArtifactIds: ['00000000-0000-4000-8000-000000000003'] }).success, true);
  assert.equal(decomposeRequirementsInput.safeParse({ idempotencyKey: 'key-123456789012', inputArtifactId: UUID, referenceArtifactIds: [UUID, UUID] }).success, false);
});

test('canonical status and complete/partial result DTOs remain representable', () => {
  const base = { jobId: UUID, parentJobId: null, inputArtifactId: UUID, type: 'RESEARCH', mode: 'AGENT_RESEARCH', outcome: null, progress: 0, currentStep: null, message: null, resultArtifactId: null, createdAt: '2026-01-01T00:00:00Z', startedAt: null, completedAt: null, updatedAt: '2026-01-01T00:00:00Z' };
  for (const status of ['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED']) assert.equal(taskStatusOutput.safeParse({ ...base, status }).success, true);
  assert.equal(taskResultOutput.safeParse({ jobId: UUID, parentJobId: null, inputArtifactId: UUID, type: 'RESEARCH', status: 'SUCCEEDED', outcome: 'PARTIAL', mode: 'AGENT_RESEARCH', summary: 'partial', resultArtifactId: UUID, resultContentUrl: `/api/v1/jobs/${UUID}/result/content`, failedSteps: [], modelAttempts: [] }).success, true);
});

test('result metadata accepts canonical non-UUID workflow step identifiers', () => {
  const result = { jobId: UUID, parentJobId: null, inputArtifactId: UUID, type: 'DECOMPOSITION', status: 'SUCCEEDED', outcome: 'COMPLETE', mode: 'DECOMPOSITION', summary: 'done', resultArtifactId: UUID, resultContentUrl: `/api/v1/jobs/${UUID}/result/content`, failedSteps: [{ stepId: 'validate:chunk-1', stepType: 'VALIDATION', summary: null }], modelAttempts: [{ stepId: 'decompose-chunk:chunk-1', requestedModel: 'glm-5.3', model: 'glm-5.3', attempt: 1, result: 'SUCCEEDED', reasonCode: null, tokenUsage: { input: 10, output: 20 }, durationMs: 1000 }] };
  assert.equal(taskResultOutput.safeParse(result).success, true);
});

test('result content input defaults to markdown and output carries bounded text', () => {
  const input = taskResultContentInput.parse({ jobId: UUID });
  assert.deepEqual(input, { jobId: UUID, format: 'markdown' });
  assert.equal(taskResultContentInput.safeParse({ jobId: UUID, format: 'html' }).success, false);
  assert.equal(taskResultContentOutput.safeParse({ jobId: UUID, format: 'markdown', contentType: 'text/markdown', content: '# Requirements' }).success, true);
  assert.equal(taskResultContentOutput.safeParse({ jobId: UUID, format: 'markdown', contentType: 'text/markdown', content: 'x'.repeat(1_000_001) }).success, false);
});
