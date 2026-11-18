import assert from 'node:assert/strict';
import test from 'node:test';
import { createEnterpriseActivityHandlers } from '../src/activities/enterprise-handlers.js';
import { createEmptyBabokRegistry, collectBabokQualityIssues } from '../src/services/babok-requirements-contract.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../src/prompts/prompt-profile-resolver.js';
import { createBabokSkillBundleLoader, qualifyBabokSkillBundle } from '../src/skills/babok-skill-bundle.js';
import { BABOK_COMPACT_SEMANTIC_POLICY, BABOK_SEMANTIC_POLICY } from '../src/domain/babok-semantics.js';
import { repairRevision } from '../src/domain/babok-repair-patch.js';

const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
const loader = createBabokSkillBundleLoader();
function profile(type, override) {
  const id = type === 'DECOMPOSITION' ? 'requirements-decomposition' : 'requirements-insights';
  const version = override || (type === 'DECOMPOSITION' ? '2.6.0' : '2.8.0');
  return createPromptProfileResolver({ catalog, policy: { [id]: { active: version, released: [version] } } }).resolve({ type, mode: type === 'DECOMPOSITION' ? 'DECOMPOSITION' : 'REQUIREMENTS_INSIGHTS' });
}
function registry() {
  const value = createEmptyBabokRegistry({ outcome: 'COMPLETE' });
  value.materials.primary = { artifactId: 'primary', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  value.groups.BR = [{ id: 'BR-001', text: 'Привлечь новых клиентов банка.', successIndicator: null, relatedIds: ['GAP-001'], source: { artifactId: 'primary', locator: '§1', quote: 'Привлечь новых клиентов банка.' }, provenance: 'Извлечено', quality: 'Требует уточнения' }];
  value.summary.counts.BR = 1;
  value.analysis.GAP = [{ id: 'GAP-001', kind: 'Показатель успеха', text: 'Не определён показатель успеха.', affectedIds: ['BR-001'], nextStep: 'Согласовать показатель', source: null }];
  value.analysis.questions = [{ id: 'QUESTION-001', gapId: 'GAP-001', priority: 'P2', addressee: 'Владелец продукта', text: 'Какой показатель успеха используем?' }];
  value.summary.counts.GAP = 1;
  return value;
}
function research(enhancements) {
  return { insights: [{ id: 'insight-1', category: 'risks', title: 'Контроль результата', summary: 'Цель требует измеримого показателя.', detail: 'Показатель связан с BR-001.', rationale: 'Позволяет оценивать вклад сервиса.', applicability: 80, relatedTo: ['BR-001'], source_types: [], citations: [], enhancements }] };
}
const measurement = { operation: 'add', targetId: null, targetType: 'BR', targetIds: ['BR-001'], text: 'Достижение бизнес-цели привлечения клиентов измеряется долей новых клиентов за период.', successIndicator: 'Доля клиентов', rationale: 'Управление целью', confirmationConditions: 'Согласовать значение и период.' };
const corrected = { ...measurement, operation: 'replace', targetId: 'BR-001', text: registry().groups.BR[0].text, successIndicator: 'Кандидат: доля новых клиентов за согласованный период.' };
function checks(records, mode, patch = {}) {
  return { schemaVersion: BABOK_SEMANTIC_POLICY, checks: records.map(({ key, type, record }) => ({ key, text: record.text, classification: type, classificationReason: 'Самостоятельная цель организации; метрика только в successIndicator.', obligations: [record.text], atomicityReason: 'Один бизнес-результат.', evidence: mode === 'DECOMPOSITION' ? 'SUPPORTED' : 'PROPOSED', evidenceReason: 'Цель подтверждена исходным текстом, показатель — кандидат.', verifiable: true, verificationReason: 'Показатель будет согласован через GAP-001.', preservesOriginal: true, preservationReason: 'Исходный text BR-001 сохранён.', distinctOutcome: true, issues: [], repair: '', ...patch })) };
}
function harness(type, respond, version) {
  const saved = [], calls = [], trace = [];
  const base = registry();
  const input = { tenantId: 'test', ownerUserId: 'test', jobId: 'test', inputArtifactId: type === 'RESEARCH' ? 'version' : 'primary', failedChunks: [], sectionArtifactIds: ['section'], configurationSnapshot: { promptProfile: profile(type, version), babokSkillProfile: qualifyBabokSkillBundle({ loader, policy: { active: '1.0.0', released: ['1.0.0'] } }), materials: base.materials, models: ['test'], maxAttemptsPerModel: 1, maxConcurrency: { test: 1 } } };
  const handlers = createEnterpriseActivityHandlers({ promptCatalog: catalog, babokSkillLoader: loader,
    jobTraceRepository: { append: async (entry) => trace.push(entry) },
    config: { process: { siteId: 'test' }, retention: { intermediateDays: 1, finalResultsDays: 1 }, jobs: { resultMaxBytes: 1000000 }, llm: {} },
    artifactRepository: { readText: async ({ artifactId }) => artifactId === 'version' ? JSON.stringify({ kind: 'REQUIREMENTS_VERSION', registry: base, requirements: { business: [], functional: [], nonfunctional: [] }, decisions: {}, businessContextArtifactId: 'primary' }) : artifactId === 'section' ? JSON.stringify(base) : 'Привлечь новых клиентов банка.', createText: async ({ text }) => { saved.push(JSON.parse(text)); return { artifactId: 'saved' }; } },
    modelExecutor: { execute: async (request) => {
      calls.push(request);
      const value = await respond(request);
      return { text: typeof value === 'string' ? value : JSON.stringify(value), actualModel: 'test', fallbackApplied: false };
    } },
  });
  return { input, calls, saved, handlers, base, trace };
}

test('research automatically turns the live metric-as-BR error into an update of the original indicator and audits the corrected text', async () => {
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':semantic-repair:')) { assert.match(request.messages.at(-1).content, /BR_IS_MEASUREMENT/); return research([corrected]); }
    if (request.stepId.includes(':audit:')) return checks([{ key: 'insight-1:0', type: 'BR', record: corrected }], 'RESEARCH');
    return research([measurement]);
  });
  await h.handlers.generateRequirementsInsights(h.input);
  assert.equal(h.saved[0].insights[0].enhancements[0].operation, 'replace');
  assert.equal(h.saved[0].insights[0].enhancements[0].targetId, 'BR-001');
  assert.equal(h.saved[0].insights[0].enhancements[0].text, registry().groups.BR[0].text);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
  assert.equal(h.calls.filter((call) => call.stepId.includes(':audit:')).length, 1);
  assert.equal(h.calls.filter((call) => call.stepId.includes(':semantic-repair:')).length, 1);
});

