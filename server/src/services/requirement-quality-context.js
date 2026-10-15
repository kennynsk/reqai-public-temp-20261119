import { currentGapClarification } from './gap-review-state.js';

export const QUALITY_POLICY = 'babok-quality-assessment.v2';
export const QUALITY_VALUES = ['Готово', 'Требует уточнения', 'Конфликтует', 'Не тестируемо'];
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
export const sameQualityBasis = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

export function qualityAssessmentContext(content, decisions = {}) {
  const review = decisions.review || {};
  return {
    records: Object.entries(content.groups || {}).flatMap(([type, group]) => group.map((record) => ({ type, ...record }))),
    gaps: (content.analysis?.GAP || []).map((gap) => ({ ...gap, state: review.gaps?.[gap.id]?.state || 'open', answer: review.gaps?.[gap.id]?.answer || '', stale: Boolean(review.gaps?.[gap.id]?.stale), remainingQuestions: currentGapClarification(review, gap.id)?.remainingQuestions || [] })),
    context: content.context || [], traceability: content.analysis?.traceability || [], hypotheses: content.analysis?.HYP || [],
    researchDecisions: Object.entries(review.proposals || {}).map(([key, item]) => ({ key, decision: item.decision, targetId: item.targetId, operation: item.operation, after: item.after, confirmationConditions: item.confirmationConditions })),
  };
}

export function qualityAssessmentIsCurrent(content, decisions, assessment) {
  return !assessment || sameQualityBasis(qualityAssessmentContext(content, decisions), assessment.basis);
}

export function applyQualityAssessment(content, assessment) {
  if (!assessment) return content;
  const byId = new Map(assessment.assessments.map((item) => [item.id, item.quality]));
  return { ...content, groups: Object.fromEntries(Object.entries(content.groups).map(([type, group]) => [type, group.map((record) => byId.has(record.id) ? { ...record, quality: byId.get(record.id) } : record)])) };
}

export function automaticQualityReason(record, decisions = {}, content = null) {
  const currentRecords = content ? new Map(Object.values(content.groups || {}).flat().map((item) => [item.id, item])) : null;
  const currentIds = content ? new Set([...currentRecords.keys(), ...(content.analysis?.GAP || []).map((gap) => gap.id)]) : null;
  const receipts = Object.values(decisions.review?.discussionProposals || {}).reverse().filter((receipt) => receipt.decision === 'accepted' && !receipt.superseded && !receipt.discarded).sort((a, b) => String(b.recordedAt || '9999').localeCompare(String(a.recordedAt || '9999')));
  for (const receipt of receipts) {
    const assessment = receipt.qualityAssessment;
    if (assessment?.schemaVersion !== QUALITY_POLICY || assessment?.semanticReview?.pass !== true) continue;
    const item = assessment?.assessments.find((item) => item.id === record.id && item.quality === record.quality);
    const assessed = assessment?.assessedRecords.map((item) => item.recordRef ? decisions.review?.qualityRecords?.[item.recordRef] : item).find((item) => item?.id === record.id);
    if (!item || !assessed) continue;
    if (currentRecords && (item.evidence.some((citation) => !currentRecords.get(citation.recordId)?.[citation.field]?.includes(citation.quote)) || (item.reason.match(/\b(?:BR|SR|FR|NFR|TR|CON|GAP)-[A-Za-z0-9-]+\b/g) || []).some((id) => !currentIds.has(id)))) continue;
    const basis = { ...assessed }; delete basis.type; delete basis.quality;
    const current = { ...record }; delete current.quality;
    if (sameQualityBasis(basis, current)) return item.reason;
  }
  return null;
}
