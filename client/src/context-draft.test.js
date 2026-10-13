import { expect, test } from 'vitest';
import { readContextDraft, saveContextDraft } from './context-draft.js';
const memory = () => { const data = new Map(); return { getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key) }; };
test('restores scoped text, reports filenames, expires and deletes drafts', () => {
  const storage = memory();
  expect(saveContextDraft('tenant:user', { text: 'Изменить кредит', file: { name: 'Условия.txt', privateBytes: 'not serialized' } }, storage, 100)).toBe(true);
  expect(readContextDraft('tenant:other', storage, 200)).toBeNull();
  expect(readContextDraft('tenant:user', storage, 200)).toEqual({ version: 1, text: 'Изменить кредит', attachments: ['Условия.txt'], savedAt: 100 });
  expect(readContextDraft('tenant:user', storage, 8 * 86400000)).toBeNull();
  saveContextDraft('tenant:user', { text: 'Черновик' }, storage);
  saveContextDraft('tenant:user', { text: '' }, storage);
  expect(readContextDraft('tenant:user', storage)).toBeNull();
});
test('unavailable storage does not break editing or pretend to save', () => {
  const denied = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  expect(readContextDraft('user', denied)).toBeNull();
  expect(saveContextDraft('user', { text: 'Не терять' }, denied)).toBe(false);
  expect(saveContextDraft(null, { text: 'Не смешивать пользователей' }, memory())).toBe(false);
});