test('persistent wrong BR fails after two corrections, without publishing a result', async () => {
  const h = harness('RESEARCH', () => research([measurement]));
  await assert.rejects(h.handlers.generateRequirementsInsights(h.input), { type: 'BABOK_SEMANTIC_INVALID' });
  assert.equal(h.saved.length, 0);
  assert.equal(h.calls.filter((call) => call.stepId.includes(':semantic-repair:')).length, 2);
});

test('independent audit splits a composite NFR automatically and rechecks both resulting operations', async () => {
  const combined = { operation: 'add', targetId: null, targetType: 'NFR', targetIds: [], text: 'Повтор резервирования или перечисления не создаёт второго финансового эффекта.', category: 'надёжность', scope: 'Резервирование и перечисление', verificationMethod: 'Повторить обе операции и сверить их эффекты.', rationale: 'Защита средств', confirmationConditions: 'Согласовать методику.' };
  const split = [
    { ...combined, text: 'Повтор резервирования не создаёт второго резерва.', scope: 'Резервирование', verificationMethod: 'Повторить запрос резервирования с одним ID; проверить единственную блокировку.' },
    { ...combined, text: 'Повтор перечисления не создаёт второй выплаты.', scope: 'Перечисление', verificationMethod: 'Повторить запрос перечисления с одним ID; проверить единственную выплату.' },
  ];
  let audits = 0;
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':semantic-repair:')) return research(split);
    if (request.stepId.includes(':audit:')) {
      audits++;
      return audits === 1
        ? checks([{ key: 'insight-1:0', type: 'NFR', record: combined }], 'RESEARCH', { obligations: ['Нет второго резерва', 'Нет второй выплаты'], atomicityReason: 'Два независимо проверяемых финансовых эффекта.' })
        : checks(split.map((record, index) => ({ key: `insight-1:${index}`, type: 'NFR', record })), 'RESEARCH');
    }
    return research([combined]);
  });
  await h.handlers.generateRequirementsInsights(h.input);
  assert.equal(audits, 2);
  assert.equal(h.saved[0].insights[0].enhancements.length, 2);
  assert.equal(h.saved[0].semanticValidation.checks.length, 2);
  assert.notEqual(h.saved[0].insights[0].enhancements[0].verificationMethod, h.saved[0].insights[0].enhancements[1].verificationMethod);
});

