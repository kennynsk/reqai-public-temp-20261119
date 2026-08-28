import { useContext, useEffect, useReducer, useState } from 'react';
import { DraftContext, SessionContext } from './review-context.js';
import { STRUCTURED_FIELDS, validateReviewContent } from './review-fields.js';
import { invalidateReviewEvidence } from './review-metadata.js';

const PREFIX = 'reqai.reviewDraft:';
export const DRAFT_TTL = 24 * 60 * 60 * 1000;
const copy = (value) => JSON.parse(JSON.stringify(value));
const recordIds = (content) => Object.values(content.groups || content).filter(Array.isArray).flat().map((item) => item.id).filter(Boolean);

function mergeDecisionChanges(base, local, remote, changes, path = '') {
  if (JSON.stringify(base) === JSON.stringify(local)) return remote;
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  if (object(local) && (base == null || object(base)) && (remote == null || object(remote))) {
    const result = { ...(remote || {}) };
    for (const key of new Set([...Object.keys(base || {}), ...Object.keys(local)])) {
      const merged = mergeDecisionChanges(base?.[key], local[key], remote?.[key], changes, path ? `${path}.${key}` : key);
      if (merged === undefined) delete result[key]; else result[key] = merged;
    }
    return result;
  }
  if (path === 'review.omissions' && Array.isArray(local)) {
    const keyed = (items = []) => Object.fromEntries(items.map((item) => [item.id, item]));
    return Object.values(mergeDecisionChanges(keyed(base), keyed(local), keyed(remote), changes, `${path}.items`));
  }
  changes.push({ id: path, operation: 'Решение проверки', local: JSON.stringify(local) || 'Удалено', remote: JSON.stringify(remote) || 'Нет' });
  return local === undefined ? undefined : copy(local);
}

export function clearReviewDrafts(storage = sessionStorage) {
  try { for (const key of Object.keys(storage)) if (key.startsWith(PREFIX)) storage.removeItem(key); } catch { /* storage can be disabled */ }
}

export function readReviewDraft(key, storage = sessionStorage, now = Date.now()) {
  if (!key) return null;
  try {
    const saved = JSON.parse(storage.getItem(key) || 'null');
    if (!saved) return null;
    if (saved.schemaVersion !== 1 || !saved.state?.content || !saved.state?.drafts || !Number.isFinite(saved.updatedAt) || saved.updatedAt > now || now - saved.updatedAt >= DRAFT_TTL) {
      storage.removeItem(key); return null;
    }
    return saved;
  } catch { return null; }
}


export function reviewReducer(state, action) {
  switch (action.type) {
    case 'content': {
      const content = typeof action.value === 'function' ? action.value(state.content) : action.value;
      return { ...state, content, decisions: JSON.stringify(content) === JSON.stringify(state.content) ? state.decisions : invalidateReviewEvidence(state.decisions), reservedIds: [...new Set([...(state.reservedIds || []), ...recordIds(state.content), ...recordIds(content)])] };
    }
    case 'field': return { ...state, decisions: action.value.text !== action.value.initialText || Object.keys(action.value.fields || {}).length ? invalidateReviewEvidence(state.decisions) : state.decisions, drafts: { ...state.drafts, [action.key]: action.value } };
    case 'clear': { const drafts = { ...state.drafts }; delete drafts[action.key]; return { ...state, drafts }; }
    case 'decisions': return { ...state, decisions: action.value };
    case 'restore': return action.value;
    default: return state;
  }
}

export function assembleReview(state, createRecord, normalize = (value) => value) {
  const content = copy(state.content);
  const groups = content.groups || content;
  for (const draft of Object.values(state.drafts)) {
    // Merely opening an empty composer does not add a blank requirement.
    if (draft.isNew && draft.text === '') continue;
    if (!draft.text.trim()) return { error: { id: draft.id, type: draft.group, field: 'text', message: 'Введите формулировку требования.' } };
    if (draft.isNew) groups[draft.group].push(createRecord(draft.group, draft.text.trim(), groups[draft.group]));
    else groups[draft.group] = groups[draft.group].map((item) => item.id === draft.id ? { ...item, ...draft.fields, text: draft.text.trim() } : item);
  }
  const error = validateReviewContent(content);
  if (error) return { error };
  return { content: normalize(content), decisions: state.decisions };
}

