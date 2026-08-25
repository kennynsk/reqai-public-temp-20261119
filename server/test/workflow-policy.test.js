import assert from 'node:assert/strict';
import test from 'node:test';
import { bundleWorkflowCode, Worker } from '@temporalio/worker';
import { defaultPayloadConverter } from '@temporalio/common';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { evaluateOutcome } from '../src/domain/outcome.js';

test('complete, partial and failed outcomes require usable units', () => {
  assert.deepEqual(evaluateOutcome({ successfulUnits: 2, failedUnits: 0 }), { status: 'SUCCEEDED', outcome: 'COMPLETE', reasonCode: null });
  assert.deepEqual(evaluateOutcome({ successfulUnits: 1, failedUnits: 2 }), { status: 'SUCCEEDED', outcome: 'PARTIAL', reasonCode: 'PARTIAL_RESULT' });
  assert.deepEqual(evaluateOutcome({ successfulUnits: 0, failedUnits: 2 }), { status: 'FAILED', outcome: null, reasonCode: 'NO_USABLE_OUTPUT' });
});

test('workflow bundle contains durable decomposition/research graphs and version marker', async () => {
  const workflowsPath = fileURLToPath(new URL('../src/workflows/index.js', import.meta.url));
  const source = await readFile(workflowsPath, 'utf8');
  assert.match(source, /nonRetryableErrorTypes: \['ProviderError'/);
  assert.match(source, /mode !== 'REQUIREMENTS_INSIGHTS'/);
  assert.match(source, /generateRequirementsInsights/);
  assert.doesNotMatch(source, /PROMPT_TEST|MODEL_COMPARE|AGENT_COMPARE|STANDARD_RESEARCH|AGENT_RESEARCH/);
  const bundle = await bundleWorkflowCode({ workflowsPath });
  assert.match(bundle.code, /decompositionWorkflow/); assert.match(bundle.code, /researchWorkflow/); assert.match(bundle.code, /reqai-workflow-v1/); assert.doesNotMatch(bundle.code, /requirements-synthesis/);
});

test('current version replays a persisted Temporal workflow-start history', async () => {
  const input = { jobId: '00000000-0000-4000-8000-000000000001', tenantId: 'tenant-a', ownerUserId: 'user-a', inputArtifactId: '00000000-0000-4000-8000-000000000002', deadlineAt: '2099-01-01T00:00:00Z', configurationSnapshot: { models: ['GC-Max'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: { 'GC-Max': 1 } } };
  const encoded = defaultPayloadConverter.toPayload(input);
  const payload = { metadata: Object.fromEntries(Object.entries(encoded.metadata).map(([key, value]) => [key, Buffer.from(value).toString('base64')])), data: Buffer.from(encoded.data).toString('base64') };
  const history = { events: [
    { eventId: '1', eventTime: '2026-01-01T00:00:00Z', eventType: 'EVENT_TYPE_WORKFLOW_EXECUTION_STARTED', version: '0', taskId: '1', workflowExecutionStartedEventAttributes: { workflowType: { name: 'decompositionWorkflow' }, taskQueue: { name: 'requirements-decomposition', kind: 'TASK_QUEUE_KIND_NORMAL' }, input: { payloads: [payload] }, workflowRunTimeout: '3600s', workflowExecutionTimeout: '3600s', workflowTaskTimeout: '10s', originalExecutionRunId: '11111111-1111-4111-8111-111111111111', identity: 'replay-test' } },
    { eventId: '2', eventTime: '2026-01-01T00:00:00Z', eventType: 'EVENT_TYPE_WORKFLOW_TASK_SCHEDULED', version: '0', taskId: '2', workflowTaskScheduledEventAttributes: { taskQueue: { name: 'requirements-decomposition', kind: 'TASK_QUEUE_KIND_NORMAL' }, startToCloseTimeout: '10s', attempt: 1 } },
    { eventId: '3', eventTime: '2026-01-01T00:00:00Z', eventType: 'EVENT_TYPE_WORKFLOW_TASK_STARTED', version: '0', taskId: '3', workflowTaskStartedEventAttributes: { scheduledEventId: '2', identity: 'replay-test', requestId: '22222222-2222-4222-8222-222222222222' } },
  ] };
  const workflowsPath = fileURLToPath(new URL('../src/workflows/index.js', import.meta.url));
  await Worker.runReplayHistory({ workflowsPath }, history, 'replay-job');
});
