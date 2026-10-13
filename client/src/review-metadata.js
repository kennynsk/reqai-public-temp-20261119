import { currentGapClarification } from '../../server/src/services/gap-review-state.js';
import { linkedRequirementIds } from '../../server/src/services/review-evidence.js';
export { updateReviewMetadata, linkedRequirementIds, reviewEvidenceChanges, invalidateReviewEvidence } from '../../server/src/services/review-evidence.js';

function allRecords(content) { return Object.values(content?.groups || content || {}).filter(Array.isArray).flat(); }

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
  if ((!gapChecklistComplete(content, gap, metadata) || partialHint) && (state.stale || Object.values(checks).some((check) => check.stale))) {
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
