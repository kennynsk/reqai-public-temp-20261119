import { expect, test } from 'vitest';
import { clarificationIsCurrent, reconcileDiscussionReceipts } from './gap-clarification.js';
import { gapChecklist } from './review-metadata.js';
import { reviewReducer } from './review-state.js';
import { buildDiscussionContext, validateDiscussionProposal } from '../../server/src/services/requirement-discussion-service.js';
import { normalizeReviewMetadata } from '../../server/src/services/review-metadata.js';

function initial() {
  return { drafts: {}, decisions: {}, content: {
    groups: { FR: [{ id: 'FR-001', text: 'Отправить уведомление', relatedTo: [], source: { quote: 'Клиент получает уведомление' } }], SR: [{ id: 'SR-001', text: 'Клиент получает уведомление', relatedTo: ['GAP-001'] }] },
    context: [{ id: 'CTX-001', text: 'Мобильное приложение' }],
    analysis: { GAP: [{ id: 'GAP-001', text: 'Не указан канал', affectedIds: ['FR-001', 'TERM-001', 'CTX-001'] }], TERM: [{ id: 'TERM-001', text: 'Уведомление' }], questions: [{ id: 'QUESTION-001', gapId: 'GAP-001', text: 'Какой канал использовать?' }] },
  } };
}
function proposal(state, { partial = false, noChange = false, text = 'Отправить push-уведомление', id = 'proposal-001', version = 'v1' } = {}) {
  const snapshot = buildDiscussionContext({ content: state.content, decisions: state.decisions, anchorId: 'GAP-001', baseVersionId: version });
  return { proposalId: id, ...validateDiscussionProposal({ explanation: 'Уточнить канал', changes: noChange ? [] : [{ targetId: 'FR-001', before: { text: state.content.groups.FR[0].text }, after: { text }, rationale: 'Пользователь выбрал канал' }], clarification: { gapId: 'GAP-001', answer: text, remainingQuestions: partial ? ['Какой резервный канал?'] : [], checks: [{ requirementId: 'FR-001', state: noChange ? 'no-change' : 'incorporated', reason: noChange ? 'Уже отражено' : 'Канал указан' }, { requirementId: 'SR-001', state: 'no-change', reason: 'Потребность уже отражена' }] } }, { content: snapshot }) };
}
function apply(state, item) {
  const content = structuredClone(state.content);
  for (const change of item.changes) Object.assign(Object.values(content.groups).flat().find((record) => record.id === change.targetId), change.after);
  const { gapId, answer, canResolve, remainingQuestions, checks } = item.clarification;
  return reviewReducer(state, { type: 'proposal', value: content, clarification: item.clarification, proposal: { ...item, clarification: { gapId, answer, canResolve, remainingQuestions, checks }, decision: 'accepted' }, clearDraftIds: item.changes.map((change) => change.targetId) });
}
function persist(state, inherited, version = 'v1') {
  const decisions = reconcileDiscussionReceipts(state.decisions, state.content);
  return normalizeReviewMetadata({ supplied: decisions.review, inherited, content: state.content, allowedGaps: state.content.analysis.GAP, contextId: 'source', actorId: 'alice', now: new Date('2026-09-12T18:00:00Z'), baseVersionId: version });
}

