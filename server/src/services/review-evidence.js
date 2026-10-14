// Pure evidence transitions shared by the editor and prospective AI assessment.

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
  // A supporting BR supplies the business purpose. Refining only its success
  // metric does not change downstream operational decisions; GAPs directly
  // linked to that BR still require review through the checks below.
  const supportingChanges = new Set(changedRecordIds.filter((id) => {
    if (!/^BR-/.test(id) || !left.has(id) || !right.has(id)) return true;
    const withoutMetric = (record) => Object.fromEntries(Object.entries(evidenceRecord(record)).filter(([field]) => field !== 'successIndicator'));
    return fingerprint(withoutMetric(left.get(id))) !== fingerprint(withoutMetric(right.get(id)));
  }));
  const gaps = new Map([...(before?.analysis?.GAP || []), ...(after?.analysis?.GAP || [])].map((gap) => [gap.id, gap]));
  const hardGapIds = [];
  const contextGapIds = [];
  for (const id of gaps.keys()) {
    const oldGap = left.get(id), newGap = right.get(id);
    const linked = [...linkedRequirementIds(before, oldGap), ...linkedRequirementIds(after, newGap)];
    const supporting = linked.flatMap((recordId) => [left.get(recordId), right.get(recordId)].filter(Boolean).flatMap((record) => [...(record.relatedIds || []), ...(record.relatedTo || [])]));
    if (changedRecordIds.includes(id)
      || fingerprint([...linkedRequirementIds(before, oldGap)].sort()) !== fingerprint([...linkedRequirementIds(after, newGap)].sort())
      || linked.some((recordId) => changedRecordIds.includes(recordId))
      || [...(oldGap?.affectedIds || []), ...(newGap?.affectedIds || [])].some((recordId) => changedRecordIds.includes(recordId))) hardGapIds.push(id);
    // Context-only changes (a referenced record or any CON shifted) do not
    // touch the question's own basis: keep the collected decisions and ask
    // for a single reconfirmation instead of a full redo.
    else if (supporting.some((recordId) => supportingChanges.has(recordId))
      || changedRecordIds.some((recordId) => /^CON-/.test(recordId))) contextGapIds.push(id);
  }
  return { changedRecordIds, changedGapIds: hardGapIds, contextGapIds };
}

export function invalidateReviewEvidence(decisions, options = {}) {
  if (!decisions.review) return decisions;
  const previous = decisions.review;
  const changedRecordIds = options.changedRecordIds ? new Set(options.changedRecordIds) : null;
  const changedGapIds = options.changedGapIds ? new Set(options.changedGapIds) : null;
  const contextGapIds = options.contextGapIds ? new Set(options.contextGapIds) : null;
  const gapRequirements = Object.fromEntries(Object.entries(previous.gapRequirements || {}).map(([gapId, entries]) => [gapId,
    Object.fromEntries(Object.entries(entries || {}).map(([requirementId, entry]) => [requirementId,
      changedRecordIds?.has(requirementId)
        ? { ...entry, state: 'pending', stale: true }
        : changedGapIds?.has(gapId) || contextGapIds?.has(gapId) ? { ...entry, stale: true } : entry,
    ]))]));
  const gaps = Object.fromEntries(Object.entries(previous.gaps || {}).map(([gapId, entry]) => {
    const linkedChanged = changedRecordIds && Object.keys(previous.gapRequirements?.[gapId] || {}).some((id) => changedRecordIds.has(id));
    const hardReopen = changedGapIds?.has(gapId) || linkedChanged;
    const softReopen = contextGapIds?.has(gapId);
    if ((changedRecordIds || changedGapIds || contextGapIds) && !hardReopen && !softReopen) return [gapId, entry];
    if (!entry?.answer && entry?.state !== 'closed') return [gapId, entry];
    const answer = String(entry.answer || '').trim();
    const changed = [...(options.changedRecordIds || [])];
    const reason = options.reason || (hardReopen
      ? `Нужна повторная проверка: ${changed.length ? `изменились связанные записи ${changed.slice(0, 20).join(', ')}.` : 'изменились требования или связи.'}`
      : `Изменился внешний контекст: ${changed.length ? `изменились записи ${changed.slice(0, 20).join(', ')}.` : 'изменились требования или связи.'} Прежние решения сохранены — подтвердите их или пересмотрите.`);
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


export function acceptGapClarification(decisions, clarification) {
  const { gapId, answer, checks, canResolve, remainingQuestions } = clarification;
  const previous = decisions.review?.gaps?.[gapId] || {};
  const { actorUserId: _actor, recordedAt: _time, ...prior } = previous;
  let next = updateReviewMetadata(decisions, { gaps: { ...(decisions.review?.gaps || {}), [gapId]: {
    ...prior, answer, stale: false, state: canResolve ? 'closed' : 'answered', closureKind: canResolve ? 'resolved' : null,
    reason: canResolve ? 'Ответ и учёт во всех связанных требованиях подтверждены при принятии уточнения.'
      : `Принято частичное уточнение.${remainingQuestions.length ? ` Осталось выяснить: ${remainingQuestions.join(' ')}` : ' Требуется проверить остальные связанные требования.'}`,
  } } });
  next = updateReviewMetadata(next, { gapRequirements: { ...(next.review.gapRequirements || {}), [gapId]: Object.fromEntries(checks.map((check) => [check.requirementId, { state: check.state, reason: check.reason, stale: false }])) } });
  return next;
}

