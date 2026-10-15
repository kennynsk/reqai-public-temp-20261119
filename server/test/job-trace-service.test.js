import assert from 'node:assert/strict';
import test from 'node:test';

import { createJobTraceService } from '../src/services/job-trace-service.js';

const jobId = '00000000-0000-4000-8000-000000000001';
const entryId = '00000000-0000-4000-8000-000000000002';

function setup(overrides = {}) {
  const audits = [];
  const snapshot = {
    job: { id: jobId, owner_user_id: 'user-a', type: 'DECOMPOSITION', status: 'RUNNING', outcome: null, current_step: 'validate', configuration_snapshot: { featureMode: 'DECOMPOSITION' }, created_at: '2026-01-01T00:00:00Z', started_at: '2026-01-01T00:00:01Z' },
    steps: [{ job_id: jobId, step_id: 'validate', step_type: 'validate', status: 'RUNNING', outcome: null, input_hash: 'hash', summary: { prompt: 'private', safe: 'ok' }, attempt_count: 1, created_at: '2026-01-01T00:00:01Z', started_at: '2026-01-01T00:00:01Z' }],
    attempts: [{ id: 'attempt-1', step_id: 'validate', requested_model: 'm1', actual_model: 'm2', attempt: 1, status: 'FAILED', reason_code: 'TIMEOUT', provider_request_id: 'provider-1', execution_site: 'dc-a', input_tokens: 10, output_tokens: 0, duration_ms: 250, started_at: '2026-01-01T00:00:02Z', completed_at: '2026-01-01T00:00:02.250Z' }],
    events: [{ event_id: 'event-1', event_type: 'job.accepted', schema_version: '1.0', sequence: 1, payload: { jobId, content: 'private' }, created_at: '2026-01-01T00:00:00Z' }],
    versions: [], entries: [{ id: entryId, sequence: 1, category: 'INSTRUCTIONS', name: 'Skill', status: 'INFO', metadata: { authorization: 'secret', skillUsage: 'NOT_APPLICABLE' }, detail_artifact_id: null, detail_visibility: 'METADATA', created_at: '2026-01-01T00:00:00.500Z' }],
  };
  const repository = {
    async snapshot(input) { repository.snapshotInput = input; return overrides.snapshot === undefined ? snapshot : overrides.snapshot; },
    async findVisibleEntry(input) { repository.detailInput = input; return overrides.entry || snapshot.entries[0]; },
  };
  const service = createJobTraceService({
    config: { process: { siteId: 'dc-a' }, diagnostics: { maxPageSize: 2, maxDetailBytes: 1024 } },
    jobTraceRepository: repository,
    artifactRepository: overrides.artifactRepository || {},
    auditRepository: { async record(value) { audits.push(value); } },
  });
  return { service, repository, audits };
}

test('trace composes durable sources in order, paginates and redacts sensitive metadata', async () => {
  const { service, repository, audits } = setup();
  const auth = { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] };
  const first = await service.trace({ auth, jobId, limit: 2, requestId: 'request-1' });
  assert.equal(repository.snapshotInput.ownerUserId, 'user-a');
  assert.equal(first.jobId, jobId);
  assert.equal(first.timeline.length, 2);
  assert.ok(first.nextCursor);
  assert.equal(first.timeline[0].source, 'SERVER_EVENT');
  assert.equal(first.timeline[0].metadata.payload.content, '[REDACTED]');
  const second = await service.trace({ auth, jobId, limit: 2, cursor: first.nextCursor });
  assert.equal(second.timeline.length, 2);
  assert.equal(audits[0].action, 'job.trace.view');
});

test('trace uses not-found behavior for invisible jobs and rejects invalid bounds', async () => {
  const auth = { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] };
  await assert.rejects(() => setup({ snapshot: null }).service.trace({ auth, jobId, limit: 2 }), (error) => error.code === 'JOB_NOT_FOUND');
  await assert.rejects(() => setup().service.trace({ auth, jobId, limit: 3 }), (error) => error.code === 'VALIDATION_ERROR');
  await assert.rejects(() => setup().service.trace({ auth, jobId, limit: 2, cursor: 'invalid' }), (error) => error.code === 'INVALID_CURSOR');
});

test('regular owner sees redacted detail while privileged reads are audited and redacted again', async () => {
  const regular = setup();
  assert.deepEqual(await regular.service.detail({ auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] }, jobId, entryId }), { entryId, state: 'REDACTED', content: null });

  const privileged = setup({
    entry: { ...setup().repository, id: entryId, detail_visibility: 'PRIVILEGED', detail_kind: 'PROMPT', detail_artifact_id: 'artifact-1', expires_at: null },
    artifactRepository: {
      async metadata() { return { content_type: 'application/json' }; },
      async readText() { return JSON.stringify({ prompt: 'private prompt', model: 'm1', apiKey: 'secret' }); },
    },
  });
  const result = await privileged.service.detail({ auth: { tenantId: 'tenant-a', userId: 'operator-a', roles: ['operator'] }, jobId, entryId, requestId: 'request-2' });
  assert.equal(result.state, 'AVAILABLE');
  assert.deepEqual(result.content, { prompt: '[REDACTED]', model: 'm1', apiKey: '[REDACTED]' });
  assert.equal(privileged.audits[0].action, 'job.trace.detail.view');
});

test('stack detail is system-admin only and expired content stays explicit', async () => {
  const operator = setup({ entry: { id: entryId, detail_visibility: 'SYSTEM_ADMIN', detail_kind: 'ERROR_STACK', detail_artifact_id: 'artifact-1' } });
  await assert.rejects(() => operator.service.detail({ auth: { tenantId: 'tenant-a', userId: 'operator-a', roles: ['operator'] }, jobId, entryId }), (error) => error.code === 'TRACE_DETAIL_FORBIDDEN');
  const expired = setup({ entry: { id: entryId, detail_visibility: 'SYSTEM_ADMIN', detail_kind: 'ERROR_STACK', detail_artifact_id: 'artifact-1', expires_at: '2020-01-01T00:00:00Z' } });
  assert.equal((await expired.service.detail({ auth: { tenantId: 'tenant-a', userId: 'admin-a', roles: ['system-admin'] }, jobId, entryId })).state, 'EXPIRED');
});

test('historical model reasons are redacted on ordinary trace reads', async () => {
  const marker = 'PRIVATE_REQUIREMENT_тест';
  const { service } = setup({ snapshot: { job: { id: jobId, type: 'DECOMPOSITION', status: 'FAILED', configuration_snapshot: {}, created_at: '2026-01-01T00:00:00Z' }, steps: [], attempts: [], events: [], versions: [], entries: [{ id: entryId, sequence: 1, category: 'ERROR', name: 'validation', status: 'FAILED', metadata: { issues: [{ key: '$', code: 'SOURCE_LOSS', reason: marker }], message: marker }, created_at: '2026-01-01T00:00:00Z' }] } });
  const result = await service.trace({ auth: { tenantId: 't', userId: 'u', roles: ['user'] }, jobId, limit: 2 });
  assert.equal(JSON.stringify(result).includes(marker), false);
  assert.equal(result.timeline[0].metadata.issues[0].code, 'SOURCE_LOSS');
});
