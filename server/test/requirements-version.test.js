import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeReviewMetadata } from '../src/services/review-metadata.js';

import { RequirementsVersionRepository } from '../src/repositories/requirements-version-repository.js';
import { createRequirementsVersionService } from '../src/services/requirements-version-service.js';
import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { projectBabokRecovery } from '../src/services/babok-recovery-registry.js';
import { createBabokTextDraft } from '../src/services/babok-text-draft.js';

const auth = { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] };
const config = { process: { siteId: 'dc-a' }, retention: { finalResultsDays: 180 }, jobs: { resultMaxBytes: 104857600 } };

test('saves answers to section questions from the original recovery result', async () => {
  const manualRegistry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  manualRegistry.materials.primary = { artifactId: 'primary', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  const responses = ['Создавать заявку', 'Отменять заявку'].map((text) => JSON.stringify({
    groups: { FR: [{ id: 'FR-001', text }, { id: 'FR-002', text: 'Хранить историю' }] },
    analysis: { GAP: [{ id: 'GAP-001', text: `Кто может ${text.toLowerCase()}?`, affectedIds: ['FR-001'] }] },
  }));
  const original = { manualRegistry, recovery: { draft: createBabokTextDraft(responses) } };
  const { registry } = projectBabokRecovery(original);
  assert.equal(registry.groups.FR.length, 3);
  assert.deepEqual(registry.analysis.GAP.map(({ affectedIds }) => affectedIds), [['FR-001'], ['FR-003']]);
  const service = createRequirementsVersionService({
    config,
    jobRepository: { async findVisibleById() { return { id: 'job', type: 'DECOMPOSITION', status: 'SUCCEEDED', input_artifact_id: 'primary', result_artifact_id: 'recovery-result' }; } },
    artifactRepository: {
      async readText(input) {
        assert.deepEqual(input, { tenantId: 'tenant-a', artifactId: 'recovery-result' });
        return JSON.stringify(original);
      },
      async createText() { return { artifactId: 'new' }; },
    },
    versionRepository: { async create() { return { id: 'new', source_job_id: 'job', created_at: new Date() }; } },
  });
  const answer = { state: 'answered', answer: 'Владелец заявки' };
  const body = (gapId) => ({ sourceJobId: 'job', registry, decisions: {
    recoveryImported: true, review: { schemaVersion: 1, gaps: { [gapId]: answer } },
  } });
  await assert.rejects(service.create({ auth, body: body('GAP-404') }), { code: 'INVALID_REVIEW_METADATA' });
  const saved = await service.create({ auth, body: body('GAP-002') });
  assert.equal(saved.registry.analysis.GAP[1].text, 'Кто может отменять заявку?');
  assert.equal(saved.decisions.review.gaps['GAP-002'].answer, answer.answer);
});

test('projection-only client retains BABOK analysis and review evidence through save and reload', async () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url)));
  const review = normalizeReviewMetadata({ supplied: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'answered', answer: 'Уточнение' } }, completeness: { check: true } }, content: registry, allowedGaps: registry.analysis.GAP, contextId: 'primary-artifact', actorId: 'original-reviewer', now: new Date('2026-01-01') });
  const base = { kind: 'REQUIREMENTS_VERSION', registry, decisions: { review }, businessContextArtifactId: 'primary-artifact' };
  let stored;
  const service = createRequirementsVersionService({ config,
    jobRepository: { async findVisibleById() { return { id: 'job', type: 'DECOMPOSITION', status: 'SUCCEEDED', input_artifact_id: 'primary-artifact' }; } },
    artifactRepository: { async metadata() { return {}; }, async readText({ artifactId }) { return JSON.stringify(artifactId === 'base' ? base : stored); }, async createText(value) { stored = JSON.parse(value.text); return { artifactId: 'new' }; } },
    versionRepository: { async findVisibleById({ id }) { return { id, source_job_id: 'job', created_at: new Date() }; }, async create(value) { return { id: 'new', source_job_id: 'job', base_version_id: value.baseVersionId, created_at: new Date() }; } },
  });
  const requirements = Object.fromEntries(Object.entries({ business: 'BR', functional: 'FR', nonfunctional: 'NFR' }).map(([key, type]) => [key, registry.groups[type].map(({ id, text }) => ({ id, text }))]));
  requirements.functional[0].text = 'Ручная правка старым клиентом';
  await service.create({ auth, body: { sourceJobId: 'job', baseVersionId: 'base', requirements } });
  const reloaded = await service.get({ auth, versionId: 'new' });
  assert.equal(reloaded.registry.groups.FR[0].text, requirements.functional[0].text);
  for (const type of ['SR', 'TR', 'CON']) assert.deepEqual(reloaded.registry.groups[type], registry.groups[type]);
  assert.deepEqual(reloaded.registry.analysis, registry.analysis);
  assert.deepEqual(reloaded.decisions.review.gaps, review.gaps);
  assert.equal(reloaded.decisions.review.completeness.stale, true);
  assert.equal(reloaded.decisions.review.completeness.actorUserId, 'original-reviewer');
  assert.notEqual(base.registry.groups.FR[0].text, requirements.functional[0].text);
});

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
  assert.equal(versionInput.event.type, 'requirements.version-created');
  assert.deepEqual(versionInput.event.payload, {
    jobId: '00000000-0000-4000-8000-000000000001',
    versionId: '00000000-0000-4000-8000-000000000002',
    baseVersionId: null,
    researchJobId: null,
    occurredAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(auditInput.action, 'requirements.version.create');
});

