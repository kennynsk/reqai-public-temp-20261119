import assert from 'node:assert/strict';
import test from 'node:test';

import { createJobQueryService } from '../src/services/job-query-service.js';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  parent_job_id: null,
  type: 'RESEARCH',
  status: 'SUCCEEDED',
  outcome: 'PARTIAL',
  progress: '100.00',
  current_step: 'synthesis',
  message: 'One category failed; partial result returned',
  configuration_snapshot: { featureMode: 'AGENT_RESEARCH' },
  result_artifact_id: '00000000-0000-4000-8000-000000000002',
  created_at: new Date('2026-01-01T00:00:00Z'),
  started_at: new Date('2026-01-01T00:00:05Z'),
  completed_at: new Date('2026-01-01T01:00:00Z'),
  updated_at: new Date('2026-01-01T01:00:00Z'),
};

function setup() {
  const calls = [];
  const audits = [];
  const jobRepository = {
    async listVisible(input) { calls.push(input); return [row]; },
    async findVisibleById(input) { calls.push(input); return row; },
    async getResult(input) {
      calls.push(input);
      return {
        job: row,
        steps: [{ step_id: 'category-3', step_type: 'RESEARCH_CATEGORY', status: 'FAILED', summary: { reasonCode: 'MODEL_TIMEOUT' } }],
        attempts: [{
          step_id: 'category-3', requested_model: 'GC-Max', actual_model: 'GC-M', attempt: 1,
          status: 'FAILED', reason_code: 'MODEL_TIMEOUT', input_tokens: '100', output_tokens: '0', duration_ms: '300000',
        }],
      };
    },
  };
  const service = createJobQueryService({
    jobRepository,
    auditRepository: { async record(value) { audits.push(value); } },
    config: { process: { siteId: 'dc-a' } },
  });
  return { calls, audits, service };
}

test('ordinary user history is owner-scoped and privileged history is tenant-scoped', async () => {
  const { calls, service } = setup();
  await service.list({ auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] }, limit: 20 });
  await service.list({ auth: { tenantId: 'tenant-a', userId: 'admin-a', roles: ['tenant-admin'] }, limit: 20 });
  assert.equal(calls[0].ownerUserId, 'user-a');
  assert.equal(calls[1].ownerUserId, null);
});

test('REST reconciliation exposes the latest milestone and execution timestamps', async () => {
  const { service } = setup();
  const job = await service.get({ auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] }, jobId: row.id });
  assert.equal(job.progress, 100);
  assert.equal(job.currentStep, 'synthesis');
  assert.equal(job.message, 'One category failed; partial result returned');
  assert.equal(job.startedAt, '2026-01-01T00:00:05.000Z');
  assert.equal(job.completedAt, '2026-01-01T01:00:00.000Z');
  assert.equal(job.mode, 'AGENT_RESEARCH');
});

test('partial result exposes actual model and fallback reason and audits the read', async () => {
  const { audits, service } = setup();
  const result = await service.result({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    jobId: row.id,
    requestId: 'req-1',
  });
  assert.equal(result.outcome, 'PARTIAL');
  assert.equal(result.modelAttempts[0].requestedModel, 'GC-Max');
  assert.equal(result.modelAttempts[0].model, 'GC-M');
  assert.equal(result.modelAttempts[0].reasonCode, 'MODEL_TIMEOUT');
  assert.equal(audits[0].action, 'job.result.view');
});

test('unfinished job result returns a retryable conflict', async () => {
  const service = createJobQueryService({
    jobRepository: { async getResult() { return { job: { status: 'RUNNING' }, steps: [], attempts: [] }; } },
    config: { process: { siteId: 'dc-a' } },
  });
  await assert.rejects(
    () => service.result({ auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] }, jobId: row.id }),
    (error) => error.code === 'RESULT_NOT_READY' && error.retryable,
  );
});
