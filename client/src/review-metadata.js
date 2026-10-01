import { currentGapClarification } from '../../server/src/services/gap-review-state.js';

export function updateReviewMetadata(decisions, patch) {
  const previous = decisions.review || { schemaVersion: 1 };
  const review = { ...previous, ...patch, schemaVersion: 1 };
  if (patch.gaps || patch.omissions) review.acknowledgment = { ...previous.acknowledgment, confirm: false, stale: true };
  if (patch.gaps && previous.gapRequirements) {
    const checks = { ...(previous.gapRequirements || {}) };
    // Callers often pass the complete gap map. Reset only the confirmations
    // whose basis actually changed — the answer text (the server also hashes
    // the answer into every confirmation). State/closure/reason edits such as
    // "Закрыть как решённый" keep the collected checklist intact.
    for (const [gapId, value] of Object.entries(patch.gaps)) {
      if (String(value?.answer ?? '') !== String(previous.gaps?.[gapId]?.answer ?? '')) delete checks[gapId];
    }
    review.gapRequirements = checks;
  }
  if (patch.omissions && previous.completeness) review.completeness = { ...previous.completeness, check: false, stale: true };
  return { ...decisions, review };
}

const stableValue = (value) => Array.isArray(value) ? value.map(stableValue) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])])) : value;
const fingerprint = (value) => JSON.stringify(stableValue(value));
// An assessment is a conclusion about the requirement, not a change to its
// meaning. Updating it must not erase confirmations of the same answer/text.
const requirementBasisFields = ['id', 'text', 'successIndicator', 'role', 'category', 'scope', 'verificationMethod', 'completionCriterion', 'obligation', 'relatedIds', 'relatedTo', 'source', 'provenance'];
const evidenceRecord = (record) => record && /^(BR|SR|FR|NFR|TR|CON)-/.test(record.id)
  ? Object.fromEntries(requirementBasisFields.map((field) => [field, record[field] ?? null])) : record;

export function reviewEvidenceChanges(before, after) {
  const records = (content) => [...allRecords(content), ...(content?.context || []),
    ...['GAP', 'HYP', 'TERM'].flatMap((type) => content?.analysis?.[type] || [])];
  const left = new Map(records(before).map((record) => [record.id, record]));
  const right = new Map(records(after).map((record) => [record.id, record]));
  const changedRecordIds = [...new Set([...left.keys(), ...right.keys()])].filter((id) => fingerprint(evidenceRecord(left.get(id))) !== fingerprint(evidenceRecord(right.get(id))));
  const gaps = new Map([...(before?.analysis?.GAP || []), ...(after?.analysis?.GAP || [])].map((gap) => [gap.id, gap]));
  const changedGapIds = [...gaps.keys()].filter((id) => {
    const oldGap = left.get(id), newGap = right.get(id);
    const linked = [...linkedRequirementIds(before, oldGap), ...linkedRequirementIds(after, newGap)];
    const supporting = linked.flatMap((recordId) => [left.get(recordId), right.get(recordId)].filter(Boolean).flatMap((record) => [...(record.relatedIds || []), ...(record.relatedTo || [])]));
    return changedRecordIds.includes(id)
      || fingerprint([...linkedRequirementIds(before, oldGap)].sort()) !== fingerprint([...linkedRequirementIds(after, newGap)].sort())
      || supporting.some((recordId) => changedRecordIds.includes(recordId))
      || changedRecordIds.some((recordId) => /^CON-/.test(recordId))
      || linked.some((recordId) => changedRecordIds.includes(recordId))
      || [...(oldGap?.affectedIds || []), ...(newGap?.affectedIds || [])].some((recordId) => changedRecordIds.includes(recordId));
  });
  return { changedRecordIds, changedGapIds };
}

