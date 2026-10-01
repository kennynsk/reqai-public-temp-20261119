import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReviewMetadata, reviewIssues } from '../src/services/review-metadata.js';

const gap = { id: 'GAP-001', text: 'Не указан часовой пояс', affectedIds: ['FR-001'] };
const content = { groups: { FR: [{ id: 'FR-001', text: 'Бронировать комнату', quality: 'Готово' }] }, analysis: { GAP: [gap] } };
const input = { content, allowedGaps: [gap], contextId: 'source', actorId: 'alice', now: new Date('2026-08-28T10:00:00Z'), baseVersionId: 'v1' };

test('assessment-only changes preserve checked answers and closure, while content or answer changes require rechecking', () => {
  const checked = normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1,
    gaps: { 'GAP-001': { state: 'closed', answer: 'UTC', reason: 'Проверено', closureKind: 'resolved' } },
    gapRequirements: { 'GAP-001': { 'FR-001': { state: 'incorporated' } } },
  } });
  const nextContent = structuredClone(content);
  nextContent.groups.FR[0].quality = 'Требует уточнения';
  const next = normalizeReviewMetadata({ ...input, baseContent: content, content: nextContent, inherited: checked, actorId: 'bob', now: new Date('2026-08-28T11:00:00Z') });
  assert.equal(next.gaps['GAP-001'].state, 'closed');
  const confirmation = next.gapRequirements['GAP-001']['FR-001'];
  assert.equal(confirmation.state, 'incorporated');
  assert.equal(confirmation.actorUserId, 'alice');
  assert.equal(confirmation.recordedAt, checked.gapRequirements['GAP-001']['FR-001'].recordedAt);
  assert.notEqual(confirmation.requirementHash, checked.gapRequirements['GAP-001']['FR-001'].requirementHash);
  const again = normalizeReviewMetadata({ ...input, baseContent: nextContent, content: nextContent, inherited: next });
  assert.equal(again.gaps['GAP-001'].state, 'closed');
  for (const patch of [{ text: 'Другая формулировка' }, { relatedTo: ['BR-002'] }, { source: { quote: 'Другой источник' } }]) {
    const changed = structuredClone(nextContent);
    Object.assign(changed.groups.FR[0], patch);
    const stale = normalizeReviewMetadata({ ...input, baseContent: content, content: changed, inherited: checked });
    assert.equal(stale.gaps['GAP-001'].state, 'answered');
    assert.equal(stale.gapRequirements['GAP-001']['FR-001'].state, 'pending');
  }
  const differentAnswer = normalizeReviewMetadata({ ...input, baseContent: content, content: nextContent, inherited: checked, supplied: { schemaVersion: 1, gaps: { 'GAP-001': { ...checked.gaps['GAP-001'], answer: 'UTC+3' } } } });
  assert.equal(differentAnswer.gapRequirements['GAP-001']['FR-001'].state, 'pending');
  assert.equal(differentAnswer.gaps['GAP-001'].state, 'answered');
});

test('answers remain open, closing/reopening needs reason and actors are authoritative', () => {
  const answered = normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'answered', answer: 'UTC', actorUserId: 'forged' } } } });
  assert.equal(answered.gaps['GAP-001'].actorUserId, 'alice');
  assert.equal(reviewIssues(content, answered.gaps).length, 1);
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'closed', answer: 'UTC' } } } }), { code: 'INVALID_REVIEW_METADATA' });
  const closed = normalizeReviewMetadata({ ...input, inherited: answered, supplied: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'closed', answer: 'UTC', reason: 'Согласовано' } } } });
  assert.equal(reviewIssues(content, closed.gaps).length, 0);
  assert.throws(() => normalizeReviewMetadata({ ...input, inherited: closed, supplied: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'open', answer: 'UTC', reason: '' } } } }), { code: 'INVALID_REVIEW_METADATA' });
});

