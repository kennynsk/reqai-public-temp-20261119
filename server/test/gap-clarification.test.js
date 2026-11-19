import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscussionContext, validateDiscussionProposal } from '../src/services/requirement-discussion-service.js';
import { linkedRequirements, normalizeReviewMetadata } from '../src/services/review-metadata.js';
import { guidedGapPrompt } from '../src/services/gap-clarification.js';

test('guided explanations prepare new requirements inline without model-assigned IDs', () => {
  assert.match(guidedGapPrompt, /формулировки существующих требований менять не нужно, скажи это прямо/);
  assert.match(guidedGapPrompt, /подготовь его в additions прямо в пакете/);
  assert.match(guidedGapPrompt, /Не задавай ID, source, provenance, quality или связи для additions/);
  assert.match(guidedGapPrompt, /scope «объём задачи»/);
  assert.match(guidedGapPrompt, /successIndicator «показатель успеха»/);
  assert.match(guidedGapPrompt, /имена JSON-полей и обязательные существующие ID сохраняй точно/);
  assert.doesNotMatch(guidedGapPrompt, /переоценит требования по скиллу/);
  assert.match(guidedGapPrompt, /не более одного перевода округления по одной исходной операции/);
  assert.match(guidedGapPrompt, /не создавай отдельные additions только для ключа, каждого статуса или конкуренции/);
  assert.match(guidedGapPrompt, /Возможность отдельно протестировать ветвь не делает её отдельным требованием/);
});

const registry = {
  groups: { FR: [{ id: 'FR-001', text: 'Отправить уведомление', relatedTo: [] }], SR: [{ id: 'SR-001', text: 'Клиент получает уведомление', relatedTo: ['GAP-001'] }] },
  context: [{ id: 'CTX-001', text: 'Мобильное приложение' }],
  analysis: { GAP: [{ id: 'GAP-001', text: 'Не указан канал', affectedIds: ['FR-001', 'TERM-001', 'CTX-001'] }], TERM: [{ id: 'TERM-001', text: 'Уведомление' }], questions: [{ id: 'QUESTION-001', gapId: 'GAP-001', text: 'Какой канал использовать?' }] },
};
const payload = () => ({ explanation: 'Уточнить канал', changes: [{ targetId: 'FR-001', before: { text: 'Отправить уведомление' }, after: { text: 'Отправить push-уведомление' }, rationale: 'Пользователь выбрал push' }], clarification: { gapId: 'GAP-001', answer: 'Использовать push', remainingQuestions: [], checks: [{ requirementId: 'FR-001', state: 'incorporated', reason: 'Добавлен канал' }, { requirementId: 'SR-001', state: 'no-change', reason: 'Потребность клиента уже отражена' }] } });
const snapshot = () => buildDiscussionContext({ content: registry, anchorId: 'GAP-001', baseVersionId: 'v1' });
const validate = (value, context = snapshot()) => validateDiscussionProposal(value, { content: context });

test('terms and context are evidence, reverse requirements are checked and missing links stay visible', () => {
  const context = snapshot();
  assert.deepEqual(context.manifest.requirementIds, ['FR-001', 'SR-001']);
  assert.deepEqual(new Set(context.content.contextRecords.map((record) => record.id)), new Set(['CTX-001', 'TERM-001']));
  assert.ok(context.manifest.includedIds.includes('TERM-001'));
  const missing = structuredClone(registry);
  missing.analysis.GAP[0].affectedIds.push('TERM-MISSING');
  assert.deepEqual(linkedRequirements(missing, missing.analysis.GAP[0]).unresolved, ['TERM-MISSING']);
});

