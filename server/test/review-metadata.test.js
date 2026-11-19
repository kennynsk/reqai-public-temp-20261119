import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticQualityReason } from '../src/services/requirement-quality-context.js';
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

test('accepted additions persist with closure; missing, conflicting or altered records cannot be saved', () => {
  const record = { id: 'FR-002', text: 'Решение возобновляет переводы сразу после подтверждения клиента.', relatedTo: ['GAP-001'], source: { artifactId: 'source', locator: 'discussion:GAP-001', quote: null }, provenance: 'Предложено — требует подтверждения', quality: 'Требует уточнения' };
  const nextContent = { ...structuredClone(content), materials: { primary: { artifactId: 'source' } } };
  nextContent.groups.FR.push(record);
  const checks = [{ requirementId: 'FR-001', state: 'no-change', reason: 'Существующее требование сохраняется' }, { requirementId: 'FR-002', state: 'incorporated', reason: 'Добавлено по ответу' }];
  const supplied = { schemaVersion: 1, gaps: { 'GAP-001': { state: 'closed', closureKind: 'resolved', answer: 'Сразу', reason: 'Ответ учтён' } }, gapRequirements: { 'GAP-001': Object.fromEntries(checks.map(({ requirementId, ...check }) => [requirementId, check])) }, discussionProposals: { 'new-proposal-001': { decision: 'accepted', changes: [], additions: [{ type: 'FR', record, rationale: 'Подтверждено клиентом' }], clarification: { gapId: 'GAP-001', answer: 'Сразу', canResolve: true, remainingQuestions: [], checks } } } };
  const args = { ...input, content: nextContent, baseContent: content, supplied };
  const saved = normalizeReviewMetadata(args);
  assert.equal(saved.gaps['GAP-001'].state, 'closed');
  assert.deepEqual(saved.discussionProposals['new-proposal-001'].additions[0].record, record);
  assert.equal(saved.gapRequirements['GAP-001']['FR-002'].state, 'incorporated');
  assert.deepEqual(normalizeReviewMetadata({ ...args, baseContent: nextContent, baseVersionId: 'v2', inherited: saved, supplied: saved }), saved);
  const altered = structuredClone(nextContent); altered.groups.FR[1].text = 'Иной смысл';
  for (const patch of [{ content }, { content: altered }, { baseContent: nextContent }]) assert.throws(() => normalizeReviewMetadata({ ...args, ...patch }), { code: 'INVALID_REVIEW_METADATA' });
  const duplicate = structuredClone(supplied); duplicate.discussionProposals['new-proposal-001'].additions.push({ type: 'FR', record, rationale: 'Дубль' });
  assert.throws(() => normalizeReviewMetadata({ ...args, supplied: duplicate }), { code: 'INVALID_REVIEW_METADATA' });
});

test('prior-answer receipt bases preserve optional state and stale flags and reject malformed flags', () => {
  const receipt = { decision: 'rejected', changes: [], gapBases: { 'GAP-001': { question: gap.text, answer: 'UTC', state: 'closed', stale: false } } };
  const save = (value) => normalizeReviewMetadata({ ...input, supplied: { schemaVersion: 1, discussionProposals: { 'prior-answer-001': value } } });
  assert.deepEqual(save(receipt).discussionProposals['prior-answer-001'].gapBases['GAP-001'], receipt.gapBases['GAP-001']);
  for (const patch of [{ state: 'invented' }, { stale: 'false' }]) {
    const invalid = structuredClone(receipt); Object.assign(invalid.gapBases['GAP-001'], patch);
    assert.throws(() => save(invalid));
  }
});