test('semantic failure is non-retryable after bounded repairs and retains safe diagnostic issue codes', async () => {
  const { toNonRetryableActivityFailure } = await import('../src/activities/checkpointed-activities.js');
  const failure = toNonRetryableActivityFailure(Object.assign(new Error('Semantic validation failed'), { type: 'BABOK_SEMANTIC_INVALID', details: { issues: [{ key: 'BR-001', code: 'BR_IS_MEASUREMENT', reason: 'Метрика не является новой целью.' }] } }));
  assert.equal(failure.nonRetryable, true);
  assert.equal(failure.type, 'BABOK_SEMANTIC_INVALID');
  assert.equal(failure.details[0].issues[0].code, 'BR_IS_MEASUREMENT');
});

test('a dishonest global pass or an incomplete auditor response cannot publish the candidate', async () => {
  const h = harness('RESEARCH', (request) => request.stepId.includes(':audit:') ? { passed: true } : research([corrected]));
  await assert.rejects(h.handlers.generateRequirementsInsights(h.input), { type: 'BABOK_SEMANTIC_INVALID' });
  assert.equal(h.saved.length, 0);
});

test('decomposition is independently audited and unsupported scope triggers automatic correction before storage', async () => {
  let audits = 0;
  const h = harness('DECOMPOSITION', (request) => {
    if (request.stepId.includes(':audit:')) {
      audits++;
      return checks([{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }], 'DECOMPOSITION', audits === 1 ? { evidence: 'UNSUPPORTED', evidenceReason: 'Нужно перепроверить цитату.' } : {});
    }
    return registry();
  });
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(audits, 2);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
  assert.ok(h.calls.some((call) => call.stepId.includes(':semantic-repair:')));
  assert.match(h.calls.find((call) => call.stepId.includes(':audit:')).messages[0].content, /Одна строка — одно независимо согласуемое/);
});

function compactChecks(request, records, mode) {
  const revision = request.messages.at(-1).content.match(/"revision":"([a-f0-9]{16})"/)[1];
  return { ...checks(records, mode), schemaVersion: BABOK_COMPACT_SEMANTIC_POLICY, revision, coverageIssues: [] };
}

test('unknown migration completion is publishable only with clarification status and an explicit GAP', () => {
  const value = registry();
  const transition = { id: 'TR-001', text: 'Перевести клиентов с прежнего формата файлов без остановки выплат.', completionCriterion: null, relatedTo: ['GAP-002'], source: value.groups.BR[0].source, provenance: 'Извлечено', quality: 'Требует уточнения' };
  value.groups.TR = [transition];
  value.summary.counts.TR = 1;
  value.analysis.GAP.push({ id: 'GAP-002', kind: 'Критерий завершения', text: 'Не определён критерий завершения перехода.', affectedIds: ['TR-001'], nextStep: 'Согласовать критерий завершения.', source: null });
  value.summary.counts.GAP = 2;
  assert.deepEqual(collectBabokQualityIssues(value), []);
  transition.quality = 'Готово';
  assert.ok(collectBabokQualityIssues(value).some((issue) => issue.path.endsWith('.completionCriterion')));
  transition.quality = 'Требует уточнения';
  transition.relatedTo = [];
  value.analysis.GAP.pop();
  value.summary.counts.GAP = 1;
  assert.ok(collectBabokQualityIssues(value).some((issue) => issue.path.endsWith('.completionCriterion')));
});