test('reviewed BABOK registry persists complete analysis, material lineage and legacy projection', async () => {
  let storedEnvelope; let createdVersion;
  const registry = createEmptyBabokRegistry();
  const service = createRequirementsVersionService({
    config,
    clock: () => new Date('2026-01-03T00:00:00Z'),
    jobRepository: {
      async findVisibleById() {
        return {
          id: 'job-babok', type: 'DECOMPOSITION', status: 'SUCCEEDED', input_artifact_id: 'primary-artifact',
          configuration_snapshot: {
            materials: { primary: { artifactId: 'primary-artifact' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
            promptProfile: { id: 'requirements-decomposition', version: '2.0.0' },
            babokSkillProfile: { id: 'babok-requirements-v3', version: '1.0.0', release: 'babok-requirements.v1', manifestHash: 'a'.repeat(64) },
          },
        };
      },
    },
    artifactRepository: { async createText(value) { storedEnvelope = JSON.parse(value.text); return { artifactId: 'version-babok' }; } },
    versionRepository: { async create(value) { createdVersion = value; return { ...value, id: 'version-babok', source_job_id: value.sourceJobId, base_version_id: null, research_job_id: null, created_at: new Date('2026-01-03T00:00:00Z') }; } },
    auditRepository: { async record(value) { assert.equal(value.metadata.sourceJobId, 'job-babok'); } },
  });
  const result = await service.create({ auth, requestId: 'request-babok', body: { sourceJobId: 'job-babok', registry } });
  assert.equal(storedEnvelope.schemaVersion, 2);
  assert.equal(storedEnvelope.contentSchemaVersion, 'babok-requirements.v1');
  assert.deepEqual(storedEnvelope.registry, registry);
  assert.deepEqual(storedEnvelope.analysisContext.analysis, registry.analysis);
  assert.equal(storedEnvelope.materialLineage.primaryArtifactId, 'primary-artifact');
  assert.deepEqual(result.registry, registry);
  assert.equal(result.contentSchemaVersion, 'babok-requirements.v1');
  assert.equal(createdVersion.baseVersionId, null);
});

test('manual versions never preserve client-supplied semantic certificates for edited requirements', async () => {
  const registry = createEmptyBabokRegistry();
  registry.semanticValidation = { status: 'PASSED', contentHash: 'forged-or-stale' };
  let stored;
  const service = createRequirementsVersionService({ config,
    jobRepository: { findVisibleById: async () => ({ id: 'job', type: 'DECOMPOSITION', status: 'SUCCEEDED', input_artifact_id: 'primary' }) },
    artifactRepository: { createText: async ({ text }) => { stored = JSON.parse(text); return { artifactId: 'version' }; } },
    versionRepository: { create: async () => ({ id: 'version', source_job_id: 'job', created_at: new Date() }) },
  });
  await service.create({ auth, body: { sourceJobId: 'job', registry } });
  assert.equal(stored.registry.semanticValidation, undefined);
  assert.equal(registry.semanticValidation.contentHash, 'forged-or-stale');
});

test('BABOK revisions retain immutable base links and manual decision metadata', async () => {
  let storedEnvelope;
  const registry = createEmptyBabokRegistry();
  const baseRegistry = createEmptyBabokRegistry();
  const service = createRequirementsVersionService({
    config,
    clock: () => new Date('2026-01-04T00:00:00Z'),
    jobRepository: { async findVisibleById() { return { id: 'job-revision', type: 'DECOMPOSITION', status: 'SUCCEEDED', input_artifact_id: 'primary' }; } },
    versionRepository: {
      async findVisibleById() { return { id: 'base-version', source_job_id: 'job-revision', base_version_id: null, research_job_id: null, created_at: new Date() }; },
      async create(value) { return { ...value, id: 'new-version', source_job_id: value.sourceJobId, base_version_id: value.baseVersionId, research_job_id: null, created_at: new Date('2026-01-04T00:00:00Z') }; },
    },
    artifactRepository: {
      async metadata() { return { id: 'base-version', sha256: 'a'.repeat(64) }; },
      async readText() { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', schemaVersion: 2, sourceJobType: 'DECOMPOSITION', registry: baseRegistry, requirements: { business: [], functional: [], nonfunctional: [] } }); },
      async createText(value) { storedEnvelope = JSON.parse(value.text); return { artifactId: 'new-version' }; },
    },
  });
  const result = await service.create({
    auth, requestId: 'revision-request',
    body: { sourceJobId: 'job-revision', baseVersionId: 'base-version', registry, decisions: { accepted: ['GAP-001'] }, editedRecordIds: ['BR-001', 'BR-001'] },
  });
  assert.equal(result.baseVersionId, 'base-version');
  assert.equal(storedEnvelope.revision.kind, 'MANUAL_REVIEW');
  assert.equal(storedEnvelope.revision.baseVersionId, 'base-version');
  assert.deepEqual(storedEnvelope.revision.manualDecisionMetadata.editedRecordIds, ['BR-001']);
  assert.deepEqual(storedEnvelope.revision.manualDecisionMetadata.decisionKeys, ['accepted']);
});

test('requirements version and its realtime event are committed with one ordered job sequence', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO "reqai".requirements_versions')) {
        return { rows: [{ id: 'version-2', source_job_id: 'job-1' }] };
      }
      if (sql.includes('UPDATE "reqai".jobs')) return { rows: [{ sequence: 7 }] };
      return { rows: [] };
    },
    release() {},
  };
  const repository = new RequirementsVersionRepository({ connect: async () => client });
  await repository.create({
    tenantId: 'tenant-a', ownerUserId: 'user-a', id: 'version-2', sourceJobId: 'job-1',
    event: { type: 'requirements.version-created', payload: { jobId: 'job-1', versionId: 'version-2' } },
  });
  const eventCall = calls.find(({ sql }) => sql.includes('INSERT INTO "reqai".outbox_events'));
  assert.equal(eventCall.params[2], 'job-1');
  assert.equal(eventCall.params[3], 7);
  assert.equal(eventCall.params[4], 'requirements.version-created');
  assert.ok(calls.some(({ sql }) => sql === 'COMMIT'));
});