test('older saved TERM and CTX checklist entries do not block subsequent resolution', () => {
  const checks = { 'FR-001': { state: 'no-change', reason: 'Уже отражено' }, 'SR-001': { state: 'no-change', reason: 'Уже отражено' }, 'TERM-001': { state: 'pending', unresolved: true }, 'CTX-001': { state: 'pending', unresolved: true } };
  const normalized = normalizeReviewMetadata({
    content: registry, allowedGaps: registry.analysis.GAP, contextId: 'source', actorId: 'alice', now: new Date(),
    inherited: { schemaVersion: 1, gapRequirements: { 'GAP-001': { 'TERM-001': checks['TERM-001'], 'CTX-001': checks['CTX-001'] } } },
    supplied: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'closed', closureKind: 'resolved', answer: 'Текущая формулировка подходит', reason: 'Проверено' } }, gapRequirements: { 'GAP-001': checks } },
  });
  assert.equal(normalized.gaps['GAP-001'].state, 'closed');
  assert.deepEqual(Object.keys(normalized.gapRequirements['GAP-001']), ['FR-001', 'SR-001']);
});

test('complete proposals capture authoritative bases and derive closure without trusting the model flag', () => {
  const value = payload();
  value.clarification.canResolve = false;
  value.clarification.recordBases = { forged: true };
  const normalized = validate(value);
  assert.equal(normalized.clarification.canResolve, true);
  assert.equal(normalized.clarification.recordBases['SR-001'].text, 'Клиент получает уведомление');
  assert.deepEqual(normalized.clarification.questionsBefore, registry.analysis.questions);
  assert.deepEqual(normalized.clarification.gapBefore, registry.analysis.GAP[0]);
  assert.equal(normalized.clarification.stateBefore, 'open');
});

test('partial, omitted and dangling-reference contexts cannot close a question', () => {
  for (const variant of ['question', 'unchecked', 'omitted', 'missing']) {
    const value = payload();
    const context = snapshot();
    value.clarification.canResolve = true;
    if (variant === 'question') value.clarification.remainingQuestions = ['Что делать при недоступности push?'];
    if (variant === 'unchecked') value.clarification.checks.pop();
    if (variant === 'omitted') context.omitted.push('TERM-001');
    if (variant === 'missing') context.manifest.linkedRequirementIds.push('FR-MISSING');
    if (variant === 'unchecked') assert.throws(() => validate(value, context), /Complete clarification must check every linked requirement/);
    else assert.equal(validate(value, context).clarification.canResolve, false, variant);
  }
});

test('a justified no-change package is applicable without text edits', () => {
  const value = payload();
  value.changes = [];
  value.clarification.checks[0] = { requirementId: 'FR-001', state: 'no-change', reason: 'Канал сознательно остаётся на выбор клиента' };
  assert.equal(validate(value).clarification.canResolve, true);
});

test('invalid dispositions and unrelated or contextual targets never become applicable', () => {
  const mutations = [
    (value) => { value.clarification.gapId = 'GAP-002'; },
    (value) => { value.clarification.answer = ''; },
    (value) => { value.clarification.remainingQuestions = null; },
    (value) => { value.clarification.checks = [null]; },
    (value) => { value.clarification.checks[1].reason = ''; },
    (value) => { value.clarification.checks[0].state = 'no-change'; },
    (value) => { value.clarification.checks[1].state = 'incorporated'; },
    (value) => { value.clarification.checks.push(value.clarification.checks[0]); },
    (value) => { value.clarification.checks[1].requirementId = 'TERM-001'; },
    (value) => { value.clarification.checks.shift(); },
    (value) => { value.changes[0].targetId = 'FR-UNRELATED'; },
    (value) => { value.changes[0].after = { quality: 'Готово' }; },
  ];
  for (const mutate of mutations) {
    const value = payload(); mutate(value);
    assert.throws(() => validate(value), { code: 'DISCUSSION_PROPOSAL_INVALID' });
  }
});

