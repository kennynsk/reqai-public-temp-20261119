import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequirementsIntegrationService } from '../src/services/requirements-integration-service.js';

const auth = { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] };
const config = { jobs: { inputMaxBytes: 1024 * 1024 }, retention: { intermediateDays: 1 } };

function harness(overrides = {}) {
  const calls = [];
  let sequence = 0;
  const service = createRequirementsIntegrationService({
    config,
    uuid: () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    clock: () => new Date('2026-01-01T00:00:00Z'),
    artifactRepository: { metadata: async ({ artifactId }) => artifactId.endsWith('1') ? { id: artifactId, sha256: 'a'.repeat(64) } : null },
    requirementsVersionService: { resolveResearchSource: async ({ versionId }) => ({ versionId, inputArtifactId: versionId, parentJobId: '00000000-0000-4000-8000-000000000099', inputSha256: 'b'.repeat(64) }) },
    jobService: { create: async (value) => { calls.push(value); return { job: { id: 'job-1', status: 'ACCEPTED' }, replayed: calls.length > 1 }; } },
    ...overrides,
  });
  return { service, calls };
}

test('decomposition operation maps product DTO to a canonical job without Express objects', async () => {
  const { service, calls } = harness();
  await service.startDecomposition({ auth, idempotencyKey: 'key-0000000000001', command: { businessContext: '  Новая задача  ', promptVersion: '1.0.0' } });
  assert.equal(calls[0].body.type, 'DECOMPOSITION');
  assert.equal(calls[0].body.options.mode, 'DECOMPOSITION');
  assert.equal(calls[0].inlineArtifact.content.toString(), 'Новая задача');
});

test('inline idempotency hash is stable before random artifact allocation and changes with options', async () => {
  const { service, calls } = harness();
  const base = { auth, idempotencyKey: 'stable-key-0000001', command: { businessContext: 'Context' } };
  await service.startDecomposition(base);
  await service.startDecomposition(base);
  assert.notEqual(calls[0].body.inputArtifactId, calls[1].body.inputArtifactId);
  assert.equal(calls[0].requestHashOverride, calls[1].requestHashOverride);
  await service.startDecomposition({ ...base, command: { ...base.command, promptVersion: '1.0.0' } });
  assert.notEqual(calls[1].requestHashOverride, calls[2].requestHashOverride);
});

test('requirements research derives immutable version and parent lineage server-side', async () => {
  const { service, calls } = harness();
  const versionId = '00000000-0000-4000-8000-000000000011';
  await service.startRequirementsResearch({ auth, idempotencyKey: 'lineage-key-000001', versionId, command: {} });
  assert.equal(calls[0].body.inputArtifactId, versionId);
  assert.equal(calls[0].body.parentJobId, '00000000-0000-4000-8000-000000000099');
  assert.equal(calls[0].body.options.mode, 'REQUIREMENTS_INSIGHTS');
  await assert.rejects(() => service.startRequirementsResearch({ auth, idempotencyKey: 'lineage-key-000002', versionId, command: { parentJobId: 'evil' } }), (error) => error.code === 'VALIDATION_ERROR');
});

test('domain DTOs reject ambiguous inputs, unknown fields and unavailable artifacts', async () => {
  const { service } = harness();
  await assert.rejects(() => service.startDecomposition({ auth, idempotencyKey: 'invalid-key-000001', command: {} }), /Exactly one/);
  await assert.rejects(() => service.startDecomposition({ auth, idempotencyKey: 'invalid-key-000002', command: { businessContext: 'x', inputArtifactId: '00000000-0000-4000-8000-000000000001' } }), /Exactly one/);
  await assert.rejects(() => service.startDecomposition({ auth, idempotencyKey: 'invalid-key-000004', command: { inputArtifactId: '00000000-0000-4000-8000-000000000002' } }), (error) => error.code === 'ARTIFACT_NOT_FOUND');
  await assert.rejects(() => service.startDecomposition({ auth, idempotencyKey: 'invalid-key-000005', command: { businessContext: 'x', tenantId: 'tenant-b' } }), /unsupported fields/);
  await assert.rejects(() => service.startDecomposition({ auth, idempotencyKey: 'invalid-key-000006', command: { businessContext: 'x', withInsights: true } }), /unsupported fields/);
});
