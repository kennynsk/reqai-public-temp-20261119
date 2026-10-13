import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../src/prompts/prompt-profile-resolver.js';
import assert from 'node:assert/strict';
import test from 'node:test';

import { createEnterpriseActivityHandlers } from '../src/activities/enterprise-handlers.js';
import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';

test('requirements insights activity uses the original prompt contract and persists structured cards', async () => {
  let providerInput; let stored;
  const version = {
    kind: 'REQUIREMENTS_VERSION',
    businessContextArtifactId: 'context-artifact',
    requirements: { business: [{ id: 'BT-1', text: 'Сократить срок обработки' }], functional: [], nonfunctional: [] },
  };
  const handlers = createEnterpriseActivityHandlers({
    config: {
      process: { siteId: 'dc-a' },
      retention: { finalResultsDays: 180, intermediateDays: 30 },
      jobs: { resultMaxBytes: 104857600 },
      llm: { retryInitialDelayMs: 1, retryMaxDelayMs: 2, maxConcurrency: { 'GC-Max': 1 } },
    },
    artifactRepository: {
      async readText({ artifactId }) { return artifactId === 'version-artifact' ? JSON.stringify(version) : 'Автоматизация обработки клиентских заявок'; },
      async createText(value) { stored = value; return { artifactId: 'result-artifact' }; },
    },
    modelExecutor: {
      async execute(value) {
        providerInput = value;
        return {
          text: JSON.stringify({ insights: [{ id: 'insight-1', category: 'trends', title: 'Автоматизация', summary: 'Рынок ускоряет обработку', detail: 'Применимо к задаче.', applicability: 91, source_types: ['market_research'], relatedTo: ['BT-1'], enhancements: [{ operation: 'replace', targetId: 'BT-1', targetType: 'business', text: 'Система должна автоматически обрабатывать заявку', rationale: 'Сокращение ручных операций', confirmationConditions: 'Согласовать правила обработки' }] }] }),
          actualModel: 'GC-Max', fallbackApplied: false,
        };
      },
    },
  });
  const result = await handlers.generateRequirementsInsights({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-a', inputArtifactId: 'version-artifact', deadlineAt: '2099-01-01T00:00:00Z', traceContext: {},
    configurationSnapshot: { models: ['GC-Max'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: { 'GC-Max': 1 }, temperature: 0.3 },
  });
  const prompt = providerInput.messages.at(-1).content;
  assert.match(prompt, /Автоматизация обработки клиентских заявок/);
  assert.match(prompt, /Сократить срок обработки/);
  assert.match(prompt, /8–12/);
  const content = JSON.parse(stored.text);
  assert.equal(content.mode, 'REQUIREMENTS_INSIGHTS');
  assert.equal(content.inputRequirementsVersionId, 'version-artifact');
  assert.equal(content.insights[0].enhancements[0].targetType, 'business');
  assert.equal(content.insights[0].enhancements[0].confirmationConditions, 'Согласовать правила обработки');
  assert.equal(content.insights[0].enhancements[0].text, 'Система должна автоматически обрабатывать заявку');
  assert.equal(content.insights[0].enhancements[0].operation, 'replace');
  assert.equal(content.insights[0].enhancements[0].targetId, 'BT-1');
  assert.match(prompt, /enhancement.confirmationConditions/);
  assert.equal(result.insightCount, 1);
  assert.equal(stored.kind, 'RESULT');
});

test('requirements insights receives the complete saved BABOK registry and identifier set', async () => {
  let providerInput; let stored;
  const registry = createEmptyBabokRegistry();
  registry.materials.primary = { artifactId: 'context-artifact', role: 'primary', name: 'Business context', sha256: null, status: 'AVAILABLE' };
  registry.context = [{ id: 'CTX-001', kind: 'fact', text: 'Контекст задачи', source: { artifactId: 'context-artifact', locator: '§1', quote: 'Контекст задачи' }, provenance: 'Извлечено', quality: 'Готово', relatedIds: [] }];
  registry.summary.counts.CTX = 1;
  const version = {
    kind: 'REQUIREMENTS_VERSION', sourceJobType: 'DECOMPOSITION', businessContextArtifactId: 'context-artifact',
    requirements: { business: [], functional: [], nonfunctional: [] }, registry,
  };
  const handlers = createEnterpriseActivityHandlers({
    config: { process: { siteId: 'dc-a' }, retention: { finalResultsDays: 180, intermediateDays: 30 }, jobs: { resultMaxBytes: 104857600 }, llm: { retryInitialDelayMs: 1, retryMaxDelayMs: 2, maxConcurrency: { 'GC-Max': 1 } } },
    artifactRepository: {
      async readText({ artifactId }) { return artifactId === 'version-artifact' ? JSON.stringify(version) : 'Контекст задачи'; },
      async createText(value) { stored = value; return { artifactId: 'result-artifact' }; },
    },
    modelExecutor: {
      async execute(value) {
        providerInput = value;
        return { text: JSON.stringify({ insights: [{ id: 'insight-1', category: 'risks', title: 'Риск', summary: 'Требует проверки', detail: 'Контекст', applicability: 80, source_types: ['case_study'], relatedTo: ['CTX-001'], enhancements: [] }] }), actualModel: 'GC-Max', fallbackApplied: false };
      },
    },
  });
  await handlers.generateRequirementsInsights({
    tenantId: 'tenant-a', ownerUserId: 'user-a', jobId: 'job-a', inputArtifactId: 'version-artifact', deadlineAt: '2099-01-01T00:00:00Z', traceContext: {},
    configurationSnapshot: { models: ['GC-Max'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: { 'GC-Max': 1 }, temperature: 0.3, babokIdentifierSet: ['CTX-001'] },
  });
  assert.match(providerInput.messages.at(-1).content, /"schemaVersion": "babok-requirements\.v1"/);
  assert.match(providerInput.messages.at(-1).content, /CTX-001/);
  const content = JSON.parse(stored.text);
  assert.deepEqual(content.baseRegistry, registry);
  assert.deepEqual(content.babokIdentifierSet, ['CTX-001']);
});


for (const version of ['2.0.0', '2.1.0', '2.2.0', '2.3.0']) for (const baselineShape of ['snapshot', 'legacy-array', 'not-provided']) test(`released research ${version} renders with ${baselineShape} material lineage`, async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({ catalog, policy: { 'requirements-insights': { active: version, released: [version] } } }).resolve({ type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS' });
  const registry = createEmptyBabokRegistry();
  registry.materials.primary = { artifactId: 'primary', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  registry.materials.references = [{ artifactId: 'untrusted-edit', role: 'reference', name: null, sha256: null, status: 'AVAILABLE' }];
  const decisions = { review: { gaps: { 'GAP-001': { answer: 'Ответ пользователя: согласует директор', state: 'answered', reason: '' } }, omissions: [{ text: 'Проверить архив заявок', requirementIds: [] }] } };
  const descriptor = (artifactId, role) => ({ artifactId, role, status: 'AVAILABLE' });
  const envelope = { kind: 'REQUIREMENTS_VERSION', requirements: { business: [], functional: [], nonfunctional: [] }, registry, decisions, businessContextArtifactId: 'primary', materialLineage: { sourceJobMaterials: { baseline: [descriptor('baseline', 'baseline')], references: [descriptor('reference', 'reference'), descriptor('missing', 'reference')] } } };
  if (baselineShape !== 'legacy-array') envelope.materialLineage.sourceJobMaterials.baseline = {
    status: baselineShape === 'not-provided' ? 'NOT_PROVIDED' : 'AVAILABLE',
    artifacts: baselineShape === 'not-provided' ? [] : envelope.materialLineage.sourceJobMaterials.baseline,
  };
  const reads = []; let prompt; let result;
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog,
    config: { process: { siteId: 'test' }, retention: { finalResultsDays: 1 }, jobs: { resultMaxBytes: 1000000 }, llm: {} },
    artifactRepository: {
      async readText({ artifactId, tenantId }) {
        assert.equal(tenantId, 'tenant'); reads.push(artifactId);
        if (artifactId === 'version') return JSON.stringify(envelope);
        if (artifactId === 'missing') throw new Error('not found');
        return { primary: 'Полный основной документ', baseline: 'Прежний порядок согласования', reference: 'Полный регламент согласования' }[artifactId];
      },
      async createText({ text }) { result = JSON.parse(text); return { artifactId: 'result' }; },
    },
    modelExecutor: { async execute(value) {
      prompt = value.messages.at(-1).content;
      return { text: JSON.stringify({ insights: [{ id: 'i', category: 'risks', title: 'Риск', summary: 'Проверить', detail: 'Проверить', applicability: 80, source_types: ['case_study'], relatedTo: [], enhancements: [{ targetType: 'FR', targetIds: [], text: 'Система позволяет предварительно оценить результат конвертации баллов.', rationale: 'Прозрачная конвертация снижает неопределённость клиента.', confirmationConditions: 'Согласовать правила конвертации.' }] }] }), actualModel: 'test' };
    } },
  });
  await handlers.generateRequirementsInsights({ tenantId: 'tenant', inputArtifactId: 'version', configurationSnapshot: { promptProfile: profile, models: ['test'] }, traceContext: {} });
  assert.match(prompt, /Полный основной документ/);
  assert.doesNotMatch(prompt, /\{\{babokIdentifierSet\}\}/);
  assert.equal(reads.includes('untrusted-edit'), false);
  assert.equal(result.insights[0].enhancements[0].text, 'Система позволяет предварительно оценить результат конвертации баллов.');
  assert.equal(result.insights[0].enhancements[0].confirmationConditions, 'Согласовать правила конвертации.');
  assert.deepEqual(result.insights[0].enhancements[0].targetIds || [], []);
  if (version === '2.3.0') assert.match(prompt, /Текущий реестр — отправная точка, а не граница/);
  assert.deepEqual(result.baseRegistry, registry);
  assert.deepEqual(result.baseDecisions, decisions);
  if (version !== '2.0.0') {
    for (const text of ['Ответ пользователя: согласует директор', 'Проверить архив заявок', ...(baselineShape === 'not-provided' ? [] : ['Прежний порядок согласования']), 'Полный регламент согласования', 'UNAVAILABLE']) assert.ok(prompt.includes(text), text);
    assert.equal(reads.includes('baseline'), baselineShape !== 'not-provided');
    assert.equal(result.researchMaterials.find((item) => item.artifactId === 'missing').status, 'UNAVAILABLE');
    assert.equal(result.researchMaterials.some((item) => 'content' in item), false);
  } else {
    assert.deepEqual(reads, ['version', 'primary']);
    assert.doesNotMatch(prompt, /Ответ пользователя: согласует директор/);
  }
});

for (const version of ['2.5.0', '2.6.0', '2.7.0']) test(`research ${version} uses the pinned skill and repairs incomplete NFR evidence`, async () => {
  const { createBabokSkillBundleLoader } = await import('../src/skills/babok-skill-bundle.js');
  const loader = createBabokSkillBundleLoader(); const bundle = loader.get('1.0.0');
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const profile = createPromptProfileResolver({ catalog, policy: { 'requirements-insights': { active: version, released: [version] } } }).resolve({ type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS' });
  const calls = []; let stored;
  const envelope = { kind: 'REQUIREMENTS_VERSION', requirements: { business: [], functional: [], nonfunctional: [] }, decisions: { skippedResearch: true } };
  const result = { insights: [{ id: 'insight-1', category: 'risks', title: 'Повтор запроса', summary: 'Возможен повтор запроса резервирования', detail: 'Проверить повторные запросы', rationale: 'Двойное резервирование влияет на средства покупателя', applicability: 90, source_types: ['industry_report'], citations: [{ url: 'https://fabricated.example/' }], relatedTo: [], enhancements: [{ operation: 'add', targetId: null, targetType: 'NFR', text: 'Повтор резервирования с тем же ID операции не создаёт второго резерва.', category: 'Надёжность', scope: 'Операция резервирования', verificationMethod: 'Повторить запрос с тем же ID', confirmationConditions: 'Определить срок хранения результата' }] }] };
  const handlers = createEnterpriseActivityHandlers({ promptCatalog: catalog, babokSkillLoader: loader,
    config: { process: { siteId: 'dc-a' }, retention: { finalResultsDays: 180 }, jobs: { resultMaxBytes: 10485760 }, llm: { maxConcurrency: { test: 1 } } },
    artifactRepository: { readText: async () => JSON.stringify(envelope), createText: async (value) => { stored = JSON.parse(value.text); return { artifactId: 'result' }; } },
    modelExecutor: { execute: async (value) => { calls.push(value); const answer = structuredClone(result); if (version !== '2.5.0' && calls.length < 3) answer.insights[0].enhancements[0].verificationMethod = null; return { text: JSON.stringify(answer), actualModel: 'test', fallbackApplied: false }; } },
  });
  await handlers.generateRequirementsInsights({ tenantId: 'tenant', inputArtifactId: 'version', configurationSnapshot: { promptProfile: profile, babokSkillProfile: { id: bundle.id, version: bundle.version, manifestHash: bundle.manifestHash }, models: ['test'], maxAttemptsPerModel: 1, requestTimeoutMs: 1000, maxConcurrency: { test: 1 } } });
  assert.equal(calls.length, version !== '2.5.0' ? 3 : 2);
  assert.match(calls[0].messages[0].content, /Одна строка — одно независимо согласуемое/);
  assert.match(calls[1].messages.at(-1).content, version !== '2.5.0' ? /ОДНО действие с одним результатом/ : /Раздели каждое независимо согласуемое обязательство/);
  if (version !== '2.5.0') assert.match(calls[2].messages.at(-1).content, /requires category, scope and a concrete verificationMethod/);
  assert.doesNotMatch(calls[0].messages.at(-1).content, /действующий график до согласия/);
  assert.equal(stored.evidenceMode, 'MODEL_HYPOTHESIS');
  assert.deepEqual(stored.insights[0].citations, []);
  assert.deepEqual(stored.insights[0].source_types, []);
  assert.equal(stored.insights[0].enhancements[0].verificationMethod, 'Повторить запрос с тем же ID');
  assert.deepEqual(stored.baseDecisions, envelope.decisions);
});