test('new requirements receive reserved collision-free IDs and checks without changing pre-acceptance bases', () => {
  const full = structuredClone(registry);
  full.materials = { primary: { artifactId: 'primary' } };
  full.groups.SR.push({ id: 'SR-008', text: 'Другая потребность', relatedTo: [] });
  const context = buildDiscussionContext({ content: full, anchorId: 'GAP-001', baseVersionId: 'v1' });
  const raw = payload();
  raw.additions = [{ type: 'SR', fields: { text: 'Клиенту нужна возможность возобновить сервис.', role: 'Клиент' }, rationale: 'Возобновление подтверждено пользователем.' }];
  const proposal = validateDiscussionProposal(raw, { content: context, registry: full, reservedIds: ['SR-011'] });
  assert.equal(proposal.additions[0].record.id, 'SR-012');
  assert.deepEqual(proposal.additions[0].record.relatedTo, ['GAP-001']);
  assert.deepEqual(proposal.additions[0].record.source, { artifactId: 'primary', locator: 'discussion:GAP-001', quote: null });
  assert.equal(proposal.clarification.canResolve, true);
  assert.equal(proposal.clarification.checks.at(-1).requirementId, 'SR-012');
  assert.equal(proposal.clarification.checks.at(-1).state, 'incorporated');
  assert.deepEqual(proposal.clarification.linkedRequirementIds, context.manifest.linkedRequirementIds);
  assert.equal(Object.hasOwn(proposal.clarification.recordBases, 'SR-012'), false);
  assert.equal(full.groups.SR.length, 2);
});

test('new requirement fields, IDs, duplicates and unsupported types cannot bypass normalization', () => {
  const full = structuredClone(registry); full.materials = { primary: { artifactId: 'primary' } };
  const context = buildDiscussionContext({ content: full, anchorId: 'GAP-001', baseVersionId: 'v1' });
  const good = () => ({ type: 'SR', fields: { text: 'Клиенту нужна возможность возобновить сервис.', role: 'Клиент' }, rationale: 'Ответ пользователя.' });
  for (const additions of [
    [{ ...good(), id: 'SR-999' }], [{ ...good(), type: 'TERM' }], [{ ...good(), fields: { ...good().fields, id: 'SR-999' } }],
    [{ ...good(), fields: { ...good().fields, quality: 'Готово' } }], [{ ...good(), fields: { ...good().fields, text: '' } }],
    [{ ...good(), fields: { ...good().fields, text: full.groups.SR[0].text } }], [good(), good()], Array.from({ length: 11 }, good),
  ]) {
    assert.throws(() => validateDiscussionProposal({ ...payload(), additions }, { content: context, registry: full }), { code: 'DISCUSSION_PROPOSAL_INVALID' });
  }
  const partial = payload(); partial.additions = [good()]; partial.clarification.remainingQuestions = ['Когда применяется правило?'];
  assert.equal(validateDiscussionProposal(partial, { content: context, registry: full }).clarification.canResolve, false);
});


test('complete no-change clarification must include the linked BR alongside five NFR checks', () => {
  const context = snapshot();
  const records = [{ id: 'BR-001', text: 'Business outcome' }, ...Array.from({ length: 5 }, (_, index) => ({ id: `NFR-00${index + 1}`, text: 'Quality condition' }))];
  context.content.requirements = records;
  context.manifest.linkedRequirementIds = records.map(({ id }) => id);
  const value = payload(); value.changes = [];
  value.clarification.checks = records.slice(1).map(({ id }) => ({ requirementId: id, state: 'no-change', reason: 'Already covered.' }));
  assert.throws(() => validate(value, context), (error) => {
    assert.deepEqual(error.details.missingRequirementIds, ['BR-001']);
    assert.deepEqual(error.details.requiredRequirementIds, records.map(({ id }) => id));
    return true;
  });
  value.clarification.checks.push({ requirementId: 'BR-001', state: 'no-change', reason: 'Outcome remains unchanged.' });
  assert.equal(validate(value, context).clarification.canResolve, true);
  value.clarification.checks.pop(); value.clarification.remainingQuestions = ['An actual undecided condition'];
  assert.equal(validate(value, context).clarification.canResolve, false);
});