test('a critic-only CTX contract error is repaired without rewriting candidates or spending semantic corrections', async () => {
  const records = [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }];
  const h = harness('DECOMPOSITION', (request) => {
    const audit = compactChecks(request, records, 'DECOMPOSITION');
    if (request.stepId.endsWith(':audit:0')) audit.checks.push({ ...audit.checks[0], key: 'CTX-001', classification: 'CTX' });
    else assert.ok(request.stepId.endsWith(':audit-contract-repair'));
    return audit;
  }, '2.7.0');
  await h.handlers.mergeDecomposition(h.input);
  assert.deepEqual(h.calls.map((call) => call.stepId), ['consolidate-decomposition:audit:0', 'consolidate-decomposition:audit-contract-repair']);
  assert.deepEqual(h.saved[0].groups, h.base.groups);
  assert.deepEqual(h.saved[0].semanticValidation.corrections, []);
  assert.equal(h.saved[0].semanticValidation.auditFormatRepairs, 1);
});

test('active source-aware prompts accept confirmed incomplete FR and TR with GAPs without inventing missing mechanisms', async () => {
  const h = harness('DECOMPOSITION', (request) => {
    assert.match(request.messages.at(-1).content, /с неизвестным механизмом/);
    const source = JSON.parse(request.messages.at(-1).content.split('sourceCoverage:\n')[1].split('\n')[0]);
    const records = Object.entries(h.base.groups).flatMap(([type, group]) => group.map((record) => ({ key: record.id, type, record })));
    return { ...compactChecks(request, records, 'DECOMPOSITION'), checks: checks(records, 'DECOMPOSITION', { verifiable: false }).checks, sourceRevision: source.revision, sourceChecks: source.units.map((unit) => ({ key: unit.key, targetKeys: ['BR-001'], preservesConditions: true, issues: [] })) };
  }, '2.15.0');
  const common = { relatedTo: ['GAP-001'], source: h.base.groups.BR[0].source, provenance: 'Извлечено', quality: 'Требует уточнения' };
  h.base.groups.FR = [{ ...common, id: 'FR-001', text: 'Решение исключает повторную выплату.' }];
  h.base.groups.TR = [{ ...common, id: 'TR-001', text: 'Перевести клиентов с прежнего формата файлов.', completionCriterion: null }];
  h.base.summary.counts.FR = h.base.summary.counts.TR = 1;
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.saved[0].groups.TR, h.base.groups.TR);
  assert.deepEqual(h.saved[0].groups.FR, h.base.groups.FR);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
});

test('repairing the critic contract still requires correction and a fresh audit of unsupported content', async () => {
  const records = [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }];
  const h = harness('DECOMPOSITION', (request) => {
    if (request.stepId.includes(':semantic-repair:')) return { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], upserts: [], removeIds: [] };
    const audit = compactChecks(request, records, 'DECOMPOSITION');
    if (!request.stepId.endsWith(':audit:1')) audit.checks[0].evidence = 'UNSUPPORTED';
    if (request.stepId.endsWith(':audit:0')) audit.checks.push({ ...audit.checks[0], key: 'CTX-001', classification: 'CTX' });
    return audit;
  }, '2.7.0');
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.saved[0].semanticValidation.auditFormatRepairs, 1);
  assert.equal(h.saved[0].semanticValidation.corrections.length, 1);
  assert.equal(h.calls.at(-1).stepId, 'consolidate-decomposition:audit:1');
});

function fiveDirections() {
  const risks = research([corrected]).insights[0];
  return { insights: ['trends', 'patterns', 'risks', 'competitors', 'standards'].map((category) => ({
    ...risks, id: `insight-${category}`, category,
    title: `Гипотеза: ${category}`, detail: 'Предложение из знаний модели; актуальность не проверена.',
    enhancements: category === 'risks' ? [corrected] : [],
  })) };
}

function fiveDirectionAudit(request) {
  const narrative = JSON.parse(request.messages.at(-1).content.split('narrativeCandidates:\n')[1]);
  return { ...compactChecks(request, [{ key: 'insight-risks:0', type: 'BR', record: corrected }], 'RESEARCH'),
    narrativeRevision: narrative.revision,
    insightChecks: narrative.records.map((item) => ({ key: item.key, factsSupported: true, hypothesesLabelled: true, answersPreserved: true, issues: [], reason: '' })),
  };
}

