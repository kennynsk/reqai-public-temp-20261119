// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { SessionContext } from './review-context.js';
import { assembleReview, reviewReducer, rebaseReview, readReviewDraft, clearReviewDrafts, DRAFT_TTL, useReviewState, useReviewUiState } from './review-state.js';
import { roomBookingRegistry } from './room-booking.fixture.js';

test('unfinished discussion messages persist synchronously across reload and requirement saves', () => {
  const key = 'reqai.reviewDraft:message-actor:message-task';
  const wrapper = ({ children }) => <SessionContext.Provider value={{ key, ui: new Map() }}>{children}</SessionContext.Provider>;
  sessionStorage.setItem(key, 'requirement recovery');
  const first = renderHook(() => useReviewUiState('discussionMessages', {}, { persist: true }), { wrapper });
  act(() => {
    first.result.current[1]({ 'GAP-1': 'Незаконченный ответ', 'GAP-2': 'Другой ответ' });
    expect(JSON.parse(sessionStorage.getItem(`${key}:ui:discussionMessages`)).value['GAP-1']).toBe('Незаконченный ответ');
  });
  expect(sessionStorage.getItem(key)).toBe('requirement recovery');
  first.unmount();
  // A successful requirement save clears only its recovery key; a reload also
  // replaces the in-memory session Map.
  sessionStorage.removeItem(key);
  const second = renderHook(() => useReviewUiState('discussionMessages', {}, { persist: true }), { wrapper });
  expect(second.result.current[0]['GAP-1']).toBe('Незаконченный ответ');
  act(() => second.result.current[1]((messages) => ({ ...messages, 'GAP-1': '' })));
  second.unmount();
  const third = renderHook(() => useReviewUiState('discussionMessages', {}, { persist: true }), { wrapper });
  expect(third.result.current[0]).toEqual({ 'GAP-1': '', 'GAP-2': 'Другой ответ' });
  third.unmount(); sessionStorage.removeItem(`${key}:ui:discussionMessages`);
});

test('persisted UI drafts isolate actors and tasks, including a mounted scope change', () => {
  let session = { key: 'reqai.reviewDraft:actor-A:task-A', ui: new Map() };
  const wrapper = ({ children }) => <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
  const hook = renderHook(() => useReviewUiState('discussionMessages', {}, { persist: true }), { wrapper });
  act(() => hook.result.current[1]({ 'GAP-1': 'Private answer' }));
  const staleSetter = hook.result.current[1];
  for (const key of ['reqai.reviewDraft:actor-A:task-B', 'reqai.reviewDraft:actor-B:task-A']) {
    session = { key, ui: new Map() }; hook.rerender();
    expect(hook.result.current[0]).toEqual({});
    act(() => staleSetter(() => ({ 'GAP-1': 'Late completion from another task' })));
    expect(hook.result.current[0]).toEqual({});
  }
  session = { key: 'reqai.reviewDraft:actor-A:task-A', ui: new Map() }; hook.rerender();
  expect(hook.result.current[0]).toEqual({ 'GAP-1': 'Private answer' });
  hook.unmount();
  clearReviewDrafts();
  expect(sessionStorage.getItem(`${session.key}:ui:discussionMessages`)).toBeNull();
});