export function invalidateReviewEvidence(decisions, options = {}) {
  if (!decisions.review) return decisions;
  const previous = decisions.review;
  const changedRecordIds = options.changedRecordIds ? new Set(options.changedRecordIds) : null;
  const changedGapIds = options.changedGapIds ? new Set(options.changedGapIds) : null;
  const gapRequirements = Object.fromEntries(Object.entries(previous.gapRequirements || {}).map(([gapId, entries]) => [gapId,
    Object.fromEntries(Object.entries(entries || {}).map(([requirementId, entry]) => [requirementId,
      changedRecordIds && !changedRecordIds.has(requirementId) && !changedGapIds?.has(gapId)
        ? entry
        : { ...entry, state: 'pending', stale: true },
    ]))]));
  const gaps = Object.fromEntries(Object.entries(previous.gaps || {}).map(([gapId, entry]) => {
    const linkedChanged = changedRecordIds && Object.keys(previous.gapRequirements?.[gapId] || {}).some((id) => changedRecordIds.has(id));
    const shouldReopen = changedGapIds?.has(gapId) || linkedChanged;
    if ((changedRecordIds || changedGapIds) && !shouldReopen) return [gapId, entry];
    if (!entry?.answer && entry?.state !== 'closed') return [gapId, entry];
    const answer = String(entry.answer || '').trim();
    const changed = [...(options.changedRecordIds || [])];
    const reason = options.reason || `Нужна повторная проверка: ${changed.length ? `изменились связанные записи ${changed.slice(0, 20).join(', ')}.` : 'изменились требования или связи.'}`;
    return [gapId, { ...entry, state: answer ? 'answered' : 'open', closureKind: null, stale: true,
      reason,
      resolutionHistory: entry.state === 'closed' ? [...(entry.resolutionHistory || []), { ...entry, reopenedReason: reason, reopenedAt: new Date().toISOString() }] : entry.resolutionHistory,
    }];
  }));
  return { ...decisions, review: { ...previous,
    ...(Object.keys(gapRequirements).length ? { gapRequirements } : {}),
    ...(Object.keys(gaps).length ? { gaps } : {}),
    ...(previous.completeness ? { completeness: { ...previous.completeness, check: false, stale: true } } : {}),
    ...(previous.acknowledgment ? { acknowledgment: { ...previous.acknowledgment, confirm: false, stale: true } } : {}),
  } };
}

function allRecords(content) {
  return Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
}

export function linkedRequirementIds(content, gap) {
  if (!gap) return [];
  const records = allRecords(content);
  const contextIds = new Set([...(content?.context || []), ...Object.values(content?.analysis || {}).filter(Array.isArray).flat()]
    .filter((record) => record?.id).map((record) => record.id));
  const linked = new Set((gap.affectedIds || []).filter((id) => !contextIds.has(id)));
  for (const record of records) {
    const related = [...(record.relatedIds || []), ...(record.relatedTo || [])];
    if (related.includes(gap.id)) linked.add(record.id);
  }
  return [...linked];
}

export function gapChecklist(content, gap, metadata = {}) {
  const checks = metadata.gapRequirements?.[gap?.id] || {};
  const ids = new Set(allRecords(content).map((record) => record.id));
  return linkedRequirementIds(content, gap).map((requirementId) => ({
    requirementId,
    unresolved: !ids.has(requirementId),
    ...(checks[requirementId]?.stale ? { state: 'pending', reason: checks[requirementId].reason || '' } : checks[requirementId] || { state: 'pending', reason: '' }),
  }));
}

export function gapChecklistComplete(content, gap, metadata = {}) {
  const checklist = gapChecklist(content, gap, metadata);
  return checklist.length > 0 && checklist.every((item) => !item.unresolved && (item.state === 'incorporated' || item.state === 'no-change'));
}

export function gapHasPendingClarification(metadata, gapId) {
  return currentGapClarification(metadata, gapId)?.canResolve === false;
}

export function requirementGaps(content, requirement) {
  const related = [...(requirement.relatedIds || []), ...(requirement.relatedTo || [])];
  return (content?.analysis?.GAP || []).filter((gap) => (gap.affectedIds || []).includes(requirement.id) || related.includes(gap.id));
}

export function gapReviewHint(content, gap, metadata = {}) {
  const state = metadata.gaps?.[gap.id] || {};
  if (state.state === 'closed') return 'Вопрос закрыт';
  const checks = metadata.gapRequirements?.[gap.id] || {};
  const clarification = currentGapClarification(metadata, gap.id);
  const partialHint = clarification?.canResolve === false ? clarification.remainingQuestions?.length ? `Осталось выяснить: ${clarification.remainingQuestions.join(' ')}` : 'Уточнение частичное: нужно дополнить ответ и проверить оставшийся контекст.' : '';
  if (state.stale || Object.values(checks).some((check) => check.stale)) {
    const recheckHint = state.reason?.startsWith('Нужна повторная') || state.reason?.startsWith('После переноса') ? state.reason : 'Нужна повторная проверка: изменились требования, ответ или связи.';
    return [recheckHint, partialHint].filter(Boolean).join(' ');
  }
  if (!state.answer?.trim()) return 'Нужно добавить ответ на вопрос';
  if (partialHint) return partialHint;
  if (!gapChecklistComplete(content, gap, metadata)) return 'Нужно проверить все связанные требования';
  return 'Ответ и требования проверены — можно закрыть вопрос';
}

export function openReviewItems(content, metadata = {}) {
  const records = Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
  return [
    ...(content?.analysis?.GAP || []).filter((gap) => metadata.gaps?.[gap.id]?.state !== 'closed').map((gap) => ({ id: gap.id, text: gap.text })),
    ...records.filter((record) => record.quality && record.quality !== 'Готово').map((record) => ({ id: record.id, text: `${record.text} · ${record.quality}` })),
    ...(metadata.omissions || []).filter((item) => !item.requirementIds?.length).map((item) => ({ id: item.id, text: `Отмеченный пропуск: ${item.text}` })),
  ];
}