test('five-direction research automatically repairs missing categories and audits LLM hypotheses without external sources', async () => {
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':audit:')) return fiveDirectionAudit(request);
    if (request.stepId === 'requirements-insights:repair') {
      assert.match(request.messages.at(-1).content, /missing required directions: trends, patterns, competitors, standards/);
      return fiveDirections();
    }
    return research([corrected]);
  }, '2.12.0');
  await h.handlers.generateRequirementsInsights(h.input);
  assert.deepEqual(h.saved[0].researchCoverage.counts, { trends: 1, patterns: 1, risks: 1, competitors: 1, standards: 1 });
  assert.equal(h.saved[0].semanticValidation.narrativeValidation.checks.length, 5);
  assert.ok(h.saved[0].insights.every((item) => item.evidenceMode === 'MODEL_HYPOTHESIS' && !item.citations.length));
  assert.equal(h.input.configurationSnapshot.promptProfile.performanceBudgetMs, 900000);
});

test('research cannot publish a successful partial result when the model repeatedly omits directions', async () => {
  const h = harness('RESEARCH', () => research([corrected]), '2.12.0');
  await assert.rejects(h.handlers.generateRequirementsInsights(h.input), (error) => error.type === 'INVALID_REQUIREMENTS_INSIGHTS' && /competitors, standards/.test(error.message));
  assert.equal(h.saved.length, 0);
  assert.equal(h.calls.length, 2);
});

test('research repairs false attribution of an FR trigger before a critic can falsely approve it', async () => {
  const good = fiveDirections();
  const bad = structuredClone(good);
  bad.insights[2].detail = 'Из материалов: FR-005 объединяет подтверждение передачи и перечисление.';
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':semantic-repair:')) return { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], insights: [good.insights[2]] };
    if (request.stepId.includes(':audit:')) return fiveDirectionAudit(request);
    return bad;
  }, '2.13.0');
  h.base.groups.FR = [{ id: 'FR-005', text: 'После подтверждения передачи товара решение перечисляет средства продавцу.', relatedTo: [], source: { artifactId: 'primary', locator: '§1', quote: 'Перечисляет средства.' }, provenance: 'Нормализовано', quality: 'Требует уточнения' }];
  h.base.summary.counts.FR = 1;
  await h.handlers.generateRequirementsInsights(h.input);
  assert.equal(h.saved[0].insights[2].detail, good.insights[2].detail);
  assert.equal(h.saved[0].semanticValidation.corrections[0].issues[0].code, 'FALSE_COMPOSITE_FR_CLAIM');
  assert.deepEqual(h.saved[0].researchCoverage.counts, { trends: 1, patterns: 1, risks: 1, competitors: 1, standards: 1 });
});

test('persistent false attribution cannot publish even with an approving critic', async () => {
  const bad = fiveDirections();
  bad.insights[2].detail = 'FR-005 объединяет два действия.';
  const h = harness('RESEARCH', (request) => request.stepId.includes(':semantic-repair:')
    ? { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], insights: [bad.insights[2]] }
    : request.stepId.includes(':audit:') ? fiveDirectionAudit(request) : bad, '2.13.0');
  h.base.groups.FR = [{ id: 'FR-005', text: 'После подтверждения передачи товара решение перечисляет средства продавцу.', relatedTo: [], source: { artifactId: 'primary', locator: '§1', quote: 'Перечисляет средства.' }, provenance: 'Нормализовано', quality: 'Требует уточнения' }];
  h.base.summary.counts.FR = 1;
  await assert.rejects(h.handlers.generateRequirementsInsights(h.input), { type: 'BABOK_SEMANTIC_INVALID' });
  assert.equal(h.saved.length, 0);
});

test('single-unit fast decomposition uses only an audit, not another consolidation or full rewrite', async () => {
  const records = [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }];
  const h = harness('DECOMPOSITION', (request) => compactChecks(request, records, 'DECOMPOSITION'), '2.7.0');
  await h.handlers.mergeDecomposition(h.input);
  assert.deepEqual(h.calls.map((call) => call.stepId), ['consolidate-decomposition:audit:0']);
  assert.equal(h.saved[0].semanticValidation.policy, BABOK_COMPACT_SEMANTIC_POLICY);
  assert.equal(h.input.configurationSnapshot.promptProfile.performanceBudgetMs, 240000);
  assert.equal(h.saved[0].outcome, 'COMPLETE');
});