test('acceptance updates answer, requirements, checks and receipt atomically and survives server normalization', () => {
  const state = initial();
  state.content.analysis.GAP.push({ id: 'GAP-002', text: 'Другой вопрос', affectedIds: ['FR-001'] });
  state.decisions = { review: { schemaVersion: 1, gaps: { 'GAP-002': { state: 'closed', closureKind: 'resolved', answer: 'Прежний ответ', reason: 'Проверено' } }, gapRequirements: { 'GAP-002': { 'FR-001': { state: 'incorporated' } } } } };
  const item = proposal(state);
  expect(clarificationIsCurrent(state.content, state.decisions, item)).toBe(true);
  const next = apply(state, item);
  expect(next.content.groups.FR[0].text).toBe('Отправить push-уведомление');
  expect(next.content.groups.FR[0].source).toEqual(state.content.groups.FR[0].source);
  expect(next.content.analysis).toEqual(state.content.analysis);
  expect(next.decisions.review.gaps['GAP-001']).toMatchObject({ state: 'closed', closureKind: 'resolved', answer: 'Отправить push-уведомление' });
  expect(next.decisions.review.gaps['GAP-002'].state).toBe('answered');
  const saved = persist(next);
  expect(saved.gaps['GAP-001'].state).toBe('closed');
  expect(saved.gapRequirements['GAP-001']['FR-001']).toMatchObject({ state: 'incorporated', actorUserId: 'alice' });
  expect(gapChecklist(next.content, next.content.analysis.GAP[0], saved)).toHaveLength(2);
  expect(saved.discussionProposals['proposal-001'].clarification.canResolve).toBe(true);
});

test('no-change-only package closes and persists without modifying requirements', () => {
  const state = initial();
  const next = apply(state, proposal(state, { noChange: true }));
  expect(next.content).toEqual(state.content);
  expect(persist(next).gaps['GAP-001'].state).toBe('closed');
});

test.each(['requirement', 'no-change requirement', 'question', 'link', 'term', 'source', 'state'])('a changed %s invalidates the entire package before any update', (kind) => {
  const state = initial(); const item = proposal(state);
  if (kind === 'requirement') state.content.groups.FR[0].text = 'Новая правка';
  if (kind === 'no-change requirement') state.content.groups.SR[0].text = 'Новая потребность';
  if (kind === 'question') state.content.analysis.questions[0].text = 'Иной вопрос';
  if (kind === 'link') state.content.analysis.GAP[0].affectedIds.push('FR-002');
  if (kind === 'term') state.content.analysis.TERM[0].text = 'Новое определение';
  if (kind === 'source') state.content.groups.FR[0].source.quote = 'Другой источник';
  if (kind === 'state') state.decisions = { review: { gaps: { 'GAP-001': { state: 'answered' } } } };
  expect(clarificationIsCurrent(state.content, state.decisions, item)).toBe(false);
});

test('partial then complete acceptance can be saved together while retaining the earlier receipt as history', () => {
  let state = initial();
  state = apply(state, proposal(state, { partial: true }));
  expect(state.decisions.review.gaps['GAP-001'].state).toBe('answered');
  state = apply(state, proposal(state, { text: 'Отправить push, при ошибке email', id: 'proposal-002' }));
  const saved = persist(state);
  expect(saved.gaps['GAP-001'].state).toBe('closed');
  expect(saved.discussionProposals['proposal-001'].superseded).toBe(true);
  expect(saved.discussionProposals['proposal-002'].superseded).toBeUndefined();
});

test('a new accepted package refreshes the confirmation basis after a saved partial answer', () => {
  let state = initial();
  state = apply(state, proposal(state, { partial: true }));
  const firstSave = persist(state);
  state.decisions = { review: firstSave };
  state = apply(state, proposal(state, { text: 'Отправить push, при ошибке email', id: 'proposal-002', version: 'v2' }));
  const saved = persist(state, firstSave, 'v2');
  expect(saved.gaps['GAP-001'].state).toBe('closed');
  expect(saved.gapRequirements['GAP-001']['FR-001'].state).toBe('incorporated');
  expect(saved.discussionProposals['proposal-001']).toEqual(firstSave.discussionProposals['proposal-001']);
});

test('manual edits after acceptance remain saveable and reopen the question', () => {
  let state = initial();
  state = apply(state, proposal(state));
  const content = structuredClone(state.content); content.groups.FR[0].text = 'Моя формулировка';
  state = reviewReducer(state, { type: 'content', value: content });
  const saved = persist(state);
  expect(saved.gaps['GAP-001'].state).toBe('answered');
  expect(saved.discussionProposals['proposal-001'].superseded).toBe(true);
});
