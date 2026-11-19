import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnterpriseActivityHandlers } from '../src/activities/enterprise-handlers.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../src/prompts/prompt-profile-resolver.js';
import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { createBabokSkillBundleLoader, defaultBabokSkillBundleRoot, qualifyBabokSkillBundle } from '../src/skills/babok-skill-bundle.js';

const babokSkillLoader = createBabokSkillBundleLoader({ rootDir: defaultBabokSkillBundleRoot() });
const babokSkillProfile = qualifyBabokSkillBundle({ loader: babokSkillLoader, policy: { active: '1.0.0', released: ['1.0.0'] } });

test('BABOK extraction adapter includes source, baseline and references and persists validated evidence', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({
    catalog,
    policy: { 'requirements-decomposition': { active: '2.2.0', released: ['2.2.0'] } },
  }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const primaryId = '00000000-0000-4000-8000-000000000099';
  const baselineId = '00000000-0000-4000-8000-000000000098';
  const referenceId = '00000000-0000-4000-8000-000000000097';
  const chunkId = '00000000-0000-4000-8000-000000000096';
  const source = 'Проблема: сократить срок обработки заявок.';
  const stored = [];
  const texts = new Map([[chunkId, source], [baselineId, 'Baseline: текущий процесс.'], [referenceId, 'Справочник терминов.']]);
  const registry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  registry.materials.primary = { artifactId: primaryId, role: 'primary', name: 'primary', sha256: 'a'.repeat(64), status: 'AVAILABLE' };
  registry.scope.partial = true;
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    babokSkillLoader,
    artifactRepository: {
      async readText({ artifactId }) { return texts.get(artifactId) || ''; },
      async createText({ text, contentType }) { stored.push({ text, contentType }); return { artifactId: `saved-${stored.length}`, sizeBytes: text.length, sha256: 'b'.repeat(64) }; },
    },
    modelExecutor: {
      async execute({ messages }) {
        assert.match(messages.at(-1).content, /babok-requirements\.v1/);
        assert.match(messages.at(-1).content, /Baseline: текущий процесс/);
        assert.match(messages.at(-1).content, /Справочник терминов/);
        assert.match(messages.at(-1).content, /сократить срок обработки/);
        assert.match(messages.at(-1).content, /Не\s+объединяй альтернативные результаты/);
        assert.match(messages.at(-1).content, /Будущее временное действие перехода/);
        return { text: JSON.stringify(registry), actualModel: 'test-model', fallbackApplied: false };
      },
    },
    config: {
      process: { siteId: 'test' },
      retention: { intermediateDays: 1, finalResultsDays: 1 },
      jobs: { resultMaxBytes: 1024 * 1024 },
      llm: { chunkTargetTokens: 1000, chunkConcurrency: 1, retryInitialDelayMs: 1, retryMaxDelayMs: 1 },
    },
  });
  const result = await handlers.decomposeChunk({
    tenantId: 'tenant-a',
    ownerUserId: 'user-a',
    jobId: 'job-a',
    deadlineAt: new Date(Date.now() + 60_000),
    traceContext: {},
    chunk: { chunkId: 'chunk-1', artifactId: chunkId },
    configurationSnapshot: {
      models: ['test-model'],
      maxAttemptsPerModel: 1,
      requestTimeoutMs: 1000,
      maxConcurrency: 1,
      temperature: 0.1,
      promptProfile: profile,
      babokSkillProfile,
      materials: {
        primary: { artifactId: primaryId, role: 'primary', name: 'primary', sha256: 'a'.repeat(64), status: 'AVAILABLE' },
        baseline: { status: 'AVAILABLE', artifacts: [{ artifactId: baselineId, role: 'baseline', name: 'baseline', sha256: 'a'.repeat(64), status: 'AVAILABLE' }] },
        references: [{ artifactId: referenceId, role: 'reference', name: 'reference', sha256: 'a'.repeat(64), status: 'AVAILABLE' }],
      },
    },
  });
  assert.equal(result.success, true);
  assert.equal(stored[0].contentType, 'application/json; charset=utf-8');
  const persisted = JSON.parse(stored[0].text);
  assert.equal(persisted.schemaVersion, 'babok-requirements.v1');
  assert.equal(persisted.materials.baseline.status, 'AVAILABLE');
  assert.equal(persisted.scope.units[0].artifactId, chunkId);
});