test('decomposition without the critic saves a structured registry and traces the skip', async () => {
  const h = harness('DECOMPOSITION', () => assert.fail('single-unit merge does not need a model call without the critic'), '2.17.0');
  h.input.configurationSnapshot.criticEnabled = false;
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.saved[0].outcome, 'COMPLETE');
  assert.deepEqual(h.saved[0].groups.BR, h.base.groups.BR);
  assert.equal(h.saved[0].semanticValidation.status, 'SKIPPED');
  assert.equal(h.trace.find(({ name }) => name === 'BABOK audit skipped')?.metadata.reasonCode, 'CRITIC_DISABLED');
});

test('fast research needs generation plus compact audit and retains explicit semantic checks', async () => {
  const h = harness('RESEARCH', (request) => request.stepId.includes(':audit:') ? compactChecks(request, [{ key: 'insight-1:0', type: 'BR', record: corrected }], 'RESEARCH') : research([corrected]), '2.9.0');
  await h.handlers.generateRequirementsInsights(h.input);
  assert.deepEqual(h.calls.map((call) => call.stepId), ['requirements-insights', 'requirements-insights:audit:0']);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
});

test('fast metric-as-BR repair replaces only its insight and is re-audited without full regeneration', async () => {
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':semantic-repair:')) return { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], insights: research([corrected]).insights };
    if (request.stepId.includes(':audit:')) return compactChecks(request, [{ key: 'insight-1:0', type: 'BR', record: corrected }], 'RESEARCH');
    return research([measurement]);
  }, '2.9.0');
  await h.handlers.generateRequirementsInsights(h.input);
  assert.equal(h.calls.length, 3);
  assert.equal(h.saved[0].insights[0].enhancements[0].operation, 'replace');
  assert.equal(h.saved[0].semanticValidation.corrections[0].issues[0].code, 'BR_IS_MEASUREMENT');
});

test('compact decomposition repairs an invalid patch contract within the same bounded correction loop', async () => {
  let audits = 0, repairs = 0;
  const records = [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }];
  const h = harness('DECOMPOSITION', (request) => {
    if (request.stepId.includes(':audit:')) {
      audits++;
      return { ...compactChecks(request, records, 'DECOMPOSITION'), checks: checks(records, 'DECOMPOSITION', audits === 1 ? { evidence: 'UNSUPPORTED' } : {}).checks };
    }
    assert.match(request.messages[0].content, /Контракт записей внутри upserts.record/);
    assert.match(request.messages[0].content, /Не тестируемо/);
    repairs++;
    return { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], upserts: [{ type: 'BR', id: 'BR-001', record: { ...registry().groups.BR[0], quality: repairs === 1 ? 'Уточнить' : 'Требует уточнения' } }], removeIds: [] };
  }, '2.7.0');
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(repairs, 2);
  assert.equal(audits, 2);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
  assert.equal(h.saved[0].semanticValidation.formatRepairs, 1);
  assert.equal(h.saved[0].semanticValidation.corrections.length, 1);
  assert.match(h.calls.find((call) => call.stepId.includes('patch-contract-repair')).messages.at(-1).content, /"quality":"Уточнить"/);
});

test('source-aware fast decomposition requires all source-condition checks before publication', async () => {
  const records = [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }];
  const respond = (valid) => (request) => {
    if (request.stepId.includes(':semantic-repair:')) return { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], upserts: [], removeIds: [] };
    const source = JSON.parse(request.messages.at(-1).content.split('sourceCoverage:\n')[1]);
    return { ...compactChecks(request, records, 'DECOMPOSITION'), sourceRevision: source.revision, sourceChecks: source.units.map((unit) => ({ key: unit.key, targetKeys: ['BR-001'], preservesConditions: valid, issues: [] })) };
  };
  const good = harness('DECOMPOSITION', respond(true), '2.9.0');
  await good.handlers.mergeDecomposition(good.input);
  assert.equal(good.saved[0].semanticValidation.sourceCoverage.checks.length, 1);
  const bad = harness('DECOMPOSITION', respond(false), '2.9.0');
  await assert.rejects(bad.handlers.mergeDecomposition(bad.input), { type: 'BABOK_SEMANTIC_INVALID' });
  assert.equal(bad.saved.length, 0);
});

