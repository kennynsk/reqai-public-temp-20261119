import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReviewMetadata, reviewIssues } from '../src/services/review-metadata.js';

const gap = { id: 'GAP-001', text: 'Не указан часовой пояс', affectedIds: ['FR-001'] };
const content = { groups: { FR: [{ id: 'FR-001', text: 'Бронировать комнату', quality: 'Готово' }] }, analysis: { GAP: [gap] } };
const input = { content, allowedGaps: [gap], contextId: 'source', actorId: 'alice', now: new Date('2026-08-28T10:00:00Z'), baseVersionId: 'v1' };

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
