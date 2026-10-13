import { expect, test } from 'vitest';
import { reviewReducer } from './review-state.js';
import { qualityAssessmentContext, applyQualityAssessment, qualityAssessmentIsCurrent, automaticQualityReason, QUALITY_POLICY } from '../../server/src/services/requirement-quality-context.js';
import { normalizeReviewMetadata } from '../../server/src/services/review-metadata.js';

test('automatic assessment updates the counter and persists its reason without reopening closed questions or altering meaning', () => {
  const content = { groups: { FR: [{ id: 'FR-001', text: 'Показать состояние выплаты.', quality: 'Требует уточнения', relatedTo: ['GAP-001'] }] }, analysis: { GAP: [{ id: 'GAP-001', text: 'Не определён статус.', affectedIds: ['FR-001'] }], questions: [] } };
  const decisions = { review: { schemaVersion: 1, gaps: { 'GAP-001': { state: 'closed', closureKind: 'resolved', answer: 'Проведена или отклонена.' } }, gapRequirements: { 'GAP-001': { 'FR-001': { state: 'no-change', reason: 'Статусы согласованы.' } } } } };
  const assessment = { schemaVersion: QUALITY_POLICY, revision: 'rev', basis: qualityAssessmentContext(content, decisions), assessedRecords: qualityAssessmentContext(content, decisions).records, assessments: [{ id: 'FR-001', before: 'Требует уточнения', quality: 'Готово', reason: 'Объект, действие и наблюдаемый результат определены.', blockingGapIds: [], evidence: [{ recordId: 'FR-001', field: 'text', quote: content.groups.FR[0].text }] }], semanticReview: { schemaVersion: 'babok-quality-review.v1', revision: 'rev', pass: true, checks: [{ id: 'FR-001', pass: true, issues: [] }] } };
  expect(qualityAssessmentIsCurrent(content, decisions, assessment)).toBe(true);
  const nextContent = applyQualityAssessment(content, assessment);
  const receipt = { proposalId: 'quality-proposal-001', decision: 'accepted', changes: [], qualityAssessment: assessment, clarification: { gapId: 'GAP-001', answer: 'Проведена или отклонена.', canResolve: true, remainingQuestions: [], checks: [{ requirementId: 'FR-001', state: 'no-change', reason: 'Статусы согласованы.' }] } };
  const next = reviewReducer({ content, decisions, drafts: {} }, { type: 'proposal', value: nextContent, proposal: receipt, clarification: receipt.clarification });
  expect(next.content.groups.FR.filter((record) => record.quality === 'Готово')).toHaveLength(1);
  expect(next.content.groups.FR[0].text).toBe(content.groups.FR[0].text);
  expect(next.decisions.review.gaps['GAP-001'].state).toBe('closed');
  expect(next.decisions.review.gapRequirements['GAP-001']['FR-001'].stale).toBe(false);
  const saved = normalizeReviewMetadata({ supplied: next.decisions.review, inherited: decisions.review, content: next.content, baseContent: content, allowedGaps: content.analysis.GAP, actorId: 'user', contextId: 'source', now: new Date() });
  expect(saved.gaps['GAP-001'].state).toBe('closed');
  expect(saved.discussionProposals['quality-proposal-001'].qualityAssessment.assessments[0].quality).toBe('Готово');
  expect(automaticQualityReason(next.content.groups.FR[0], { review: saved })).toMatch(/наблюдаемый результат/);
  expect(automaticQualityReason({ ...next.content.groups.FR[0], text: 'Другое действие.' }, { review: saved })).toBeNull();
  const legacy = structuredClone(saved.discussionProposals['quality-proposal-001']);
  legacy.qualityAssessment.schemaVersion = 'babok-quality-assessment.v1';
  delete legacy.qualityAssessment.semanticReview;
  const inherited = { ...saved, discussionProposals: { 'quality-proposal-001': legacy } };
  const supplied = structuredClone(inherited); supplied.discussionProposals['quality-proposal-001'].superseded = true;
  const retained = normalizeReviewMetadata({ supplied, inherited, content: next.content, baseContent: next.content, allowedGaps: content.analysis.GAP, actorId: 'user', contextId: 'source', now: new Date() });
  expect(retained.discussionProposals['quality-proposal-001'].qualityAssessment).toEqual(legacy.qualityAssessment);
  expect(automaticQualityReason(next.content.groups.FR[0], { review: inherited })).toBeNull();
  supplied.discussionProposals['quality-proposal-001'].qualityAssessment.assessments[0].reason = 'Переписанная история';
  expect(() => normalizeReviewMetadata({ supplied, inherited, content: next.content, allowedGaps: content.analysis.GAP, actorId: 'user', contextId: 'source', now: new Date() })).toThrow();
});

test('stale answer changes invalidate a prepared quality assessment', () => {
  const content = { groups: { FR: [{ id: 'FR-001', text: 'Показать статус.', quality: 'Готово' }] }, analysis: { GAP: [{ id: 'GAP-001', affectedIds: ['FR-001'] }] } };
  const assessment = { basis: qualityAssessmentContext(content, { review: { gaps: { 'GAP-001': { answer: 'Первый ответ' } } } }) };
  expect(qualityAssessmentIsCurrent(content, { review: { gaps: { 'GAP-001': { answer: 'Новый ответ' } } } }, assessment)).toBe(false);
});

test('saved reasons prefer current receipts over JSON key order and cannot cite a removed requirement', () => {
  const record = { id: 'FR-001', text: 'Показать статус.', quality: 'Готово' };
  const related = { id: 'FR-002', text: 'Определить статус.' };
  const assessment = (reason, evidence) => ({ schemaVersion: QUALITY_POLICY, semanticReview: { pass: true }, assessedRecords: [{ type: 'FR', ...record }], assessments: [{ id: record.id, quality: record.quality, reason, evidence }] });
  const decisions = { review: { discussionProposals: { 'new-sort-first': { decision: 'accepted', recordedAt: '2026-10-13T20:00:00Z', qualityAssessment: assessment('Новый результат', [{ recordId: record.id, field: 'text', quote: record.text }]) }, 'old-sort-last': { decision: 'accepted', recordedAt: '2026-10-13T19:00:00Z', qualityAssessment: assessment('Старый результат', [{ recordId: record.id, field: 'text', quote: record.text }]) } } } };
  expect(automaticQualityReason(record, decisions, { groups: { FR: [record] } })).toBe('Новый результат');
  decisions.review.discussionProposals['old-sort-last'].superseded = true;
  decisions.review.discussionProposals['new-sort-first'].qualityAssessment = assessment('Поведение обеспечено FR-002.', [{ recordId: record.id, field: 'text', quote: record.text }, { recordId: related.id, field: 'text', quote: related.text }]);
  expect(automaticQualityReason(record, decisions, { groups: { FR: [record, related] } })).toMatch(/FR-002/);
  expect(automaticQualityReason(record, decisions, { groups: { FR: [record] } })).toBeNull();
});
