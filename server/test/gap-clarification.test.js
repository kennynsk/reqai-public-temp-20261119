import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDiscussionContext, validateDiscussionProposal } from '../src/services/requirement-discussion-service.js';
import { linkedRequirements, normalizeReviewMetadata } from '../src/services/review-metadata.js';

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
    assert.equal(validate(value, context).clarification.canResolve, false, variant);
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
