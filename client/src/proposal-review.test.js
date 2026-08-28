import { expect, test } from 'vitest';
import { applyProposal, reverseProposal, proposalWarnings } from './proposal-review.js';
import { roomBookingRegistry } from './room-booking.fixture.js';
import { validateReviewContent } from './review-fields.js';
import { normalizeProposalMetadata } from '../../server/src/services/proposal-metadata.js';

const initial = () => ({ content: roomBookingRegistry(), decisions: {}, drafts: {}, reservedIds: [] });
test.each(['BR', 'SR', 'FR', 'NFR', 'TR', 'CON'])('exact %s proposal is idempotent and server validates authoritative lineage', (type) => {
  const state = initial();
  const enhancement = { key: 'i1:0', text: 'Предложить уточнить правило', targetType: type, targetIds: ['BR-001'] };
  const plan = { operation: 'add', targetType: type, text: 'Система применяет проверяемое правило.', fields: { category: 'Скорость', obligation: 'Соблюдать политику' } };
  const first = applyProposal(state, enhancement, plan);
  const second = applyProposal(first, enhancement, plan);
  expect(second.content.groups[type]).toHaveLength(state.content.groups[type].length + 1);
  expect(validateReviewContent(second.content)).toBeNull();
  const saved = normalizeProposalMetadata({ supplied: second.decisions.review.proposals, content: second.content, baseContent: state.content, researchResult: { insights: [{ id: 'i1', enhancements: [enhancement] }] }, researchJobId: 'research', baseVersionId: 'base', stamp: { actorUserId: 'real-user', recordedAt: 'server-time' } });
  expect(saved['i1:0']).toMatchObject({ actorUserId: 'real-user', researchJobId: 'research', baseVersionId: 'base', originalText: enhancement.text, after: { text: plan.text } });
  expect(state.content.groups[type]).not.toEqual(second.content.groups[type]);
});
test('replacement keeps identity and can reverse to source or preserve a manual revision', () => {
  const state = initial();
  const enhancement = { key: 'i1:0', text: 'Новая логика', targetType: 'FR' };
  const applied = applyProposal(state, enhancement, { operation: 'replace', targetType: 'FR', targetId: 'FR-001', text: 'Новая проверяемая логика', fields: {} });
  expect(applied.content.groups.FR).toHaveLength(2);
  expect(applied.content.groups.FR[0].source).toEqual(state.content.groups.FR[0].source);
  applied.content.groups.FR[0].text = 'Ручная доработка после сохранения';
  expect(reverseProposal(applied, enhancement.key, false).content.groups.FR[0]).toEqual(state.content.groups.FR[0]);
  const retained = reverseProposal(applied, enhancement.key, true);
  expect(retained.content.groups.FR[0].text).toBe('Ручная доработка после сохранения');
  expect(retained.content.groups.FR[0].researchEnhancementKey).toBeUndefined();
  expect(retained.decisions.acceptedEnhancementKeys).toEqual([]);
});
test('reverse removes dangling relations and never reuses the removed identifier', () => {
  const state = initial();
  const enhancement = { key: 'i1:0', text: 'Правило', targetType: 'FR' };
  const plan = { operation: 'add', targetType: 'FR', text: 'Новое правило', fields: {} };
  const applied = applyProposal(state, enhancement, plan);
  applied.content.groups.BR[0].relatedIds = ['FR-003'];
  const reversed = reverseProposal(applied, enhancement.key, false);
  expect(reversed.content.groups.BR[0].relatedIds).toEqual([]);
  expect(applyProposal(reversed, enhancement, plan).content.groups.FR.at(-1).id).toBe('FR-004');
});
test('legacy exact proposals retain edits without duplicates and warn without rewriting', () => {
  const state = { content: { business: [], functional: [], nonfunctional: [] }, decisions: {}, drafts: {} };
  const enhancement = { key: 'i1:0', text: 'Предложить уточнить каналы协作', targetType: 'functional' };
  const plan = { operation: 'add', targetType: 'functional', text: 'Система уведомляет по почте.', fields: {} };
  const applied = applyProposal(state, enhancement, plan);
  expect(applyProposal(applied, enhancement, plan).content.functional).toHaveLength(1);
  expect(proposalWarnings(enhancement.text)).toHaveLength(2);
  expect(enhancement.text).toBe('Предложить уточнить каналы协作');
});
