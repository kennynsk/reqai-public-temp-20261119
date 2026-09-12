export function updateReviewMetadata(decisions, patch) {
  const previous = decisions.review || { schemaVersion: 1 };
  const review = { ...previous, ...patch, schemaVersion: 1 };
  if (patch.gaps || patch.omissions) review.acknowledgment = { ...previous.acknowledgment, confirm: false, stale: true };
  if (patch.gaps && previous.gapRequirements) {
    const checks = { ...(previous.gapRequirements || {}) };
    // Callers often pass the complete gap map. Reset only the entries whose
    // semantic value actually changed so an answer update does not invalidate
    // confirmations for unrelated GAPs.
    for (const [gapId, value] of Object.entries(patch.gaps)) {
      if (JSON.stringify(value) !== JSON.stringify(previous.gaps?.[gapId])) delete checks[gapId];
    }
    review.gapRequirements = checks;
  }
  if (patch.omissions && previous.completeness) review.completeness = { ...previous.completeness, check: false, stale: true };
  return { ...decisions, review };
}

export function invalidateReviewEvidence(decisions) {
  if (!decisions.review) return decisions;
  const previous = decisions.review;
  const options = arguments[1] || {};
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
    if (entry?.state !== 'closed' || (changedRecordIds || changedGapIds) && !shouldReopen) return [gapId, entry];
    const answer = String(entry.answer || '').trim();
    return [gapId, { ...entry, state: answer ? 'answered' : 'open', closureKind: null, stale: true,
      resolutionHistory: [...(entry.resolutionHistory || []), { ...entry, reopenedReason: 'Подтверждения требований устарели', reopenedAt: new Date().toISOString() }],
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

export function openReviewItems(content, metadata = {}) {
  const records = Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
  return [
    ...(content?.analysis?.GAP || []).filter((gap) => metadata.gaps?.[gap.id]?.state !== 'closed').map((gap) => ({ id: gap.id, text: gap.text })),
    ...records.filter((record) => record.quality && record.quality !== 'Готово').map((record) => ({ id: record.id, text: `${record.text} · ${record.quality}` })),
    ...(metadata.omissions || []).filter((item) => !item.requirementIds?.length).map((item) => ({ id: item.id, text: `Отмеченный пропуск: ${item.text}` })),
  ];
}