test('BABOK execution rejects a skill bundle that does not match the immutable job snapshot', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({
    catalog,
    policy: { 'requirements-decomposition': { active: '2.0.0', released: ['2.0.0'] } },
  }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const primaryId = '00000000-0000-4000-8000-000000000095';
  const chunkId = '00000000-0000-4000-8000-000000000094';
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    babokSkillLoader,
    artifactRepository: { async readText() { return 'Контекст'; } },
    modelExecutor: { async execute() { throw new Error('model must not be called'); } },
    config: {
      process: { siteId: 'test' },
      retention: { intermediateDays: 1, finalResultsDays: 1 },
      jobs: { resultMaxBytes: 1024 * 1024 },
      llm: { chunkTargetTokens: 1000, chunkConcurrency: 1, retryInitialDelayMs: 1, retryMaxDelayMs: 1 },
    },
  });
  await assert.rejects(() => handlers.decomposeChunk({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-skill-mismatch', deadlineAt: new Date(Date.now() + 60_000), traceContext: {},
    chunk: { chunkId: 'chunk-skill-mismatch', artifactId: chunkId },
    configurationSnapshot: {
      models: ['test-model'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: 1, temperature: 0.1, promptProfile: profile,
      babokSkillProfile: { ...babokSkillProfile, manifestHash: '0'.repeat(64) },
      materials: { primary: { artifactId: primaryId, role: 'primary', name: null, sha256: null, status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    },
  }), (error) => error.type === 'PROMPT_INTEGRITY_ERROR');
});

test('BABOK extraction repairs one invalid model contract without repeating the whole activity', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({
    catalog,
    policy: { 'requirements-decomposition': { active: '2.0.0', released: ['2.0.0'] } },
  }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const chunkId = '00000000-0000-4000-8000-000000000086';
  const primaryId = '00000000-0000-4000-8000-000000000087';
  const valid = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  valid.materials.primary = { artifactId: primaryId, role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  const invalid = {
    ...valid,
    context: [{ id: 'CTX-001', kind: 'business', text: '', source: { artifactId: chunkId, locator: 'section:1', quote: null }, provenance: 'Извлечено', quality: 'Готово', relatedIds: [] }],
  };
  const stored = [];
  const stepIds = [];
  let calls = 0;
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    babokSkillLoader,
    artifactRepository: {
      async readText() { return 'Контекст бизнес-задачи'; },
      async createText({ text }) { stored.push(text); return { artifactId: 'saved-repaired', sizeBytes: text.length, sha256: 'b'.repeat(64) }; },
    },
    modelExecutor: {
      async execute({ stepId, messages, policy }) {
        stepIds.push(stepId);
        calls += 1;
        if (calls === 2) {
          assert.match(messages.at(-1).content, /Техническое исправление контракта/);
          assert.match(messages.at(-1).content, /BR\.relatedIds/);
          assert.match(messages.at(-1).content, /CON\.obligation/);
          assert.match(messages.at(-1).content, /TERM-###/);
          assert.equal(policy.maxAttemptsPerModel, 1);
          assert.deepEqual(policy.models, ['test-model']);
        }
        return { text: JSON.stringify(calls === 1 ? invalid : valid), actualModel: 'test-model', fallbackApplied: false };
      },
    },
    config: {
      process: { siteId: 'test' },
      retention: { intermediateDays: 1, finalResultsDays: 1 },
      jobs: { resultMaxBytes: 1024 * 1024 },
      llm: { chunkTargetTokens: 1000, chunkConcurrency: 1, retryInitialDelayMs: 1, retryMaxDelayMs: 1 },
    },
  });

  const result = await handlers.decomposeChunk({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-repair', deadlineAt: new Date(Date.now() + 60_000), traceContext: {},
    chunk: { chunkId: 'chunk-repair', artifactId: chunkId },
    configurationSnapshot: {
      models: ['test-model'], maxAttemptsPerModel: 2, requestTimeoutMs: 1000, maxConcurrency: 1, temperature: 0.1, promptProfile: profile, babokSkillProfile,
      materials: { primary: { artifactId: primaryId, role: 'primary', name: null, sha256: null, status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    },
  });

  assert.equal(result.success, true);
  assert.equal(calls, 2);
  assert.deepEqual(stepIds, ['decompose-chunk:chunk-repair', 'decompose-chunk:chunk-repair:repair']);
  assert.equal(JSON.parse(stored[0]).schemaVersion, 'babok-requirements.v1');
});

test('BABOK extraction applies a safe default for an empty context kind without inventing a requirement', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({
    catalog,
    policy: { 'requirements-decomposition': { active: '2.0.0', released: ['2.0.0'] } },
  }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const chunkId = '00000000-0000-4000-8000-000000000085';
  const primaryId = '00000000-0000-4000-8000-000000000084';
  const registry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  registry.materials.primary = { artifactId: primaryId, role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  registry.context = [{ id: 'CTX-001', kind: null, text: 'Контекст', source: { artifactId: chunkId, locator: 'section:1', quote: null }, provenance: 'неизвестно', quality: 'неизвестно', relatedIds: null }];
  registry.groups.BR = [{ id: 'BR-001', text: 'Сократить срок обработки.', successIndicator: null, source: { artifactId: chunkId, locator: 'section:1', quote: 'Сократить срок обработки.' }, provenance: null, quality: null, relatedIds: null }];
  registry.groups.SR = [{ id: 'SR-001', role: '', text: 'Сотрудник создаёт заявку.', relatedTo: null, source: { artifactId: chunkId, locator: 'section:1', quote: 'Сотрудник создаёт заявку.' }, provenance: null, quality: null }];
  registry.groups.CON = [{ id: 'CON-001', obligation: '', text: 'Ограничение процесса.', source: { artifactId: chunkId, locator: 'section:1', quote: 'Ограничение процесса.' }, provenance: null, scope: '', relatedTo: null, quality: null }];
  registry.analysis.GAP = [{ id: 'GAP-001', kind: 'scope', text: 'Нужна проверка области действия.', affectedIds: ['CON-001'], nextStep: 'Уточнить область действия', source: null }];
  registry.analysis.TERM = [{ id: '', term: 'SLA', meaning: 'Срок обработки заявки', affectedIds: ['BR-001'], nextStep: null, source: null }];
  registry.analysis.questions = [{ id: 'Q-1', gapId: 'GAP-001', priority: 'P1', addressee: 'Владелец', text: 'Какова область действия?' }];
  registry.analysis.traceability = [{ from: 'BR-001', to: 'SR-001', relation: '', status: null, source: null }];
  const stored = [];
  let calls = 0;
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    babokSkillLoader,
    artifactRepository: {
      async readText() { return 'Контекст бизнес-задачи'; },
      async createText({ text }) { stored.push(text); return { artifactId: 'saved-context-default', sizeBytes: text.length, sha256: 'b'.repeat(64) }; },
    },
    modelExecutor: {
      async execute() { calls += 1; return { text: JSON.stringify(registry), actualModel: 'test-model', fallbackApplied: false }; },
    },
    config: {
      process: { siteId: 'test' },
      retention: { intermediateDays: 1, finalResultsDays: 1 },
      jobs: { resultMaxBytes: 1024 * 1024 },
      llm: { chunkTargetTokens: 1000, chunkConcurrency: 1, retryInitialDelayMs: 1, retryMaxDelayMs: 1 },
    },
  });

  const result = await handlers.decomposeChunk({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-context-default', deadlineAt: new Date(Date.now() + 60_000), traceContext: {},
    chunk: { chunkId: 'chunk-context-default', artifactId: chunkId },
    configurationSnapshot: {
      models: ['test-model'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: 1, temperature: 0.1, promptProfile: profile, babokSkillProfile,
      materials: { primary: { artifactId: primaryId, role: 'primary', name: null, sha256: null, status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    },
  });

  const persisted = JSON.parse(stored[0]);
  assert.equal(result.success, true);
  assert.equal(calls, 1);
  assert.equal(persisted.context[0].kind, 'контекст');
  assert.equal(persisted.context[0].quality, 'Требует уточнения');
  assert.equal(persisted.context[0].provenance, 'Предложено — требует подтверждения');
  assert.deepEqual(persisted.context[0].relatedIds, []);
  assert.equal(persisted.groups.BR[0].provenance, 'Предложено — требует подтверждения');
  assert.equal(persisted.groups.BR[0].quality, 'Требует уточнения');
  assert.deepEqual(persisted.groups.BR[0].relatedIds, []);
  assert.equal(persisted.groups.SR[0].role, null);
  assert.deepEqual(persisted.groups.SR[0].relatedTo, []);
  assert.equal(persisted.analysis.questions[0].id, 'QUESTION-001');
  assert.equal(persisted.analysis.TERM[0].id, 'TERM-001');
  assert.deepEqual(persisted.analysis.TERM[0].affectedIds, ['BR-001']);
  assert.equal(persisted.groups.CON.length, 0);
  assert.deepEqual(persisted.analysis.GAP[0].affectedIds, []);
  assert.equal(persisted.analysis.traceability.length, 0);
  assert.equal(persisted.analysis.GAP.length, 2);
});

test('BABOK consolidation produces one global registry, removes semantic duplicates and records partial scope', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({
    catalog,
    policy: { 'requirements-decomposition': { active: '2.0.0', released: ['2.0.0'] } },
  }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const primaryId = '00000000-0000-4000-8000-000000000099';
  const sectionOneId = '00000000-0000-4000-8000-000000000091';
  const sectionTwoId = '00000000-0000-4000-8000-000000000092';
  const stored = [];
  const section = (sourceArtifactId) => ({
    schemaVersion: 'babok-requirements.v1',
    mode: 'DECOMPOSITION',
    outcome: 'PARTIAL',
    summary: { text: 'section', counts: { BR: 0, SR: 0, FR: 0, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 0, HYP: 0, TERM: 0, DELTA: 0 }, conclusions: [] },
    context: [], groups: { BR: [], SR: [], FR: [], NFR: [], TR: [], CON: [] },
    analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [], questions: [] },
    materials: { primary: { artifactId: primaryId, role: 'primary', name: 'primary', sha256: 'a'.repeat(64), status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    scope: { partial: true, units: [{ id: sourceArtifactId, artifactId: sourceArtifactId, status: 'COMPLETE', section: null, note: null }] },
  });
  const duplicateRequirement = (id, quote) => ({
    id, text: 'Сократить срок обработки заявок.', successIndicator: null,
    source: { artifactId: primaryId, locator: id, quote }, provenance: 'Извлечено', quality: 'Требует уточнения', relatedIds: [],
  });
  const consolidationResponse = {
    ...section(primaryId),
    summary: { text: 'global', counts: { BR: 2, SR: 0, FR: 0, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 0, HYP: 0, TERM: 0, DELTA: 0 }, conclusions: [] },
    groups: { BR: [duplicateRequirement('BR-001', 'сократить срок'), duplicateRequirement('BR-002', 'Сократить срок обработки заявок')], SR: [], FR: [], NFR: [], TR: [], CON: [] },
  };
  const texts = new Map([[sectionOneId, JSON.stringify(section(sectionOneId))], [sectionTwoId, JSON.stringify(section(sectionTwoId))]]);
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    babokSkillLoader,
    artifactRepository: {
      async readText({ artifactId }) { return texts.get(artifactId) || ''; },
      async createText({ text }) { stored.push(text); return { artifactId: 'global-result', sizeBytes: text.length, sha256: 'b'.repeat(64) }; },
    },
    modelExecutor: {
      async execute({ messages, persistenceStepId }) {
        assert.match(messages.at(-1).content, /глобальный BABOK-реестр/);
        assert.match(messages.at(-1).content, /Результаты анализа единиц/);
        assert.equal(persistenceStepId, 'merge-decomposition');
        return { text: JSON.stringify(consolidationResponse), actualModel: 'test-model', fallbackApplied: false };
      },
    },
    config: { process: { siteId: 'test' }, retention: { intermediateDays: 1, finalResultsDays: 1 }, jobs: { resultMaxBytes: 1024 * 1024 }, llm: { retryInitialDelayMs: 1, retryMaxDelayMs: 1 } },
  });
  const failedArtifactId = '00000000-0000-4000-8000-000000000033';
  const result = await handlers.mergeDecomposition({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-a', inputArtifactId: primaryId, failedChunks: [{ chunkId: 'chunk-3', artifactId: failedArtifactId }], sectionArtifactIds: [sectionOneId, sectionTwoId],
    configurationSnapshot: {
      models: ['test-model'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: 1, temperature: 0.1, promptProfile: profile, babokSkillProfile,
      materials: { primary: { artifactId: primaryId, role: 'primary', name: 'primary', sha256: 'a'.repeat(64), status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    },
    deadlineAt: new Date(Date.now() + 60_000), traceContext: {},
  });
  const persisted = JSON.parse(stored[0]);
  assert.equal(result.sectionCount, 2);
  assert.equal(persisted.groups.BR.length, 1);
  assert.equal(persisted.groups.BR[0].id, 'BR-001');
  assert.equal(persisted.outcome, 'PARTIAL');
  assert.equal(persisted.scope.units.at(-1).status, 'FAILED');
  assert.equal(persisted.scope.units.at(-1).artifactId, failedArtifactId);
});

test('BABOK consolidation remaps delta references and never reads unavailable materials', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({
    catalog,
    policy: { 'requirements-decomposition': { active: '2.0.0', released: ['2.0.0'] } },
  }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const primaryId = '00000000-0000-4000-8000-000000000199';
  const baselineId = '00000000-0000-4000-8000-000000000198';
  const referenceId = '00000000-0000-4000-8000-000000000197';
  const sectionId = '00000000-0000-4000-8000-000000000191';
  const reads = [];
  const section = {
    schemaVersion: 'babok-requirements.v1', mode: 'DECOMPOSITION', outcome: 'COMPLETE',
    summary: { text: 'section', counts: { BR: 0, SR: 0, FR: 0, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 0, HYP: 0, TERM: 0, DELTA: 0 }, conclusions: [] },
    context: [], groups: { BR: [], SR: [], FR: [], NFR: [], TR: [], CON: [] },
    analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [], questions: [] },
    materials: { primary: { artifactId: primaryId, role: 'primary', name: 'primary', sha256: null, status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    scope: { partial: false, units: [{ id: sectionId, artifactId: sectionId, status: 'COMPLETE', section: null, note: null }] },
  };
  const response = {
    ...section,
    groups: {
      BR: [{ id: 'legacy-br', text: 'Цель процесса', successIndicator: null, source: { artifactId: primaryId, locator: '§1', quote: 'Цель процесса' }, provenance: 'Извлечено', quality: 'Готово', relatedIds: [] }],
      SR: [],
      FR: [{ id: 'legacy-fr', text: 'Система показывает результат', relatedTo: ['legacy-br'], source: { artifactId: primaryId, locator: '§2', quote: 'Показывает результат' }, provenance: 'Нормализовано', quality: 'Требует уточнения' }],
      NFR: [], TR: [], CON: [],
    },
    analysis: {
      GAP: [{ id: 'legacy-gap', kind: 'material', text: `Материал ${referenceId} недоступен для анализа.`, affectedIds: ['legacy-fr'], nextStep: 'Предоставить материал', source: null }],
      HYP: [], TERM: [],
      traceability: [{ from: 'legacy-br', to: 'legacy-fr', relation: 'реализуется', status: 'Подтверждено источником', source: null }],
      delta: [{ id: 'legacy-delta', baselineId: 'legacy-br', newId: 'legacy-fr', kind: 'уточнено', comment: 'Уточнение', source: null }],
      questions: [{ id: 'legacy-question', gapId: 'legacy-gap', priority: 'P1', addressee: 'Владелец', text: 'Можно ли подтвердить материал?' }],
    },
  };
  const stored = [];
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    babokSkillLoader,
    artifactRepository: {
      async readText({ artifactId }) {
        reads.push(artifactId);
        if (artifactId === referenceId) throw new Error('unavailable reference must not be read');
        return artifactId === sectionId ? JSON.stringify(section) : 'Baseline content';
      },
      async createText({ text }) { stored.push(text); return { artifactId: 'global-result', sizeBytes: text.length, sha256: 'b'.repeat(64) }; },
    },
    modelExecutor: { async execute() { return { text: JSON.stringify(response), actualModel: 'test-model', fallbackApplied: false }; } },
    config: { process: { siteId: 'test' }, retention: { intermediateDays: 1, finalResultsDays: 1 }, jobs: { resultMaxBytes: 1024 * 1024 }, llm: { retryInitialDelayMs: 1, retryMaxDelayMs: 1 } },
  });
  await handlers.mergeDecomposition({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-a', inputArtifactId: primaryId, failedChunks: [], sectionArtifactIds: [sectionId],
    configurationSnapshot: {
      models: ['test-model'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: 1, temperature: 0.1, promptProfile: profile, babokSkillProfile,
      materials: {
        primary: { artifactId: primaryId, role: 'primary', name: 'primary', sha256: null, status: 'AVAILABLE' },
        baseline: { status: 'AVAILABLE', artifacts: [{ artifactId: baselineId, role: 'baseline', name: 'baseline', sha256: null, status: 'AVAILABLE' }] },
        references: [{ artifactId: referenceId, role: 'reference', name: 'reference', sha256: null, status: 'UNAVAILABLE' }],
      },
    },
    deadlineAt: new Date(Date.now() + 60_000), traceContext: {},
  });
  const persisted = JSON.parse(stored[0]);
  assert.deepEqual(persisted.analysis.delta.map((item) => [item.baselineId, item.newId]), [['BR-001', 'FR-001']]);
  assert.deepEqual(persisted.analysis.traceability.map((item) => [item.from, item.to]), [['BR-001', 'FR-001']]);
  assert.equal(reads.includes(referenceId), false);
  assert.equal(persisted.materials.references[0].status, 'UNAVAILABLE');
});
