import { BABOK_MODEL_JSON_SCHEMA, normalizeBabokWireResponse, prepareBabokWireResponse } from '../src/skills/babok-wire-contract.js';
import { isBabokTextDraft, renderBabokTextDraft } from '../src/services/babok-text-draft.js';
import { evaluateOutcome } from '../src/domain/outcome.js';
import { renderBabokReport } from '../src/services/babok-report-renderer.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBabokSkillBundleLoader, qualifyBabokSkillBundle } from '../src/skills/babok-skill-bundle.js';
import { buildBabokSystemPrompt } from '../src/skills/babok-execution.js';
import { createEmptyBabokRegistry, collectBabokQualityIssues, validateBabokSkillResult } from '../src/services/babok-requirements-contract.js';
import { createEnterpriseActivityHandlers } from '../src/activities/enterprise-handlers.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../src/prompts/prompt-profile-resolver.js';

const loader = createBabokSkillBundleLoader();
const bundle = loader.get('1.0.0');
const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
const profile = createPromptProfileResolver({ catalog, policy: { 'requirements-decomposition': { active: '2.3.0', released: ['2.3.0'] } } }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
const source = { artifactId: 'primary', locator: '§1', quote: 'Система показывает статус заявки.' };
function registry() {
  const value = createEmptyBabokRegistry({ outcome: 'COMPLETE' });
  value.materials.primary = { artifactId: 'primary', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  value.groups.FR = [{ id: 'FR-001', text: source.quote, source: { ...source }, provenance: 'Извлечено', quality: 'Готово', relatedTo: [] }];
  value.summary.counts.FR = 1;
  return value;
}
function harness(responses, section = registry()) {
  const saved = [];
  const calls = [];
  const input = {
    tenantId: 'test', ownerUserId: 'test', jobId: 'test', inputArtifactId: 'primary',
    chunk: { chunkId: 'chunk-1', artifactId: 'chunk' }, failedChunks: [], sectionArtifactIds: ['section'],
    configurationSnapshot: {
      promptProfile: profile,
      babokSkillProfile: qualifyBabokSkillBundle({ loader, policy: { active: '1.0.0', released: ['1.0.0'] } }),
      materials: registry().materials, models: ['glm-test'],
    },
  };
  const handlers = createEnterpriseActivityHandlers({
    promptCatalog: catalog, babokSkillLoader: loader,
    artifactRepository: {
      async readText({ artifactId }) { return artifactId === 'section' ? JSON.stringify(section) : artifactId === 'primary' ? 'Полный источник. Система показывает статус заявки. Отдельный раздел решения.' : 'Фрагмент'; },
      async createText({ text }) { saved.push(JSON.parse(text)); return { artifactId: 'result' }; },
    },
    modelExecutor: { async execute(request) { calls.push(request); const response = responses[Math.min(calls.length - 1, responses.length - 1)]; if (response instanceof Error) throw response; return { text: typeof response === 'string' ? response : JSON.stringify(response), actualModel: 'glm-test' }; } },
    config: { process: { siteId: 'test' }, retention: { intermediateDays: 1, finalResultsDays: 1 }, jobs: { resultMaxBytes: 1000000 }, llm: {} },
  });
  return { handlers, input, saved, calls };
}

test('original skill and every reference reach the model verbatim', async () => {
  const prompt = buildBabokSystemPrompt(bundle);
  for (const path of [bundle.entrypoint, ...bundle.requiredReferences, ...bundle.optionalReferences]) assert.ok(prompt.includes(bundle.read(path)), path);
  const h = harness([registry()]);
  await h.handlers.decomposeChunk(h.input);
  assert.equal(h.calls[0].messages[0].role, 'system');
  assert.equal(h.calls[0].messages[0].content, prompt);
  assert.match(h.calls[0].messages[0].content, /groups\.\*\[\]\.text содержит только самостоятельную формулировку/);
  assert.match(h.calls[0].messages[0].content, /Сам GAP и связь с требованием сохраняй/);
  assert.match(h.calls[0].messages[1].content, /Отдельный раздел решения/);
  assert.match(h.calls[0].messages[1].content, /Фрагмент/);
});

test('the default skill sends separate rules for derived obligations and decisions on scope', async () => {
  const { loadConfig } = await import('../src/config/env.js');
  const policy = loadConfig({}).skills.babokRequirements;
  const skill = qualifyBabokSkillBundle({ loader, policy });
  assert.equal(skill.version, '1.1.0');
  assert.ok(policy.released.includes('1.0.0'));
  const h = harness([registry()]);
  h.input.configurationSnapshot.babokSkillProfile = skill;
  await h.handlers.decomposeChunk(h.input);
  const method = h.calls[0].messages[0].content;
  assert.match(method, /Само разложение на SR и FR не создаёт вопроса/);
  assert.match(method, /открытый выбор — в GAP с затронутыми ID и вопросом/);
});

test('global verification sees original source and preserves independent baseline deltas', async () => {
  const value = registry();
  value.materials.baseline = { status: 'AVAILABLE', artifacts: [{ artifactId: 'baseline', role: 'baseline', name: null, sha256: null, status: 'AVAILABLE' }] };
  value.analysis.delta = [
    { id: 'DELTA-001', baselineId: 'FR-999', newId: 'FR-001', kind: 'изменено', comment: 'Изменено действие', source: null },
    { id: 'DELTA-002', baselineId: 'FR-998', newId: null, kind: 'заменено / исключено', comment: 'Исключено', source: null },
  ];
  const h = harness([value]);
  h.input.configurationSnapshot.materials = value.materials;
  await h.handlers.mergeDecomposition(h.input);
  assert.deepEqual(h.saved[0].analysis.delta, value.analysis.delta);
  assert.match(h.calls[0].messages[1].content, /Отдельный раздел решения/);
  assert.ok(h.calls[0].messages[0].content.includes(bundle.read('references/requirements-quality.md')));
});

test('new execution repairs invalid records without deleting them or inventing provenance', async () => {
  const invalid = registry();
  invalid.groups.FR[0].relatedTo = ['SR-999'];
  const h = harness([invalid, registry()]);
  await h.handlers.decomposeChunk(h.input);
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].messages[1].content, /SR-999/);
  assert.equal(h.calls[1].messages[0].content, h.calls[0].messages[0].content);
  assert.equal(h.saved[0].groups.FR.length, 1);
});

