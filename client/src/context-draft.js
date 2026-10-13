const TTL = 7 * 24 * 60 * 60 * 1000;
const keyFor = (scope) => `reqai.contextDraft:${scope}`;

export function readContextDraft(scope, storage, now = Date.now()) {
  if (!scope) return null;
  try {
    storage ||= globalThis.localStorage;
    const value = JSON.parse(storage.getItem(keyFor(scope)) || 'null');
    if (!value) return null;
    if (value.version !== 1 || typeof value.text !== 'string' || !Number.isFinite(value.savedAt) || now - value.savedAt > TTL) {
      storage.removeItem(keyFor(scope)); return null;
    }
    return value;
  } catch { return null; }
}
export function saveContextDraft(scope, draft, storage, now = Date.now()) {
  if (!scope) return false;
  try {
    storage ||= globalThis.localStorage;
    const attachments = [draft.file, draft.baseline, ...(draft.references || [])].filter(Boolean).map((file) => file.name);
    if (!draft.text.trim() && !attachments.length) storage.removeItem(keyFor(scope));
    else storage.setItem(keyFor(scope), JSON.stringify({ version: 1, text: draft.text, attachments, savedAt: now }));
    return true;
  } catch { return false; }
}
