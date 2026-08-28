import { clearReviewDrafts } from '../review-state.js';

let previousToken;

// Authentication hosts should use this setter for same-tab sign-in/sign-out.
// Changes made by another tab or an older host are reconciled on the next read.
export function readAccessToken() {
  const current = localStorage.getItem('reqai.accessToken') || '';
  if (previousToken !== undefined && previousToken !== current) {
    clearReviewDrafts();
    try { sessionStorage.removeItem('reqai.reviewActor'); } catch { /* optional storage */ }
    window.dispatchEvent(new Event('reqai:auth-changed'));
  }
  previousToken = current;
  return current;
}

export function setAccessToken(value) {
  if (previousToken === undefined) previousToken = localStorage.getItem('reqai.accessToken') || '';
  if (value) localStorage.setItem('reqai.accessToken', value);
  else localStorage.removeItem('reqai.accessToken');
  readAccessToken();
}