test('skill validation rejects hypotheses, incomplete NFR and clarification without GAP', () => {
  const hyp = registry();
  hyp.groups.FR[0].provenance = 'Предложено — требует подтверждения';
  assert.throws(() => validateBabokSkillResult(hyp), /предложенное требование/);
  const nfr = registry();
  nfr.groups.NFR = [{ ...nfr.groups.FR[0], id: 'NFR-001', category: 'Скорость', scope: null, verificationMethod: null }];
  nfr.summary.counts.NFR = 1;
  assert.throws(() => validateBabokSkillResult(nfr), /нефункционального требования/);
  const gap = registry();
  gap.groups.FR[0].quality = 'Требует уточнения';
  assert.throws(() => validateBabokSkillResult(gap), /связь с пробелом GAP/);
  gap.analysis.GAP = [{ id: 'GAP-001', kind: 'scope', text: 'Уточнить область', affectedIds: ['FR-001'], nextStep: 'Уточнить', source: null }];
  gap.summary.counts.GAP = 1;
  assert.doesNotThrow(() => validateBabokSkillResult(gap));
});

test('open GAPs do not turn fully processed documents into partial execution', async () => {
  const value = registry();
  value.outcome = 'PARTIAL';
  value.groups.FR[0].quality = 'Требует уточнения';
  value.analysis.GAP = [{ id: 'GAP-001', kind: 'scope', text: 'Уточнить область', affectedIds: ['FR-001'], nextStep: 'Уточнить', source: null }];
  value.analysis.questions = [{ id: 'QUESTION-001', gapId: 'GAP-001', priority: 'P0', addressee: 'Владелец', text: 'Какова область?' }];
  const h = harness([value]);
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.saved[0].outcome, 'COMPLETE');
  assert.equal(h.saved[0].scope.partial, false);
  assert.equal(h.saved[0].analysis.GAP.length, 1);
});


test('quality findings preserve the entire draft through chunk and consolidation without semantic repair', async () => {
  const value = registry();
  value.groups.FR[0].quality = 'Требует уточнения';
  const before = structuredClone(value);
  const h = harness([value]);
  await h.handlers.decomposeChunk(h.input);
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.calls.length, 2);
  for (const saved of h.saved) {
    assert.deepEqual(saved.groups, before.groups);
    assert.deepEqual(saved.analysis, before.analysis);
    assert.match(collectBabokQualityIssues(saved)[0].reason, /FR-001.*GAP/);
  }
  assert.deepEqual(value, before);
  assert.match(renderBabokReport(h.saved[1]), /Замечания к качеству[\s\S]*FR-001.*GAP/);
  assert.match(renderBabokReport(h.saved[1]), /Система показывает статус заявки/);
});


test('two invalid model answers remain downloadable and bypass destructive merge', async () => {
  const invalid = registry();
  invalid.groups.FR[0].provenance = 'Источник';
  const h = harness([invalid]);
  await h.handlers.decomposeChunk(h.input);
  assert.equal(h.calls.length, 2);
  assert.equal(isBabokTextDraft(h.saved[0]), true);
  assert.equal(h.saved[0].responses[0], JSON.stringify(invalid));
  const merge = harness([], h.saved[0]);
  const saved = await merge.handlers.mergeDecomposition(merge.input);
  assert.equal(merge.calls.length, 0);
  assert.equal(saved.textDraft, true);
  assert.match(renderBabokTextDraft(merge.saved[0]), /Система показывает статус заявки/);
  assert.equal(evaluateOutcome({ successfulUnits: 1, failedUnits: 0, textDraft: true }).outcome, 'PARTIAL');
});