test('a stale source audit is repaired without changing the requirement candidate', async () => {
  const records = [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }];
  const h = harness('DECOMPOSITION', (request) => {
    const prompt = request.messages.at(-1).content;
    const source = JSON.parse(prompt.split('sourceCoverage:\n')[1].split('\n')[0]);
    return { ...compactChecks(request, records, 'DECOMPOSITION'),
      sourceRevision: request.stepId.endsWith(':audit:0') ? 'stale' : source.revision,
      sourceChecks: source.units.map(({ key }) => ({ key, targetKeys: ['BR-001'], preservesConditions: true, issues: [] })),
    };
  }, '2.17.0');
  await h.handlers.mergeDecomposition(h.input);
  assert.deepEqual(h.saved[0].groups, h.base.groups);
  assert.equal(h.saved[0].semanticValidation.auditFormatRepairs, 1);
  assert.equal(h.calls.some(({ stepId }) => stepId.includes('semantic-repair')), false);
});

test('a repaired research response still passes semantic audit before publication', async () => {
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.endsWith(':audit:0')) return fiveDirectionAudit(request);
    if (request.stepId.endsWith(':repair')) return fiveDirections();
    return '{"insights":[{"id":"truncated';
  }, '2.15.0');
  await h.handlers.generateRequirementsInsights(h.input);
  assert.deepEqual(h.calls.map(({ stepId }) => stepId), ['requirements-insights', 'requirements-insights:repair', 'requirements-insights:audit:0']);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
  assert.equal(h.saved[0].insights.length, 5);
});

test('research without the critic still repairs malformed JSON before saving all five directions', async () => {
  const h = harness('RESEARCH', (request) => request.stepId.endsWith(':repair') ? fiveDirections() : '{"insights":[', '2.15.0');
  h.input.configurationSnapshot.criticEnabled = false;
  await h.handlers.generateRequirementsInsights(h.input);
  assert.deepEqual(h.calls.map(({ stepId }) => stepId), ['requirements-insights', 'requirements-insights:repair']);
  assert.equal(h.saved[0].insights.length, 5);
  assert.equal(h.saved[0].semanticValidation.status, 'SKIPPED');
  assert.equal(h.trace.find(({ name }) => name === 'BABOK audit skipped')?.metadata.reasonCode, 'CRITIC_DISABLED');
});

test('malformed research JSON gets one repair before falling back to the input version', async () => {
  const h = harness('RESEARCH', () => '{"insights":[{"id":"truncated', '2.15.0');
  await assert.rejects(h.handlers.generateRequirementsInsights(h.input), { type: 'INVALID_REQUIREMENTS_INSIGHTS' });
  assert.deepEqual(h.calls.map(({ stepId }) => stepId), ['requirements-insights', 'requirements-insights:repair']);
  await h.handlers.recoverRequirements({ ...h.input, recoveryMode: 'REQUIREMENTS_INSIGHTS', reasonCode: 'INVALID_REQUIREMENTS_INSIGHTS' });
  assert.deepEqual(h.saved[0], {
    schemaVersion: 1, mode: 'REQUIREMENTS_INSIGHTS', outcome: 'PARTIAL',
    inputRequirementsVersionId: 'version', insights: [], recovery: { reasonCode: 'INVALID_REQUIREMENTS_INSIGHTS' },
  });
});

test('malformed responses from the enabled critic can be recovered into a manual registry and draft', async () => {
  const h = harness('DECOMPOSITION', () => ({ passed: true }), '2.17.0');
  h.input.configurationSnapshot.criticEnabled = true;
  await assert.rejects(h.handlers.mergeDecomposition(h.input), { type: 'BABOK_SEMANTIC_INVALID' });
  const callCount = h.calls.length;
  for (const sectionArtifactIds of [[], ['section']]) {
    await h.handlers.recoverRequirements({ ...h.input, sectionArtifactIds, recoveryMode: 'DECOMPOSITION', reasonCode: 'BABOK_SEMANTIC_INVALID' });
  }
  for (const value of h.saved) {
    assert.equal(value.outcome, 'PARTIAL');
    assert.equal(value.manualRegistry.materials.primary.artifactId, 'primary');
    assert.deepEqual(value.manualRegistry.groups.BR, []);
  }
  assert.equal(h.saved[0].recovery.draft, undefined);
  assert.deepEqual(JSON.parse(h.saved[1].recovery.draft.responses[0]).groups.BR, h.base.groups.BR);
  assert.equal(h.calls.length, callCount);
});