test('resolved closure requires a closed state and a non-empty answer', () => {
  const checks = { schemaVersion: 1, gapRequirements: { 'GAP-001': { 'FR-001': { state: 'incorporated' } } } };
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: { ...checks, gaps: { 'GAP-001': { state: 'answered', answer: 'UTC', closureKind: 'resolved' } } } }), { code: 'INVALID_REVIEW_METADATA' });
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: { ...checks, gaps: { 'GAP-001': { state: 'closed', answer: '', closureKind: 'resolved', reason: 'Проверено' } } } }), { code: 'INVALID_REVIEW_METADATA' });
});

test('old clients preserve decisions while content changes invalidate evidence', () => {
  const reviewed = normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, completeness: { check: true }, acknowledgment: { confirm: true } }, finalizing: true });
  const unchanged = normalizeReviewMetadata({ ...input, inherited: reviewed });
  assert.equal(unchanged.completeness.stale, false);
  assert.equal(unchanged.acknowledgment.stale, false);
  const changed = normalizeReviewMetadata({ ...input, content: { ...content, groups: { FR: [{ ...content.groups.FR[0], text: 'Изменённое действие' }] } }, inherited: reviewed });
  assert.equal(changed.completeness.stale, true);
  assert.equal(changed.acknowledgment.stale, true);
  assert.equal(changed.completeness.recordedAt, reviewed.completeness.recordedAt);
});

test('new finalization needs current acknowledgment, supplied stamps cannot forge approval', () => {
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, acknowledgment: { confirmed: true, stale: false } }, finalizing: true }), { code: 'REVIEW_ACKNOWLEDGMENT_REQUIRED' });
  const reviewed = normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, acknowledgment: { confirm: true } }, finalizing: true });
  assert.deepEqual(reviewed.acknowledgment.issueIds, ['GAP-001']);
  assert.equal(reviewed.acknowledgment.baseVersionId, 'v1');
});

test('references, schema and payload sizes are validated before persistence', () => {
  for (const supplied of [null, { schemaVersion: 2 }, { schemaVersion: 1, gaps: { 'GAP-999': { state: 'open' } } }, { schemaVersion: 1, omissions: [{ id: 'OMISSION-1', text: 'Пропуск', requirementIds: ['FOREIGN-1'] }] }, { schemaVersion: 1, gaps: { 'GAP-001': { state: 'answered', answer: 'x'.repeat(20001) } } }]) {
    assert.throws(() => normalizeReviewMetadata({ ...input, supplied }), { code: 'INVALID_REVIEW_METADATA' });
  }
});

test('a partial clarification cannot be resolved by completing only requirement checks, but can be dismissed with a reason', () => {
  const check = { requirementId: 'FR-001', state: 'no-change', reason: 'Формулировка уже подходит' };
  const partial = normalizeReviewMetadata({ ...input, supplied: {
    schemaVersion: 1,
    gaps: { 'GAP-001': { state: 'answered', answer: 'Используется UTC' } },
    gapRequirements: { 'GAP-001': { 'FR-001': { state: check.state, reason: check.reason } } },
    discussionProposals: { 'partial-001': { decision: 'accepted', baseVersionId: 'v1', changes: [], clarification: { gapId: 'GAP-001', answer: 'Используется UTC', canResolve: false, remainingQuestions: ['Как отображать часовой пояс клиенту?'], checks: [check] } } },
  } });
  const closure = { schemaVersion: 1, gaps: { 'GAP-001': { state: 'closed', answer: 'Используется UTC', reason: 'Все требования проверены', closureKind: 'resolved' } } };
  assert.throws(() => normalizeReviewMetadata({ ...input, inherited: partial, supplied: closure }), { code: 'REVIEW_GAP_ANSWERS_REQUIRED' });
  const dismissed = normalizeReviewMetadata({ ...input, inherited: partial, supplied: { ...closure, gaps: { 'GAP-001': { ...closure.gaps['GAP-001'], closureKind: 'dismissed', reason: 'Владелец исключил вопрос из текущего объёма' } } } });
  assert.equal(dismissed.gaps['GAP-001'].closureKind, 'dismissed');
});