test('invalid global answer remains available as a text draft', async () => {
  const invalid = registry();
  invalid.groups.FR[0].provenance = 'Источник';
  const h = harness([invalid]);
  const saved = await h.handlers.mergeDecomposition(h.input);
  assert.equal(saved.textDraft, true);
  assert.equal(isBabokTextDraft(h.saved[0]), true);
});


test('wire schema distinguishes enum strings from registry arrays and server metadata', () => {
  const schema = BABOK_MODEL_JSON_SCHEMA;
  assert.equal(schema.properties.context.type, 'array');
  for (const entry of [schema.properties.context.items, ...Object.values(schema.properties.groups.properties).map((group) => group.items)]) {
    assert.equal(entry.properties.quality.type, 'string');
    assert.ok(entry.properties.quality.enum.includes('Готово'));
    assert.equal(entry.properties.provenance.type, 'string');
  }
  for (const key of ['materials', 'scope']) assert.equal(schema.properties[key], undefined);
  assert.equal(schema.properties.summary.properties.counts, undefined);
  assert.deepEqual(schema.properties.outcome.enum, ['COMPLETE', 'PARTIAL', 'INSUFFICIENT_CONTEXT']);
});

test('singleton enum transport from the reported failure opens in both chunk and final registry', async () => {
  const value = registry();
  value.context = [{ id: 'CTX-001', kind: 'Факт', text: 'Текущий процесс', source, provenance: ['Извлечено'], quality: ['Готово'], relatedIds: [] }];
  value.groups.FR[0].quality = ['Готово'];
  value.groups.FR[0].provenance = ['Извлечено'];
  delete value.materials;
  delete value.scope;
  delete value.summary.counts;
  const before = structuredClone(value);
  const h = harness([value]);
  await h.handlers.decomposeChunk(h.input);
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.calls.length, 2, 'no model repair is needed');
  for (const saved of h.saved) {
    assert.equal(isBabokTextDraft(saved), false);
    assert.equal(saved.context[0].quality, 'Готово');
    assert.equal(saved.context[0].provenance, 'Извлечено');
    assert.deepEqual(saved.groups.FR[0].source, source);
    assert.equal(saved.summary.counts.CTX, 1);
  }
  assert.deepEqual(value, before);
});

test('transport compatibility never chooses among conflicting or unknown enum values', () => {
  for (const quality of [[], ['Готово', 'Конфликтует'], ['Новый статус']]) {
    const value = registry();
    value.groups.FR[0].quality = quality;
    assert.deepEqual(normalizeBabokWireResponse(value).groups.FR[0].quality, quality);
    assert.throws(() => validateBabokSkillResult(normalizeBabokWireResponse(value)), /quality/);
  }
});


test('repair receives all independent shape errors together', async () => {
  const value = registry();
  value.groups.FR[0].provenance = ['Извлечено', 'Нормализовано'];
  value.groups.FR[0].quality = 'Неизвестно';
  value.groups.FR[0].relatedTo = 'BR-001';
  const h = harness([value, registry()]);
  await h.handlers.decomposeChunk(h.input);
  assert.equal(h.calls.length, 2);
  for (const field of ['provenance', 'quality', 'relatedTo']) assert.ok(h.calls[1].messages[1].content.includes(`$.groups.FR[0].${field}`));
  assert.equal(isBabokTextDraft(h.saved[0]), false);
});

test('nullable omissions normalize without inventing evidence or changing required values', () => {
  const value = registry();
  delete value.groups.FR[0].source.quote;
  const normalized = prepareBabokWireResponse(value);
  assert.equal(normalized.groups.FR[0].source.quote, null);
  assert.deepEqual(value.groups.FR[0].source, { artifactId: 'primary', locator: '§1' });
  delete value.groups.FR[0].source;
  assert.throws(() => prepareBabokWireResponse(value), (error) => error.type === 'OUTPUT_CONTRACT_VIOLATION');
});

test('malformed JSON and nested records always enter bounded recovery, including final consolidation', async () => {
  const malformed = [null, [], 4, '```json\n{"groups":', { ...registry(), analysis: null }];
  for (const collection of ['FR', 'BR', 'NFR']) {
    for (const record of [null, 1, 'text', [], {}]) {
      const value = registry();
      value.groups[collection] = [record];
      malformed.push(value);
    }
  }
  for (const value of malformed) {
    for (const method of ['decomposeChunk', 'mergeDecomposition']) {
      const h = harness([value, registry()]);
      await h.handlers[method](h.input);
      assert.equal(h.calls.length, 2);
      assert.equal(isBabokTextDraft(h.saved[0]), false);
    }
  }
});