test('independent decomposition auditor receives GAP, questions and delta, not only requirement rows', async () => {
  const h = harness('DECOMPOSITION', (request) => {
    const prompt = request.messages.at(-1).content;
    assert.match(prompt, /"registryAnalysis"/);
    assert.match(prompt, /Не определён показатель успеха/);
    assert.match(prompt, /"affectedIds":\["BR-001"\]/);
    assert.match(prompt, /"questions"/);
    assert.match(prompt, /"delta"/);
    return compactChecks(request, [{ key: 'BR-001', type: 'BR', record: registry().groups.BR[0] }], 'DECOMPOSITION');
  }, '2.7.0');
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.calls.length, 1);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
});

test('research proposals remain hypotheses with scope confirmation, not falsely confirmed extracted requirements', async () => {
  const proposal = { operation: 'add', targetId: null, targetType: 'FR', targetIds: [], text: 'Решение фиксирует сообщение участника об открытии спора.', rationale: 'Сделать обращение наблюдаемым для обеих сторон.', confirmationConditions: 'Подтвердить включение процедуры спора в scope и согласовать инициаторов.' };
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':audit:')) {
      assert.match(request.messages.at(-1).content, /контейнер гипотез HYP/);
      return compactChecks(request, [{ key: 'insight-1:0', type: 'FR', record: proposal }], 'RESEARCH');
    }
    return research([proposal]);
  }, '2.10.0');
  await h.handlers.generateRequirementsInsights(h.input);
  assert.equal(h.calls.length, 2);
  assert.equal(h.saved[0].evidenceMode, 'MODEL_HYPOTHESIS');
  assert.match(h.saved[0].insights[0].enhancements[0].confirmationConditions, /в scope/);
  assert.equal(h.saved[0].semanticValidation.status, 'PASSED');
});

test('false source claims in insight prose are corrected automatically without changing valid proposals', async () => {
  let audits = 0;
  const bad = research([corrected]);
  bad.insights[0].detail = 'Источник подтвердил фиксацию открытия и закрытия спора.';
  const good = research([corrected]);
  good.insights[0].detail = 'Фиксация открытия и закрытия спора — предлагаемые моделью механизмы, которые требуют согласования владельца.';
  const h = harness('RESEARCH', (request) => {
    if (request.stepId.includes(':semantic-repair:')) return { baseRevision: request.messages.at(-1).content.match(/"baseRevision":"([a-f0-9]{16})"/)[1], insights: good.insights };
    if (request.stepId.includes(':audit:')) {
      const narrative = JSON.parse(request.messages.at(-1).content.split('narrativeCandidates:\n')[1]);
      audits++;
      return { ...compactChecks(request, [{ key: 'insight-1:0', type: 'BR', record: corrected }], 'RESEARCH'), narrativeRevision: narrative.revision, insightChecks: [{ key: 'insight-1', factsSupported: audits > 1, hypothesesLabelled: true, answersPreserved: true, issues: [], reason: audits > 1 ? '' : 'Источник подтвердил потребность, а не конкретный механизм.' }] };
    }
    return bad;
  }, '2.11.0');
  await h.handlers.generateRequirementsInsights(h.input);
  assert.equal(audits, 2);
  assert.equal(h.saved[0].insights[0].detail, good.insights[0].detail);
  assert.deepEqual(h.saved[0].insights[0].enhancements[0].text, corrected.text);
  assert.equal(h.saved[0].semanticValidation.narrativeValidation.checks[0].factsSupported, true);
  assert.equal(h.saved[0].semanticValidation.corrections[0].issues[0].code, 'INSIGHT_EVIDENCE_INVALID');
});
