// @vitest-environment jsdom
import { expect, test, vi } from 'vitest';
import { readAccessToken, setAccessToken } from './auth-session.js';

test('sign-out clears scoped drafts and notifies the workspace without touching unrelated storage', () => {
  const memoryStorage = () => ({ getItem(key) { return this[key] ?? null; }, setItem(key, value) { this[key] = String(value); }, removeItem(key) { delete this[key]; } });
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  setAccessToken('synthetic-test-token');
  expect(readAccessToken()).toBe('synthetic-test-token');
  sessionStorage.setItem('reqai.reviewDraft:tenant:job', 'draft');
  sessionStorage.setItem('unrelated', 'keep');
  const changed = vi.fn();
  window.addEventListener('reqai:auth-changed', changed);
  try {
    setAccessToken(null);
    expect(sessionStorage.getItem('reqai.reviewDraft:tenant:job')).toBeNull();
    expect(sessionStorage.getItem('unrelated')).toBe('keep');
    expect(changed).toHaveBeenCalledOnce();
  } finally { window.removeEventListener('reqai:auth-changed', changed); vi.unstubAllGlobals(); }
});
