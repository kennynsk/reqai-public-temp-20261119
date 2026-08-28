// @vitest-environment jsdom
import { expect, test } from 'vitest';
import { assembleReview, reviewReducer, rebaseReview, readReviewDraft, clearReviewDrafts, DRAFT_TTL } from './review-state.js';
import { roomBookingRegistry } from './room-booking.fixture.js';

test('assembles every pending field, including a composer, without mutating source', () => {
  const original = roomBookingRegistry();
  let state = { content: original, decisions: {}, drafts: {} };
  state = reviewReducer(state, { type: 'field', key: 'BR:BR-001', value: { group: 'BR', id: 'BR-001', text: 'Новая цель', initialText: original.groups.BR[0].text } });
  state = reviewReducer(state, { type: 'field', key: 'FR:new', value: { group: 'FR', id: 'new', text: 'Открывать комнату после обслуживания', isNew: true } });
  const result = assembleReview(state, (group, text) => ({ id: `${group}-003`, text }));
  expect(result.content.groups.BR[0].text).toBe('Новая цель');
  expect(result.content.groups.FR.at(-1).text).toBe('Открывать комнату после обслуживания');
  expect(original.groups.FR).toHaveLength(2);
  expect(original.groups.BR[0].text).not.toBe('Новая цель');
});

test('rejects a blank edited record and ignores an untouched blank composer', () => {
  const state = { content: roomBookingRegistry(), decisions: {}, drafts: { first: { group: 'BR', id: 'BR-001', text: ' ' } } };
  expect(assembleReview(state).error.id).toBe('BR-001');
  state.drafts = { first: { group: 'FR', id: 'new', text: '', isNew: true } };
  expect(assembleReview(state).content.groups.FR).toHaveLength(2);
});

test('clearing one draft preserves pending edits elsewhere', () => {
  const state = { content: {}, decisions: {}, drafts: { a: { text: 'a' }, b: { text: 'b' } } };
  expect(reviewReducer(state, { type: 'clear', key: 'a' }).drafts).toEqual({ b: { text: 'b' } });
});

test('rebase preserves remote fields and restores a locally edited record deleted remotely', () => {
  const base = roomBookingRegistry();
  const remote = structuredClone(base);
  remote.groups.BR = [];
  remote.groups.FR[0].text = 'Изменено коллегой';
  const state = { content: base, decisions: {}, drafts: { br: { group: 'BR', id: 'BR-001', initialText: base.groups.BR[0].text, text: 'Мой текст' } } };
  const rebased = rebaseReview(state, base, remote);
  const result = assembleReview(rebased.state);
  expect(result.content.groups.BR[0].text).toBe('Мой текст');
  expect(result.content.groups.FR[0].text).toBe('Изменено коллегой');
  expect(rebased.changes[0].operation).toBe('Восстановление удалённого требования');
  expect(remote.groups.BR).toHaveLength(0);
});

test('rebase does not replay unchanged editors and merges unrelated server decisions', () => {
  const base = roomBookingRegistry();
  const remote = structuredClone(base);
  remote.groups.BR[0].text = 'Новая серверная версия';
  const state = { content: base, decisions: { acceptedEnhancementKeys: ['a'] }, drafts: { br: { group: 'BR', id: 'BR-001', initialText: base.groups.BR[0].text, text: base.groups.BR[0].text } } };
  const result = rebaseReview(state, base, remote, {}, { review: { schemaVersion: 1 } });
  expect(result.state.drafts).toEqual({});
  expect(result.state.content.groups.BR[0].text).toBe('Новая серверная версия');
  expect(result.state.decisions).toEqual({ acceptedEnhancementKeys: ['a'], review: { schemaVersion: 1 } });
});

test('draft recovery enforces TTL and scoped cleanup', () => {
  sessionStorage.clear();
  const saved = { schemaVersion: 1, updatedAt: 500, state: { content: roomBookingRegistry(), drafts: {} } };
  sessionStorage.setItem('reqai.reviewDraft:a', JSON.stringify(saved));
  sessionStorage.setItem('unrelated', 'keep');
  expect(readReviewDraft('reqai.reviewDraft:a', sessionStorage, 500 + DRAFT_TTL - 1)).toEqual(saved);
  expect(readReviewDraft('reqai.reviewDraft:a', sessionStorage, 500 + DRAFT_TTL)).toBeNull();
  expect(sessionStorage.getItem('reqai.reviewDraft:a')).toBeNull();
  sessionStorage.setItem('reqai.reviewDraft:b', '{broken');
  expect(readReviewDraft('reqai.reviewDraft:b')).toBeNull();
  clearReviewDrafts();
  expect(sessionStorage.getItem('reqai.reviewDraft:b')).toBeNull();
  expect(sessionStorage.getItem('unrelated')).toBe('keep');
});