test('message storage failure reports an error while preserving the in-memory draft', () => {
  const session = { key: 'reqai.reviewDraft:storage-failure:task', ui: new Map() };
  const wrapper = ({ children }) => <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
  const hook = renderHook(() => useReviewUiState('discussionMessages', {}, { persist: true }), { wrapper });
  const write = vi.spyOn(Object.getPrototypeOf(sessionStorage), 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  try {
    act(() => hook.result.current[1]({ 'GAP-1': 'Не потерять этот ответ' }));
    expect(hook.result.current[0]).toEqual({ 'GAP-1': 'Не потерять этот ответ' });
    expect(session.ui.get('discussionMessages')).toEqual(hook.result.current[0]);
    expect(hook.result.current[2]).toBe(true);
    write.mockRestore();
    act(() => hook.result.current[1]((messages) => ({ ...messages, 'GAP-2': 'Сохранено' })));
    expect(hook.result.current[2]).toBe(false);
  } finally {
    write.mockRestore(); hook.unmount();
    sessionStorage.removeItem(`${session.key}:ui:discussionMessages`);
  }
});

test('assessment-only drafts and content updates preserve closed questions and answer checks', () => {
  const content = roomBookingRegistry();
  const decisions = { review: { schemaVersion: 1,
    gaps: { 'GAP-001': { state: 'closed', answer: 'push', reason: 'Проверено', closureKind: 'resolved' } },
    gapRequirements: { 'GAP-001': { 'BR-001': { state: 'no-change', reason: 'Бизнес-цель не меняется' } } },
    completeness: { check: true }, acknowledgment: { confirm: true },
  } };
  const state = { content, decisions, drafts: {}, reservedIds: [] };
  const draft = { group: 'BR', id: 'BR-001', text: content.groups.BR[0].text, initialText: content.groups.BR[0].text, fields: { quality: 'Готово' } };
  const staged = reviewReducer(state, { type: 'field', key: 'BR:BR-001', value: draft });
  expect(staged.decisions.review.gaps['GAP-001']).toEqual(decisions.review.gaps['GAP-001']);
  expect(staged.decisions.review.gapRequirements).toEqual(decisions.review.gapRequirements);
  expect(staged.decisions.review.acknowledgment.stale).toBe(true);
  const next = structuredClone(content);
  next.groups.BR[0].quality = 'Требует уточнения';
  const applied = reviewReducer(staged, { type: 'content', value: next });
  expect(applied.decisions.review.gaps['GAP-001'].state).toBe('closed');
  expect(applied.decisions.review.gapRequirements['GAP-001']['BR-001'].state).toBe('no-change');
  const wording = reviewReducer(state, { type: 'field', key: 'BR:BR-001', value: { ...draft, text: 'Другая цель' } });
  expect(wording.decisions.review.gaps['GAP-001'].state).toBe('answered');
  expect(wording.decisions.review.gapRequirements['GAP-001']['BR-001'].state).toBe('pending');
});

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

test('rebase preserves applied AI wording and answers but retires an unsaved receipt from the old base', () => {
  const base = roomBookingRegistry();
  const content = structuredClone(base);
  content.groups.FR[0].text = 'Принятое уточнение';
  const gap = base.analysis.GAP[0];
  const id = 'proposal-old-001';
  const local = { review: { schemaVersion: 1, gaps: { [gap.id]: { state: 'closed', answer: 'Подтверждено', reason: 'Проверено', closureKind: 'resolved' } }, gapRequirements: { [gap.id]: { 'FR-001': { state: 'incorporated', reason: 'Учтено' } } }, discussionProposals: { [id]: { baseVersionId: 'old-base', decision: 'accepted', changes: [{ targetId: 'FR-001', before: { text: base.groups.FR[0].text }, after: { text: 'Принятое уточнение' } }], clarification: { gapId: gap.id } } } } };
  const next = rebaseReview({ content, decisions: local, drafts: {} }, base, base, {}, {});
  expect(next.transferredProposalCount).toBe(1);
  expect(next.state.content.groups.FR[0].text).toBe('Принятое уточнение');
  expect(next.state.decisions.review.discussionProposals).not.toHaveProperty(id);
  expect(next.state.decisions.review.gaps[gap.id]).toMatchObject({ state: 'answered', answer: 'Подтверждено', closureKind: null });
  expect(next.state.decisions.review.gapRequirements[gap.id]['FR-001']).toMatchObject({ state: 'pending', stale: true });
  expect(local.review.discussionProposals[id].baseVersionId).toBe('old-base');
});

test('editing one requirement invalidates only its GAP confirmation basis', () => {
  const content = roomBookingRegistry();
  const decisions = {
    review: {
      schemaVersion: 1,
      gapRequirements: {
        'GAP-001': { 'BR-001': { state: 'incorporated' }, 'FR-001': { state: 'incorporated' } },
      },
    },
  };
  const state = { content, decisions, drafts: {} };
  const next = reviewReducer(state, {
    type: 'field',
    key: 'BR:BR-001',
    value: { group: 'BR', id: 'BR-001', text: 'Новая цель', initialText: content.groups.BR[0].text },
  });
  expect(next.decisions.review.gapRequirements['GAP-001']['BR-001']).toMatchObject({ state: 'pending', stale: true });
  expect(next.decisions.review.gapRequirements['GAP-001']['FR-001']).toEqual({ state: 'incorporated' });
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

test('draft recovery keeps older answers until explicit scoped cleanup', () => {
  sessionStorage.clear();
  const saved = { schemaVersion: 1, updatedAt: 500, state: { content: roomBookingRegistry(), drafts: {} } };
  sessionStorage.setItem('reqai.reviewDraft:a', JSON.stringify(saved));
  sessionStorage.setItem('unrelated', 'keep');
  expect(readReviewDraft('reqai.reviewDraft:a', sessionStorage, 500 + DRAFT_TTL - 1)).toEqual(saved);
  expect(readReviewDraft('reqai.reviewDraft:a', sessionStorage, 500 + DRAFT_TTL)).toEqual(saved);
  expect(sessionStorage.getItem('reqai.reviewDraft:a')).not.toBeNull();
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

test('cancelling a new composer leaves saved review decisions unchanged', () => {
  const state = { content: roomBookingRegistry(), drafts: {}, decisions: { review: { acknowledgment: { confirmed: true, stale: false } } } };
  const editing = reviewReducer(state, { type: 'field', key: 'FR:new', value: { group: 'FR', id: 'new', isNew: true, initialText: '', text: 'Тестовая функция' } });
  const cancelled = reviewReducer(editing, { type: 'clear', key: 'FR:new' });
  expect(cancelled).toEqual(state);
});


test('switching the research owner from read-only to editable cannot erase a final-editor answer', () => {
  const key = 'reqai.reviewDraft:owner-regression';
  const content = { FR: [] };
  const saved = { schemaVersion: 1, updatedAt: Date.now(), baseVersionId: 'v1', state: { content, drafts: {}, decisions: { review: { gaps: { 'GAP-003': { answer: 'допустимо. не требует.' } } } }, editor: 'requirements' } };
  const wrapper = ({ children }) => <SessionContext.Provider value={{ key, baseVersionId: 'v1' }}>{children}</SessionContext.Provider>;
  const view = renderHook(({ readOnly }) => useReviewState(content, {}, { editor: 'insights', readOnly }), { wrapper, initialProps: { readOnly: true } });
  sessionStorage.setItem(key, JSON.stringify(saved));
  view.rerender({ readOnly: false });
  expect(readReviewDraft(key)).toEqual(saved);
  expect(view.result.current.recovery).toEqual(saved);
  act(() => view.result.current.dispatch({ type: 'decisions', value: { acceptedEnhancementKeys: ['one'] } }));
  expect(readReviewDraft(key)).toEqual(saved);
  view.unmount(); sessionStorage.removeItem(key);
});

test('answers are persisted before unmount and automatically restored on the same version', () => {
  const key = 'reqai.reviewDraft:answer-reload';
  const content = { FR: [] };
  const wrapper = ({ children }) => <SessionContext.Provider value={{ key, baseVersionId: 'v1' }}>{children}</SessionContext.Provider>;
  const first = renderHook(() => useReviewState(content), { wrapper });
  act(() => {
    first.result.current.dispatch({ type: 'decisions', value: { review: { gaps: { 'GAP-003': { answer: 'Мой ответ', state: 'answered' } } } } });
    expect(readReviewDraft(key).state.decisions.review.gaps['GAP-003'].answer).toBe('Мой ответ');
  });
  first.unmount();
  const second = renderHook(() => useReviewState(content), { wrapper });
  expect(second.result.current.state.decisions.review.gaps['GAP-003'].answer).toBe('Мой ответ');
  expect(second.result.current.recovery).toBeNull();
  expect(second.result.current.dirty).toBe(true);
  second.unmount(); sessionStorage.removeItem(key);
});

test('a different base preserves the answer for comparison instead of silently overwriting it', () => {
  const key = 'reqai.reviewDraft:answer-conflict';
  const content = { FR: [] };
  const saved = { schemaVersion: 1, updatedAt: Date.now(), baseVersionId: 'v1', state: { content, drafts: {}, decisions: { review: { gaps: { 'GAP-003': { answer: 'Мой ответ' } } } }, editor: 'requirements' } };
  sessionStorage.setItem(key, JSON.stringify(saved));
  const wrapper = ({ children }) => <SessionContext.Provider value={{ key, baseVersionId: 'v2' }}>{children}</SessionContext.Provider>;
  const view = renderHook(() => useReviewState(content), { wrapper });
  expect(view.result.current.recovery).toEqual(saved);
  expect(readReviewDraft(key)).toEqual(saved);
  view.unmount(); sessionStorage.removeItem(key);
});
