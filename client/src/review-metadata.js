export function updateReviewMetadata(decisions, patch) {
  const previous = decisions.review || { schemaVersion: 1 };
  const review = { ...previous, ...patch, schemaVersion: 1 };
  if (patch.gaps || patch.omissions) review.acknowledgment = { ...previous.acknowledgment, confirm: false, stale: true };
  if (patch.omissions && previous.completeness) review.completeness = { ...previous.completeness, check: false, stale: true };
  return { ...decisions, review };
}

export function invalidateReviewEvidence(decisions) {
  if (!decisions.review) return decisions;
  const previous = decisions.review;
  return { ...decisions, review: { ...previous,
    ...(previous.completeness ? { completeness: { ...previous.completeness, check: false, stale: true } } : {}),
    ...(previous.acknowledgment ? { acknowledgment: { ...previous.acknowledgment, confirm: false, stale: true } } : {}),
  } };
}

export function openReviewItems(content, metadata = {}) {
  const records = Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
  return [
    ...(content?.analysis?.GAP || []).filter((gap) => metadata.gaps?.[gap.id]?.state !== 'closed').map((gap) => ({ id: gap.id, text: gap.text })),
    ...records.filter((record) => record.quality && record.quality !== 'Готово').map((record) => ({ id: record.id, text: `${record.text} · ${record.quality}` })),
    ...(metadata.omissions || []).filter((item) => !item.requirementIds?.length).map((item) => ({ id: item.id, text: `Отмеченный пропуск: ${item.text}` })),
  ];
}
