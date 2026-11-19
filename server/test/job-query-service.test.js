import assert from 'node:assert/strict';
import test from 'node:test';

import { createJobQueryService } from '../src/services/job-query-service.js';
import { initialJobMetadata } from '../src/domain/job-metadata.js';

const row = {
  id: '00000000-0000-4000-8000-000000000001',
  parent_job_id: null,
  type: 'RESEARCH',
  status: 'SUCCEEDED',
  outcome: 'PARTIAL',
  reason_code: null,
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
          step_id: 'category-3', requested_model: 'GC-Max', actual_model: 'GC-M', execution_id: 'execution-1', attempt: 1,
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

test('child history combines parent, status and owner filters', async () => {
  const { calls, service } = setup();
  const auth = { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] };
  const parentJobId = '00000000-0000-4000-8000-000000000003';
  await service.list({ auth, parentJobId, type: 'RESEARCH', status: 'SUCCEEDED', limit: 1 });
  assert.deepEqual(calls[0], { tenantId: 'tenant-a', ownerUserId: 'user-a', parentJobId, type: 'RESEARCH', status: 'SUCCEEDED', limit: 1 });
  await assert.rejects(service.list({ auth, parentJobId, groupBy: 'workflow' }), { code: 'VALIDATION_ERROR' });
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
  assert.equal(job.reasonCode, null);
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
  assert.equal(result.modelAttempts[0].executionId, 'execution-1');
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

test('metadata is deterministic, bounded, and supports unavailable input', () => {
  assert.equal(initialJobMetadata({ text: '  Комнаты\n\tи встречи ' }).title, 'Комнаты и встречи');
  assert.equal(initialJobMetadata({ name: 'brief.docx' }).title, 'brief.docx');
  assert.equal(initialJobMetadata({ type: 'RESEARCH', createdAt: '2026-01-01' }).title, 'AI-исследование · 2026-01-01');
  const metadata = initialJobMetadata({ text: 'x'.repeat(9000) });
  assert.equal(metadata.title.length, 64);
  assert.equal(metadata.summary.length, 2000);
  const longBrief = initialJobMetadata({ text: 'Организовать бронирование переговорных комнат для сотрудников компании без конфликтов и ручного согласования. Дополнительный контекст остаётся в выдержке.' });
  assert.equal(longBrief.title, 'Организовать бронирование переговорных комнат для сотрудников');
  assert.match(longBrief.summary, /Дополнительный контекст/);
});

test('grouped history binds cursor to search and filters without changing legacy response', async () => {
  const calls = [];
  const auth = { tenantId: 'a', userId: 'alice', roles: ['user'] };
  const service = createJobQueryService({ jobRepository: {
    async listWorkflows(input) { calls.push(input); return { rows: [{ ...row, title: 'Комнаты', search_summary: 'Бронирование комнат без конфликтов', children: [row], metadata_revision: 2 }, row], indexingPending: true }; },
    async listVisible() { return [row]; },
  }, config: {} });
  const input = { auth, groupBy: 'workflow', q: ' комнаты ', type: 'RESEARCH', limit: 1 };
  const page = await service.list(input);
  assert.equal(page.items[0].title, 'Комнаты');
  assert.equal(page.items[0].contextExcerpt, 'Бронирование комнат без конфликтов');
  assert.equal(page.items[0].children[0].title, 'Комнаты');
  assert.equal(page.indexingPending, true);
  assert.equal(calls[0].ownerUserId, 'alice');
  await service.list({ ...input, cursor: page.nextCursor });
  assert.equal(calls[1].beforeId, row.id);
  await assert.rejects(service.list({ ...input, q: 'другое', cursor: page.nextCursor }), { code: 'INVALID_CURSOR' });
  await assert.rejects(service.list({ auth, q: 'x'.repeat(201) }), { code: 'VALIDATION_ERROR' });
  const legacy = await service.list({ auth });
  assert.equal('title' in legacy.items[0], false);
  assert.equal('indexingPending' in legacy, false);
});

test('metadata writes validate preconditions and use trusted identity', async () => {
  const calls = [], audits = [];
  const auth = { tenantId: 'a', userId: 'alice', roles: ['user'] };
  const service = createJobQueryService({ jobRepository: {
    async updateWorkflowMetadata(input) { calls.push(input); return { id: row.id, title: input.title, metadata_revision: 4 }; },
  }, config: { process: { siteId: 'test' } }, auditRepository: { async record(value) { audits.push(value); } } });
  for (const body of [{ title: 'x' }, { title: ' ', expectedRevision: 0 }, { title: 'x', expectedRevision: -1 }, { title: 'x', expectedRevision: 0, actorId: 'bob' }, { title: 'a\nb', expectedRevision: 0 }]) {
    await assert.rejects(service.updateMetadata({ auth, jobId: row.id, body }), { code: 'VALIDATION_ERROR' });
  }
  const result = await service.updateMetadata({ auth, jobId: row.id, body: { title: ' Комнаты ', expectedRevision: 3 } });
  assert.equal(result.title, 'Комнаты');
  assert.equal(calls[0].actorId, 'alice');
  assert.equal(calls[0].ownerUserId, 'alice');
  assert.equal(audits[0].action, 'job.metadata.update');
});