test('publishing final research locks the parent, rejects a superseded base and notifies both jobs', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT v.*')) return { rows: [{ id: 'current-final' }] };
      if (sql.includes('INSERT INTO "reqai".requirements_versions')) return { rows: [{ id: 'next-final' }] };
      if (sql.includes('UPDATE "reqai".jobs')) return { rows: [{ sequence: 7 }] };
      return { rows: [] };
    },
    release() {},
  };
  const repository = new RequirementsVersionRepository({ connect: async () => client });
  const save = (baseVersionId) => repository.create({
    tenantId: 'tenant-a', ownerUserId: 'user-a', workflowOwnerId: 'user-a', id: 'next-final',
    workflowJobId: 'parent', sourceJobId: 'research', researchJobId: 'research', baseVersionId,
    event: { type: 'requirements.version-created', payload: { jobId: 'research', versionId: 'next-final' } },
  });
  await assert.rejects(() => save('old-final'), { code: 'WORKFLOW_FINAL_CONFLICT' });
  assert.equal(calls.find(({ sql }) => sql.includes('FOR UPDATE')).params[1], 'parent');
  assert.ok(calls.some(({ sql }) => sql === 'ROLLBACK'));
  assert.ok(calls.every(({ sql }) => !sql.includes('INSERT INTO')));
  calls.length = 0;
  await save('current-final');
  const events = calls.filter(({ sql }) => sql.includes('.outbox_events')).map(({ params }) => [params[2], JSON.parse(params[5]).jobId]);
  assert.deepEqual(events, [['research', 'research'], ['parent', 'parent']]);
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

