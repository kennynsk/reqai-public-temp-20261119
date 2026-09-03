import assert from 'node:assert/strict';
import test from 'node:test';
import { createCheckpointedActivities } from '../src/activities/checkpointed-activities.js';

test('expensive activity returns persisted checkpoint without repeating handler', async () => {
  let calls = 0;
  const activities = createCheckpointedActivities({
    siteId: 'dc-a', heartbeatFn() {},
    handlers: { async validateInput() { calls += 1; return { valid: true }; } },
    jobRepository: { async findCheckpoint() { return { summary: { valid: true }, result_artifact_id: null }; }, async saveCheckpoint() { throw new Error('must not save replay'); } },
  });
  const result = await activities.validateInput({ tenantId: 't', jobId: 'j', inputArtifactId: 'a' });
  assert.equal(result.checkpointReplayed, true); assert.equal(calls, 0);
});

test('new activity heartbeats and saves checkpoint after successful handler', async () => {
  const events = [];
  const activities = createCheckpointedActivities({
    siteId: 'dc-b', heartbeatFn(value) { events.push(['heartbeat', value]); },
    handlers: { async decomposeChunk() { events.push(['handler']); return { artifactId: 'result-a', success: true }; } },
    jobRepository: { async findCheckpoint() { return null; }, async saveCheckpoint(value) { events.push(['checkpoint', value]); } },
  });
  await activities.decomposeChunk({ tenantId: 't', jobId: 'j', chunk: { chunkId: 'c1', artifactId: 'a1' } });
  assert.deepEqual(events.map(([name]) => name), ['heartbeat', 'checkpoint', 'handler', 'checkpoint']);
  assert.equal(events[1][1].status, 'RUNNING');
  assert.equal(events[3][1].stepId, 'decompose-chunk:c1');
});

test('finalization records COMPLETE, PARTIAL or FAILED and result artifact', async () => {
  const transitions = [];
  const activities = createCheckpointedActivities({ siteId: 'dc-a', handlers: {}, jobRepository: { async transition(value) { transitions.push(value); return value; } } });
  await activities.finalizeSucceeded({ tenantId: 't', jobId: 'j1', successfulUnits: 2, failedUnits: 0, resultArtifactId: 'r1' });
  await activities.finalizeSucceeded({ tenantId: 't', jobId: 'j2', successfulUnits: 1, failedUnits: 2, resultArtifactId: 'r2' });
  await activities.finalizeSucceeded({ tenantId: 't', jobId: 'j3', successfulUnits: 0, failedUnits: 2, resultArtifactId: null });
  assert.deepEqual(transitions.map((x) => [x.toStatus, x.outcome]), [['SUCCEEDED','COMPLETE'],['SUCCEEDED','PARTIAL'],['FAILED',null]]);
  assert.equal(transitions[1].patch.resultArtifactId, 'r2');
});

test('checkpoint activities publish confirmed user-facing milestones without fabricating model progress', async () => {
  const progress = [];
  const activities = createCheckpointedActivities({
    siteId: 'dc-a', heartbeatFn() {},
    handlers: {
      async generateRequirementsInsights() { return { artifactId: 'insights' }; },
    },
    jobRepository: {
      async findCheckpoint() { return null; },
      async saveCheckpoint() {},
      async updateProgress(value) { progress.push(value); return { job: value, replayed: false }; },
    },
  });
  await activities.generateRequirementsInsights({ tenantId: 't', jobId: 'j' });
  assert.deepEqual(progress.map(({ progress: value, currentStep }) => [value, currentStep]), [[20, 'model'], [90, 'assembly']]);
  assert.match(progress[0].message, /AI анализирует/);
});

test('decomposition merge reserves the 70-to-90 range before persistence', async () => {
  const progress = [];
  const activities = createCheckpointedActivities({
    siteId: 'dc-a', heartbeatFn() {},
    handlers: { async mergeDecomposition() { return { artifactId: 'merged' }; } },
    jobRepository: {
      async findCheckpoint() { return null; },
      async saveCheckpoint() {},
      async updateProgress(value) { progress.push(value); return { job: value, replayed: false }; },
    },
  });
  await activities.mergeDecomposition({ tenantId: 't', jobId: 'j' });
  assert.deepEqual(progress.map(({ progress: value, currentStep }) => [value, currentStep]), [[70, 'assembly'], [90, 'persistence']]);
});

test('replayed checkpoint restores its completed milestone without executing the handler', async () => {
  const progress = [];
  const activities = createCheckpointedActivities({
    siteId: 'dc-a', heartbeatFn() {}, handlers: { async mergeDecomposition() { throw new Error('must not execute'); } },
    jobRepository: {
      async findCheckpoint() { return { summary: { complete: true }, result_artifact_id: 'result' }; },
      async saveCheckpoint() {},
      async updateProgress(value) { progress.push(value); return { job: value, replayed: false }; },
    },
  });
  const result = await activities.mergeDecomposition({ tenantId: 't', jobId: 'j' });
  assert.equal(result.checkpointReplayed, true);
  assert.deepEqual(progress.map(({ progress: value, currentStep }) => [value, currentStep]), [[90, 'persistence']]);
});

test('contract failures are checkpointed with a safe reason and marked non-retryable', async () => {
  const checkpoints = [];
  const diagnostics = [];
  const activities = createCheckpointedActivities({
    siteId: 'dc-a', heartbeatFn() {},
    diagnosticCapture: { async capture(value) { diagnostics.push(value); } },
    handlers: { async decomposeChunk() { throw Object.assign(new Error('invalid output at $.context[0].provenance'), { type: 'OUTPUT_CONTRACT_VIOLATION', code: 'BABOK_OUTPUT_INVALID', details: { path: '$.context[0].provenance', reason: 'expected an enum value' } }); } },
    jobRepository: {
      async findCheckpoint() { return null; },
      async saveCheckpoint(value) { checkpoints.push(value); },
    },
  });

  await assert.rejects(
    () => activities.decomposeChunk({ tenantId: 't', ownerUserId: 'u', jobId: 'j', chunk: { chunkId: 'c1', artifactId: 'a1' } }),
    (error) => error.type === 'OUTPUT_CONTRACT_VIOLATION' && error.nonRetryable === true,
  );
  assert.deepEqual(checkpoints.at(-1).summary, { reasonCode: 'OUTPUT_CONTRACT_VIOLATION', details: { path: '$.context[0].provenance', reason: 'expected an enum value' } });
  assert.equal(diagnostics.at(-1).content.reasonCode, 'OUTPUT_CONTRACT_VIOLATION');
});