test('accepted quality receipts compact duplicated bases without losing evidence or accepting forged history', () => {
  const assessment = {
    schemaVersion: 'babok-quality-assessment.v2', revision: 'quality-rev',
    basis: { records: [{ id: 'FR-001', text: 'x'.repeat(270000) }] },
    assessedRecords: [{ ...content.groups.FR[0], type: 'FR' }],
    assessments: [{ id: 'FR-001', quality: 'Готово', reason: 'Результат определён.', blockingGapIds: [], evidence: [{ recordId: 'FR-001', field: 'text', quote: content.groups.FR[0].text }] }],
    semanticReview: { schemaVersion: 'babok-quality-review.v1', revision: 'quality-rev', pass: true, checks: [{ id: 'FR-001', pass: true, issues: [] }] },
  };
  const supplied = { schemaVersion: 1, discussionProposals: { 'quality-receipt-001': { decision: 'accepted', changes: [{ targetId: 'FR-001', targetType: 'FR', before: { text: 'Бронировать' }, after: { text: content.groups.FR[0].text } }], qualityAssessment: assessment } } };
  const saved = normalizeReviewMetadata({ ...input, supplied });
  const compact = saved.discussionProposals['quality-receipt-001'].qualityAssessment;
  assert.equal(compact.basis, undefined);
  assert.match(compact.basisHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(compact.assessedRecords, assessment.assessedRecords);
  assert.deepEqual(compact.assessments, assessment.assessments);
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 262144);
  const again = normalizeReviewMetadata({ ...input, supplied: saved, inherited: saved });
  assert.deepEqual(again.discussionProposals, saved.discussionProposals);
  const old = structuredClone(saved); old.discussionProposals['quality-receipt-001'].qualityAssessment = assessment;
  assert.deepEqual(normalizeReviewMetadata({ ...input, supplied: old, inherited: saved }).discussionProposals['quality-receipt-001'].qualityAssessment, compact);
  assert.deepEqual(normalizeReviewMetadata({ ...input, inherited: old }).discussionProposals['quality-receipt-001'].qualityAssessment, compact);
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: saved }), /Invalid AI quality/);
  const forged = structuredClone(saved); forged.discussionProposals['quality-receipt-001'].qualityAssessment.assessments[0].reason = 'Forged';
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: forged, inherited: saved }), /Invalid AI quality/);
  const huge = structuredClone(supplied); huge.discussionProposals['quality-receipt-001'].qualityAssessment.assessedRecords[0].text = 'x'.repeat(270000);
  assert.throws(() => normalizeReviewMetadata({ ...input, supplied: huge }), /256 KiB/);
});

test('repeated historical quality records are interned losslessly and dictionary tampering is rejected', () => {
  const record = { ...content.groups.FR[0], text: 'Historical substantive condition '.repeat(30), type: 'FR' };
  const qualityAssessment = { schemaVersion: 'babok-quality-assessment.v2', assessedRecords: [record], assessments: [{ id: record.id, quality: record.quality, reason: 'Historical reason', evidence: [] }], semanticReview: { pass: true } };
  const inherited = { schemaVersion: 1, discussionProposals: Object.fromEntries(['historical-one', 'historical-two'].map((proposalId) => [proposalId, { proposalId, decision: 'accepted', changes: [], qualityAssessment }])) };
  const saved = normalizeReviewMetadata({ ...input, inherited });
  const reference = saved.discussionProposals['historical-one'].qualityAssessment.assessedRecords[0];
  const { type, ...currentRecord } = record;
  assert.equal(automaticQualityReason(currentRecord, { review: saved }), 'Historical reason');
  assert.equal(automaticQualityReason({ ...currentRecord, text: 'Changed' }, { review: saved }), null);
  assert.equal(Object.keys(saved.qualityRecords).length, 1);
  assert.deepEqual(saved.qualityRecords[reference.recordRef], record);
  assert.deepEqual(saved.discussionProposals['historical-one'].qualityAssessment.assessments, qualityAssessment.assessments);
  assert.deepEqual(normalizeReviewMetadata({ ...input, inherited: saved, supplied: saved }).discussionProposals, saved.discussionProposals);
  const corrupted = structuredClone(saved); corrupted.qualityRecords[reference.recordRef].text = 'Changed';
  assert.throws(() => normalizeReviewMetadata({ ...input, inherited: saved, supplied: corrupted }), /digest/);
  const missing = structuredClone(saved); delete missing.qualityRecords[reference.recordRef];
  assert.throws(() => normalizeReviewMetadata({ ...input, inherited: saved, supplied: missing }), /reference/);
});
