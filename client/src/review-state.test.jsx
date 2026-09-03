// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { SessionContext } from './review-context.js';
import { assembleReview, reviewReducer, rebaseReview, readReviewDraft, clearReviewDrafts, DRAFT_TTL, useReviewState } from './review-state.js';
import { roomBookingRegistry } from './room-booking.fixture.js';

test('rebase merges independent GAP answers and omission entries without carrying approval', () => {
  const content = roomBookingRegistry();
  const base = { review: { schemaVersion: 1, gaps: {}, omissions: [] } };
  const local = { review: { ...base.review, gaps: { 'GAP-001': { state: 'answered', answer: 'Мой ответ' } }, omissions: [{ id: 'OMISSION-local', text: 'Мой пропуск' }] } };
  const remote = { review: { ...base.review, gaps: { 'GAP-002': { state: 'answered', answer: 'Другой ответ' } }, omissions: [{ id: 'OMISSION-remote', text: 'Другой пропуск' }], completeness: { checked: true, stale: false } } };
  const result = rebaseReview({ content, decisions: local, drafts: {} }, content, content, base, remote);
  expect(Object.keys(result.state.decisions.review.gaps)).toEqual(['GAP-002', 'GAP-001']);
  expect(result.state.decisions.review.omissions).toHaveLength(2);
  expect(result.state.decisions.review.completeness.stale).toBe(true);
  expect(remote.review.completeness.stale).toBe(false);
});

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

test('covers reducer fallbacks, content functions, validation errors, and normalization', () => {
  const state = { content: { FR: [] }, decisions: { keep: true }, drafts: {}, reservedIds: [] };
  expect(reviewReducer(state, { type: 'unknown' })).toBe(state);
  expect(reviewReducer(state, { type: 'decisions', value: { changed: true } }).decisions).toEqual({ changed: true });
  expect(reviewReducer(state, { type: 'restore', value: { restored: true } })).toEqual({ restored: true });
  expect(reviewReducer(state, { type: 'content', value: (value) => value }).decisions).toBe(state.decisions);

  const invalid = assembleReview({ content: { NFR: [{ id: 'NFR-1', text: 'Шифрование' }] }, decisions: {}, drafts: {} });
  expect(invalid.error).toMatchObject({ id: 'NFR-1', field: 'category' });
  const normalized = assembleReview({ content: { FR: [] }, decisions: { ok: true }, drafts: {} }, undefined, (content) => ({ ...content, normalized: true }));
  expect(normalized).toEqual({ content: { FR: [], normalized: true }, decisions: { ok: true } });
});

test('rebases deletions, local additions, field labels, skipped groups, and deleted decisions', () => {
  const base = {
    groups: {
      BR: [{ id: 'BR-1', text: 'База' }, { id: 'BR-2', text: 'Удалить' }],
      ignored: [{ id: 'I-1', text: 'Ignored' }],
    },
    context: [],
    analysis: { GAP: [], HYP: [], TERM: [], traceability: [], delta: [] },
  };
  const remote = structuredClone(base);
  remote.groups.BR.push({ id: 'BR-4', text: 'Серверная запись' });
  const local = structuredClone(base);
  local.groups.BR = [{ id: 'BR-1', text: 'Моя версия' }, { id: 'BR-3', text: 'Новая локальная запись' }];
  local.groups.ignored = { not: 'an array' };
  const result = rebaseReview({
    content: local,
    decisions: { review: { keep: 'local' } },
    drafts: {
      edited: { group: 'BR', id: 'BR-1', initialText: 'База', text: 'Моя версия', fields: { quality: 'Конфликтует', relatedIds: ['BR-3'], custom: 'значение' } },
    },
  }, base, remote, { review: { keep: 'base', removed: 'base-only' } }, { review: { keep: 'remote', removed: 'remote-only' } });

  expect(result.state.content.groups.BR.map((record) => record.id)).toEqual(['BR-1', 'BR-4', 'BR-3']);
  expect(result.state.content.groups.BR[0]).toMatchObject({ text: 'Моя версия' });
  expect(result.state.drafts.edited.fields).toMatchObject({ quality: 'Конфликтует', relatedIds: ['BR-3'], custom: 'значение' });
  expect(result.changes.some((change) => change.operation === 'Добавление')).toBe(true);
  expect(result.changes.some((change) => change.id === 'BR-1 · Качество')).toBe(true);
  expect(result.changes.some((change) => change.id === 'BR-1 · Дополнительное поле')).toBe(true);
  expect(result.state.decisions.review).not.toHaveProperty('removed');
});

test('delegates recovery from a different editor to the session', () => {
  const key = 'reqai.reviewDraft:tenant:job';
  const restoreRecovery = vi.fn();
  const content = { FR: [] };
  sessionStorage.setItem(key, JSON.stringify({ schemaVersion: 1, updatedAt: Date.now(), state: { content, decisions: {}, drafts: {}, editor: 'research' } }));
  const wrapper = ({ children }) => <SessionContext.Provider value={{ key, baseVersionId: 'v1', restoreRecovery }}>{children}</SessionContext.Provider>;
  const { result } = renderHook(() => useReviewState(content, {}, { editor: 'requirements' }), { wrapper });

  expect(result.current.recovery).toBeTruthy();
  act(() => result.current.restore());
  expect(restoreRecovery).toHaveBeenCalledWith(result.current.recovery);
  sessionStorage.removeItem(key);
});