test('transient repair failure preserves the original text and diagnostic cause', async () => {
  const value = registry();
  value.groups.FR[0].quality = 'Неизвестно';
  for (const reasonCode of ['MODEL_TIMEOUT', 'MODEL_NETWORK', 'MODEL_RATE_LIMIT', 'MODEL_5XX', 'MODEL_FALLBACK_EXHAUSTED']) {
    const h = harness([value, Object.assign(new Error('Unavailable'), { reasonCode })]);
    await h.handlers.decomposeChunk(h.input);
    assert.equal(h.saved[0].responses[0], JSON.stringify(value));
    assert.equal(h.saved[0].details.repairFailure.reasonCode, reasonCode);
    const merge = harness([], h.saved[0]);
    await merge.handlers.mergeDecomposition(merge.input);
    assert.equal(merge.saved[0].details.sections[0].details.repairFailure.reasonCode, reasonCode);
  }
});

test('cancellation, deadline and unexpected errors are never masked as successful drafts', async () => {
  const value = registry();
  value.groups.FR[0].quality = 'Неизвестно';
  for (const reasonCode of ['CANCELLED', 'JOB_DEADLINE_EXPIRED', undefined]) {
    const failure = Object.assign(new Error('Stop'), { reasonCode });
    const h = harness([value, failure]);
    await assert.rejects(h.handlers.decomposeChunk(h.input), (error) => error === failure);
    assert.equal(h.saved.length, 0);
  }
});

test('coverage requires explicit hierarchy edges and does not accept SR peers or generic references', () => {
  const value = registry();
  const base = { source: { ...source }, provenance: 'Извлечено', quality: 'Готово' };
  value.groups.BR = [{ ...base, id: 'BR-001', text: 'Цель', successIndicator: null, relatedIds: ['SR-001'] }];
  value.groups.SR = [{ ...base, id: 'SR-001', role: 'Клиент', text: 'Потребность', relatedTo: ['BR-001'] }];
  value.groups.FR[0].relatedTo = ['SR-001'];
  value.summary.counts.BR = 1;
  value.summary.counts.SR = 1;
  const issues = collectBabokQualityIssues(value, { final: true });
  assert.ok(issues.some((issue) => issue.reason.includes('BR-001')));
  assert.ok(issues.some((issue) => issue.reason.includes('FR-001')));
  value.analysis.traceability = [
    { from: 'BR-001', to: 'SR-001', relation: 'обосновывает', status: 'Предполагается', source: null },
    { from: 'SR-001', to: 'FR-001', relation: 'реализует', status: 'Подтверждено источником', source: null },
  ];
  assert.equal(collectBabokQualityIssues(value, { final: true }).length, 0);
});

test('a scoped common NFR can be grounded directly in a business goal without an artificial SR', () => {
  const value = registry();
  const base = { source: { ...source }, provenance: 'Извлечено', quality: 'Готово' };
  value.groups.FR = [];
  value.summary.counts.FR = 0;
  value.groups.BR = [{ ...base, id: 'BR-001', text: 'Сократить обработку до одного дня', successIndicator: 'Один день', relatedIds: [] }];
  value.groups.NFR = [{ ...base, id: 'NFR-001', text: 'Обработка не более одного дня', category: 'Производительность', scope: 'Весь процесс обработки заявки', verificationMethod: 'Измерение длительности', relatedTo: [] }];
  value.summary.counts.BR = 1;
  value.summary.counts.NFR = 1;
  value.analysis.traceability = [{ from: 'BR-001', to: 'NFR-001', relation: 'обосновывает', status: 'Подтверждено источником', source: null }];
  assert.deepEqual(collectBabokQualityIssues(value, { final: true }), []);
  value.analysis.traceability = [];
  assert.ok(collectBabokQualityIssues(value, { final: true }).some((issue) => issue.reason.includes('NFR-001')));
});

test('2.4 reviews the final draft against the original source and saves the corrected result', async () => {
  const draft = registry(); const corrected = registry();
  draft.groups.FR[0].text = 'Показывать и удалять статус';
  const h = harness([draft, corrected]);
  h.input.configurationSnapshot.promptProfile = createPromptProfileResolver({ catalog, policy: { 'requirements-decomposition': { active: '2.4.0', released: ['2.4.0'] } } }).resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  await h.handlers.mergeDecomposition(h.input);
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].messages[1].content, /Полный источник/);
  assert.match(h.calls[1].messages[1].content, /Показывать и удалять статус/);
  assert.match(h.calls[1].messages[1].content, /цитата только о действии роли не доказывает вклад/);
  assert.equal(h.saved[0].groups.FR[0].text, corrected.groups.FR[0].text);
});