export function rebaseReview(state, base, remote, baseDecisions = {}, remoteDecisions = {}) {
  const content = copy(remote);
  const baseGroups = base.groups || base;
  const localGroups = state.content.groups || state.content;
  const groups = content.groups || content;
  const changes = [];
  for (const [group, localRecords] of Object.entries(localGroups)) {
    if (!Array.isArray(localRecords) || !Array.isArray(baseGroups[group]) || !Array.isArray(groups[group])) continue;
    const localById = new Map(localRecords.map((record) => [record.id, record]));
    const baseById = new Map(baseGroups[group].map((record) => [record.id, record]));
    for (const original of baseGroups[group]) {
      if (!localById.has(original.id)) {
        changes.push({ id: original.id, operation: 'Удаление', local: '', remote: groups[group].find((record) => record.id === original.id)?.text || '' });
        groups[group] = groups[group].filter((record) => record.id !== original.id);
      }
    }
    for (const local of localRecords) {
      const original = baseById.get(local.id);
      if (JSON.stringify(original) === JSON.stringify(local)) continue;
      const current = groups[group].find((record) => record.id === local.id);
      const fields = Object.fromEntries(Object.entries(local).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(original?.[key])));
      changes.push({ id: local.id, operation: original ? 'Изменение' : current ? 'Конфликт ID: заменить серверную запись' : 'Добавление', local: local.text, remote: current?.text || '' });
      if (current) groups[group] = groups[group].map((record) => record.id === local.id ? { ...record, ...fields } : record);
      else groups[group].push(copy(local));
    }
  }
  const drafts = {};
  for (const [key, draft] of Object.entries(state.drafts)) {
    if (draft.text === draft.initialText && !Object.keys(draft.fields || {}).length) continue;
    const current = groups[draft.group]?.find((record) => record.id === draft.id);
    changes.push({ id: draft.id, operation: !current && !draft.isNew ? 'Восстановление удалённого требования' : 'Черновик', local: draft.text, remote: current?.text || '' });
    if (!current && !draft.isNew) {
      const original = localGroups[draft.group]?.find((record) => record.id === draft.id);
      if (original) groups[draft.group].push(copy(original));
    }
    for (const [field, local] of Object.entries(draft.fields || {})) {
      const label = (STRUCTURED_FIELDS[draft.group] || []).find(([name]) => name === field)?.[1] || ({ quality: 'Качество', relatedTo: 'Связи', relatedIds: 'Связи' })[field] || 'Дополнительное поле';
      if (JSON.stringify(local) !== JSON.stringify(current?.[field])) changes.push({ id: `${draft.id} · ${label}`, operation: 'Поле', local: Array.isArray(local) ? local.join(', ') : String(local ?? 'Не указано'), remote: Array.isArray(current?.[field]) ? current[field].join(', ') : String(current?.[field] ?? 'Не указано') });
    }
    drafts[key] = { ...draft, text: draft.text === draft.initialText && current ? current.text : draft.text, initialText: current?.text || draft.initialText };
  }
  const mergedDecisions = mergeDecisionChanges(baseDecisions, state.decisions, remoteDecisions, changes);
  const decisions = changes.length ? invalidateReviewEvidence(mergedDecisions) : mergedDecisions;
  return { state: { ...state, content, drafts, decisions, reservedIds: [...new Set([...(state.reservedIds || []), ...recordIds(base), ...recordIds(content)])] }, changes };
}

export function useReviewState(initialContent, initialDecisions = {}, { readOnly = false, editor = 'requirements' } = {}) {
  const inheritedSession = useContext(SessionContext);
  const session = readOnly ? null : inheritedSession;
  const [recovery, setRecovery] = useState(() => session?.restoredState ? null : readReviewDraft(session?.key));
  const [storageError, setStorageError] = useState(false);
  const [state, dispatch] = useReducer(reviewReducer, null, () => session?.restoredState || ({ content: copy(initialContent), decisions: copy(initialDecisions), drafts: {}, editor, reservedIds: [...new Set([...recordIds(initialContent), ...(session?.reservedIds || [])])] }));
  const dirtyFields = Object.values(state.drafts).some((draft) => draft.text !== draft.initialText || Object.keys(draft.fields || {}).length > 0);
  const dirty = dirtyFields || JSON.stringify(state.content) !== JSON.stringify(initialContent) || JSON.stringify(state.decisions) !== JSON.stringify(initialDecisions);
  useEffect(() => {
    if (!session?.key || recovery) return;
    try {
      if (dirty) sessionStorage.setItem(session.key, JSON.stringify({ schemaVersion: 1, updatedAt: Date.now(), baseVersionId: session.baseVersionId, baseContent: initialContent, baseDecisions: initialDecisions, state }));
      else sessionStorage.removeItem(session.key);
    } catch {
      // Synchronization can fail under browser storage policy/quota; surface that failure.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStorageError(true);
    }
  }, [state, dirty, session?.key, session?.baseVersionId, recovery, initialContent, initialDecisions]);
  const discard = () => {
    try { if (session?.key) sessionStorage.removeItem(session.key); } catch { /* keep in-memory recovery usable */ }
    setRecovery(null);
    dispatch({ type: 'restore', value: { content: copy(initialContent), decisions: copy(initialDecisions), drafts: {}, editor, reservedIds: state.reservedIds } });
  };
  const setContent = (value) => dispatch({ type: 'content', value });
  const field = (key, value) => dispatch({ type: 'field', key, value });
  const clear = (key) => dispatch({ type: 'clear', key });
  return { state, dispatch, content: state.content, setContent, dirtyFields, field, clear, dirty, session, recovery, storageError, discard,
    restore: () => { if (recovery.state.editor && recovery.state.editor !== editor) session?.restoreRecovery(recovery); else { dispatch({ type: 'restore', value: recovery.state }); setRecovery(null); } },
  };
}


export function useDraftField({ group, id, text = '', isNew = false }) {
  const review = useContext(DraftContext);
  const key = `${group || ''}:${id}`;
  const draft = review?.state.drafts[key];
  return {
    controlled: Boolean(review), draft,
    start: () => review?.field(key, { group, id, text, initialText: text, isNew }),
    change: (value) => review?.field(key, { ...(draft || { group, id, initialText: text, isNew }), text: value }),
    changeField: (name, value) => review?.field(key, { ...(draft || { group, id, text, initialText: text, isNew }), fields: { ...draft?.fields, [name]: value } }),
    relatedOptions: [...Object.values(review?.content.groups || {}).flat(), ...(review?.content.context || []), ...['GAP', 'HYP', 'TERM'].flatMap((key) => review?.content.analysis?.[key] || [])].filter((item) => item.id !== id).map((item) => item.id),
    clear: () => review?.clear(key),
  };
}
