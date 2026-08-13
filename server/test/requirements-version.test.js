import assert from 'node:assert/strict';
import test from 'node:test';

import { createRequirementsVersionService } from '../src/services/requirements-version-service.js';

const auth = { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] };
const config = { process: { siteId: 'dc-a' }, retention: { finalResultsDays: 180 }, jobs: { resultMaxBytes: 104857600 } };

test('reviewed decomposition is persisted as an immutable requirements version', async () => {
  let artifactInput; let versionInput; let auditInput;
  const service = createRequirementsVersionService({
    config,
    clock: () => new Date('2026-01-01T00:00:00Z'),
    jobRepository: { async findVisibleById() { return { id: '00000000-0000-4000-8000-000000000001', type: 'DECOMPOSITION', status: 'SUCCEEDED', input_artifact_id: '00000000-0000-4000-8000-000000000003' }; } },
    artifactRepository: { async createText(value) { artifactInput = value; return { artifactId: '00000000-0000-4000-8000-000000000002' }; } },
    versionRepository: { async create(value) { versionInput = value; return { ...value, source_job_id: value.sourceJobId, base_version_id: null, research_job_id: null, created_at: new Date('2026-01-01T00:00:00Z') }; } },
    auditRepository: { async record(value) { auditInput = value; } },
  });
  const result = await service.create({
    auth,
    requestId: 'request-1',
    body: { sourceJobId: '00000000-0000-4000-8000-000000000001', requirements: { business: [{ id: 'BT-1', text: 'Цель' }], functional: [], nonfunctional: [] } },
  });
  assert.equal(result.versionId, '00000000-0000-4000-8000-000000000002');
  assert.equal(artifactInput.kind, 'RESULT');
  assert.equal(JSON.parse(artifactInput.text).kind, 'REQUIREMENTS_VERSION');
  assert.equal(JSON.parse(artifactInput.text).businessContextArtifactId, '00000000-0000-4000-8000-000000000003');
  assert.equal(versionInput.sourceJobId, '00000000-0000-4000-8000-000000000001');
  assert.equal(auditInput.action, 'requirements.version.create');
});

test('linked research accepts only a version owned by its completed decomposition parent', async () => {
  const jobs = {
    parent: { id: 'parent', owner_user_id: 'user-a', type: 'DECOMPOSITION', status: 'SUCCEEDED' },
  };
  const service = createRequirementsVersionService({
    config,
    jobRepository: { async findVisibleById() { return jobs.parent; } },
    versionRepository: { async findVisibleById() { return { id: 'version', source_job_id: 'parent', created_at: new Date() }; } },
    artifactRepository: {
      async metadata() { return { id: 'version' }; },
      async readText() { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', sourceJobType: 'DECOMPOSITION', requirements: { business: [], functional: [], nonfunctional: [] } }); },
    },
  });
  await assert.doesNotReject(() => service.validateResearchInput({ auth, parentJobId: 'parent', versionId: 'version' }));
  jobs.parent = { ...jobs.parent, status: 'FAILED' };
  await assert.rejects(() => service.validateResearchInput({ auth, parentJobId: 'parent', versionId: 'version' }), (error) => error.code === 'INVALID_RESEARCH_PARENT');
});

test('saved versions can restore their requirements after a page reload', async () => {
  const service = createRequirementsVersionService({
    config,
    jobRepository: { async findVisibleById() { return { id: 'job', type: 'DECOMPOSITION', status: 'SUCCEEDED' }; } },
    versionRepository: { async listVisibleByJob() { return [{ id: 'version', source_job_id: 'job', base_version_id: null, research_job_id: null, decisions: {}, created_at: new Date('2026-01-01T00:00:00Z') }]; } },
    artifactRepository: { async readText() { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', requirements: { business: [{ id: 'BT-1', text: 'Сохранённая правка' }], functional: [], nonfunctional: [] }, decisions: {} }); } },
  });
  const result = await service.list({ auth, jobId: 'job' });
  assert.equal(result.items[0].requirements.business[0].text, 'Сохранённая правка');
});

test('final version must use the immutable requirements version consumed by research', async () => {
  const service = createRequirementsVersionService({
    config,
    jobRepository: { async findVisibleById() { return { id: 'research', type: 'RESEARCH', status: 'SUCCEEDED', input_artifact_id: 'base-version' }; } },
    versionRepository: { async findVisibleById() { return { id: 'other-version', created_at: new Date() }; } },
    artifactRepository: { async metadata() { return { id: 'other-version' }; }, async readText() { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', requirements: { business: [], functional: [], nonfunctional: [] } }); } },
  });
  await assert.rejects(
    () => service.create({ auth, body: { sourceJobId: 'research', baseVersionId: 'other-version', requirements: { business: [], functional: [], nonfunctional: [] } } }),
    (error) => error.code === 'RESEARCH_VERSION_MISMATCH',
  );
});

test('manual final edits can create a new revision for the same research job', async () => {
  let storedEnvelope;
  const service = createRequirementsVersionService({
    config,
    clock: () => new Date('2026-01-02T00:00:00Z'),
    jobRepository: { async findVisibleById() { return { id: 'research', type: 'RESEARCH', status: 'SUCCEEDED', input_artifact_id: 'reviewed-input' }; } },
    versionRepository: {
      async findVisibleById() { return { id: 'final-v1', source_job_id: 'research', created_at: new Date() }; },
      async create(value) { return { ...value, source_job_id: value.sourceJobId, base_version_id: value.baseVersionId, research_job_id: value.researchJobId, created_at: new Date('2026-01-02T00:00:00Z') }; },
    },
    artifactRepository: {
      async metadata() { return { id: 'final-v1' }; },
      async readText() { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', sourceJobType: 'RESEARCH', researchJobId: 'research', businessContextArtifactId: 'context', requirements: { business: [], functional: [], nonfunctional: [] } }); },
      async createText(value) { storedEnvelope = JSON.parse(value.text); return { artifactId: 'final-v2' }; },
    },
  });
  const result = await service.create({
    auth,
    body: {
      sourceJobId: 'research',
      baseVersionId: 'final-v1',
      requirements: { business: [], functional: [{ id: 'FT-9', text: 'Уточнённая вручную формулировка', fromResearch: true, researchEnhancementKey: 'insight-1:0' }], nonfunctional: [] },
      decisions: { acceptedEnhancementKeys: ['insight-1:0'] },
    },
  });
  assert.equal(result.baseVersionId, 'final-v1');
  assert.equal(result.requirements.functional[0].researchEnhancementKey, 'insight-1:0');
  assert.equal(storedEnvelope.businessContextArtifactId, 'context');
});
