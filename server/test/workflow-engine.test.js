import assert from 'node:assert/strict';
import test from 'node:test';

import { TemporalWorkflowEngine } from '../src/workflow/temporal-workflow-engine.js';
import { assertWorkflowEngine, workflowIdForJob } from '../src/workflow/workflow-engine.js';

test('WorkflowEngine boundary rejects incomplete adapters', () => {
  assert.throws(() => assertWorkflowEngine({ start() {} }), /WorkflowEngine.signal/);
  assert.equal(workflowIdForJob('job-1'), 'reqai-job-job-1');
});

test('Temporal adapter starts idempotently on the type-specific queue', async () => {
  let start;
  const engine = new TemporalWorkflowEngine({
    namespace: 'reqai',
    taskQueues: { decomposition: 'decomposition', research: 'research' },
    connection: { close() {} },
    client: {
      workflow: {
        async start(type, options) { start = { type, options }; return { firstExecutionRunId: 'run-1' }; },
      },
    },
  });
  const execution = await engine.start({ jobId: 'job-1', type: 'RESEARCH', input: { artifactId: 'artifact-1' }, idempotencyKey: 'key-1' });
  assert.equal(start.type, 'researchWorkflow');
  assert.equal(start.options.taskQueue, 'research');
  assert.equal(start.options.workflowIdConflictPolicy, 'USE_EXISTING');
  assert.equal(execution.workflowId, 'reqai-job-job-1');
  assert.equal(execution.runId, 'run-1');
});

test('Temporal adapter normalizes signal, cancel, reset and describe operations', async () => {
  const calls = [];
  const handle = {
    async signal(name, payload) { calls.push(['signal', name, payload]); },
    async cancel() { calls.push(['cancel']); },
    async describe() { return { runId: 'run-2', status: { name: 'RUNNING' }, taskQueue: 'research' }; },
  };
  const engine = new TemporalWorkflowEngine({
    namespace: 'reqai', taskQueues: {},
    client: { workflow: { getHandle(workflowId, runId) { calls.push(['handle', workflowId, runId]); return handle; } } },
    connection: {
      workflowService: { async resetWorkflowExecution(request) { calls.push(['reset', request]); return { runId: 'run-3' }; } },
      close() {},
    },
  });
  await engine.signal({ executionId: 'job-1', signal: 'pause', payload: { reason: 'maintenance' } });
  await engine.cancel({ executionId: 'job-1' });
  const reset = await engine.reset({ executionId: 'job-1', runId: 'run-2', workflowTaskFinishEventId: 42, reason: 'operator reset', requestId: 'req-1' });
  const description = await engine.getExecution({ executionId: 'job-1', runId: 'run-3' });
  assert.equal(reset.runId, 'run-3');
  assert.equal(description.status, 'RUNNING');
  assert.ok(calls.some((call) => call[0] === 'reset' && call[1].namespace === 'reqai'));
});