test('requirements research source resolver returns server-authoritative immutable lineage', async () => {
  const service = createRequirementsVersionService({
    config,
    jobRepository: { async findVisibleById() { return { id: 'parent', type: 'DECOMPOSITION', status: 'SUCCEEDED' }; } },
    versionRepository: { async findVisibleById() { return { id: 'version', source_job_id: 'parent', created_at: new Date() }; } },
    artifactRepository: {
      async metadata() { return { id: 'version', sha256: 'a'.repeat(64) }; },
      async readText() { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', sourceJobType: 'DECOMPOSITION', requirements: { business: [], functional: [], nonfunctional: [] } }); },
    },
  });
  assert.deepEqual(await service.resolveResearchSource({ auth, versionId: 'version' }), {
    versionId: 'version', inputArtifactId: 'version', parentJobId: 'parent', inputSha256: 'a'.repeat(64),
  });
});

test('job versions and the current workflow final restore independently after reload', async () => {
  const created_at = new Date('2026-01-01T00:00:00Z');
  const linked = { id: 'linked-final', source_job_id: 'research', research_job_id: 'research', created_at };
  const service = createRequirementsVersionService({
    config,
    jobRepository: { async findVisibleById() { return { id: 'job', type: 'DECOMPOSITION', status: 'SUCCEEDED' }; } },
    versionRepository: {
      async listVisibleByJob() { return [{ id: 'version', source_job_id: 'job', base_version_id: null, research_job_id: null, created_at }]; },
      async findWorkflowFinal(scope) { assert.deepEqual(scope, { tenantId: 'tenant-a', ownerUserId: 'user-a', workflowJobId: 'job' }); return linked; },
      async findVisibleById({ id }) { assert.equal(id, linked.id); return linked; },
    },
    artifactRepository: {
      async metadata() { return { id: linked.id }; },
      async readText({ artifactId }) { return JSON.stringify({ kind: 'REQUIREMENTS_VERSION', requirements: { business: [{ id: 'BT-1', text: 'Сохранённая правка' }], functional: artifactId === linked.id ? [{ id: 'FT-1', text: 'Принятое предложение' }] : [], nonfunctional: [] }, decisions: {} }); },
    },
  });
  const result = await service.list({ auth, jobId: 'job' });
  assert.equal(result.items[0].requirements.business[0].text, 'Сохранённая правка');
  assert.equal(result.items[0].requirements.functional.length, 0);
  assert.equal(result.workflowFinal.requirements.functional[0].text, 'Принятое предложение');
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

test('saving cannot promote a historical invalid BR using an old or forged passed certificate', async () => {
  const registry = createEmptyBabokRegistry();
  registry.materials.primary = { artifactId: 'primary', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  registry.groups.BR = [{ id: 'BR-001', text: 'Обеспечить расчёты между покупателем и продавцом, при которых деньги резервируются до выполнения условий.', successIndicator: null, relatedIds: [], source: { artifactId: 'primary', locator: '§1', quote: 'деньги резервируются до выполнения условий' }, provenance: 'Извлечено', quality: 'Готово' }];
  registry.summary.counts.BR = 1;
  registry.semanticValidation = { status: 'PASSED' };
  const service = createRequirementsVersionService({ config, jobRepository: { findVisibleById: async () => ({ id: 'old-job', status: 'SUCCEEDED', type: 'DECOMPOSITION' }) } });
  await assert.rejects(service.create({ auth, body: { sourceJobId: 'old-job', registry } }), (error) => error.code === 'BABOK_SEMANTIC_INVALID' && error.details.issues[0].code === 'BR_IS_SOLUTION_SCOPE');
});
