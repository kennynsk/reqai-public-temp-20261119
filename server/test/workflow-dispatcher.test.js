import assert from 'node:assert/strict';
import test from 'node:test';

import { createWorkflowDispatcher } from '../src/services/workflow-dispatcher.js';

test('dispatcher idempotently starts accepted workflow and records execution site', async () => {
  const calls = [];
  const event = {
    event_id: 'event-1', job_id: 'job-1', event_type: 'job.accepted', workflow_attempts: 1,
    job: { id: 'job-1', type: 'RESEARCH', input_artifact_id: 'artifact-1', configuration_snapshot: { models: ['GC-Max'] }, deadline_at: new Date() },
  };
  const dispatcher = createWorkflowDispatcher({
    tenantId: 'tenant-a', siteId: 'dc-b', clock: () => new Date('2026-01-01T00:00:00Z'),
    repository: {
      async requeueStalled(value) { calls.push(['reconcile', value]); },
      async claim() { return [event]; },
      async markStarted(value) { calls.push(['started', value]); },
      async markFailed(value) { calls.push(['failed', value]); },
    },
    workflowEngine: { async start(value) { calls.push(['engine.start', value]); } },
  });
  const result = await dispatcher.runOnce();
  assert.deepEqual(result, { claimed: 1, started: 1, failed: 0 });
  assert.equal(calls.find(([name]) => name === 'engine.start')[1].idempotencyKey, 'event-1');
  assert.equal(calls.find(([name]) => name === 'started')[1].executionSite, 'dc-b');
});

test('dispatcher persists classified retry after Temporal start failure', async () => {
  let failure;
  const dispatcher = createWorkflowDispatcher({
    tenantId: 'tenant-a', siteId: 'dc-a', clock: () => new Date('2026-01-01T00:00:00Z'),
    repository: {
      async requeueStalled() {},
      async claim() { return [{ event_id: 'event-1', job_id: 'job-1', event_type: 'job.accepted', workflow_attempts: 2, job: { id: 'job-1', type: 'DECOMPOSITION' } }]; },
      async markStarted() {},
      async markFailed(value) { failure = value; },
    },
    workflowEngine: { async start() { throw Object.assign(new Error('unavailable'), { code: 'TEMPORAL_UNAVAILABLE' }); } },
  });
  const result = await dispatcher.runOnce();
  assert.equal(result.failed, 1);
  assert.equal(failure.reasonCode, 'TEMPORAL_UNAVAILABLE');
  assert.equal(failure.retryAt.toISOString(), '2026-01-01T00:00:02.000Z');
});

test('dispatcher propagates cancellation and marks its outbox event dispatched', async () => {
  const calls = [];
  const dispatcher = createWorkflowDispatcher({
    tenantId: 'tenant-a', siteId: 'dc-a', clock: () => new Date('2026-01-01T00:00:00Z'),
    repository: {
      async requeueStalled() {},
      async claim() { return [{ event_id: 'cancel-1', job_id: 'job-1', event_type: 'job.cancel-requested', workflow_attempts: 1, job: { id: 'job-1', type: 'RESEARCH' } }]; },
      async markCancellationDispatched(value) { calls.push(['cancel.dispatched', value]); },
      async markFailed(value) { calls.push(['failed', value]); },
    },
    workflowEngine: { async cancel(value) { calls.push(['engine.cancel', value]); } },
  });
  const result = await dispatcher.runOnce();
  assert.deepEqual(result, { claimed: 1, started: 1, failed: 0 });
  assert.deepEqual(calls, [
    ['engine.cancel', { executionId: 'job-1' }],
    ['cancel.dispatched', { tenantId: 'tenant-a', eventId: 'cancel-1', jobId: 'job-1' }],
  ]);
});

test('dispatcher retries a failed cancellation without marking it dispatched', async () => {
  let failure;
  const dispatcher = createWorkflowDispatcher({
    tenantId: 'tenant-a', siteId: 'dc-a', clock: () => new Date('2026-01-01T00:00:00Z'),
    repository: {
      async requeueStalled() {},
      async claim() { return [{ event_id: 'cancel-1', job_id: 'job-1', event_type: 'job.cancel-requested', workflow_attempts: 2, job: { id: 'job-1', type: 'RESEARCH' } }]; },
      async markCancellationDispatched() { assert.fail('must not mark a failed cancellation'); },
      async markFailed(value) { failure = value; },
    },
    workflowEngine: { async cancel() { throw Object.assign(new Error('unavailable'), { code: 'TEMPORAL_UNAVAILABLE' }); } },
  });
  const result = await dispatcher.runOnce();
  assert.equal(result.failed, 1);
  assert.equal(failure.reasonCode, 'TEMPORAL_UNAVAILABLE');
});
