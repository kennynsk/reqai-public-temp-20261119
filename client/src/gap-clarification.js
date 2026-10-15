import { linkedRequirementIds } from './review-metadata.js';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
const same = (left, right) => JSON.stringify(stable(left)) === JSON.stringify(stable(right));

export function clarificationIsCurrent(content, decisions, proposal) {
  const item = proposal.clarification;
  if (!item) return true;
  const gap = content.analysis?.GAP.find((gap) => gap.id === item.gapId);
  if (!gap || !same(gap, item.gapBefore) || (decisions.review?.gaps?.[gap.id]?.state || 'open') !== item.stateBefore) return false;
  if (!same((content.analysis.questions || []).filter((question) => question.gapId === gap.id), item.questionsBefore)) return false;
  const ids = linkedRequirementIds(content, gap).sort();
  if (!same(ids, [...item.linkedRequirementIds].sort())) return false;
  const contextual = [...Object.values(content.groups || {}).flat(), ...(content.context || []), ...Object.values(content.analysis || {}).filter(Array.isArray).flat()];
  if ((item.contextBases || []).some((basis) => !same(contextual.find((record) => record.id === basis.id), basis))) return false;
  const records = new Map(Object.values(content.groups).flat().map((record) => [record.id, record]));
  for (const [id, basis] of Object.entries(item.recordBases)) {
    const record = records.get(id);
    if (!record || Object.entries(basis).some(([key, value]) => !same(record[key] ?? null, value))) return false;
  }
  // Even a previously missing reference becoming available changes the basis.
  if (ids.some((id) => records.has(id) !== Object.hasOwn(item.recordBases, id)) && !item.omitted.length) return false;
  return true;
}

export { acceptGapClarification } from '../../server/src/services/review-evidence.js';

// A user may accept several packages and edit their result before saving.
// Keep earlier acceptances as history without claiming they match the final draft.
export function reconcileDiscussionReceipts(decisions, content) {
  if (!decisions.review?.discussionProposals) return decisions;
  const records = new Map(Object.values(content.groups || content).filter(Array.isArray).flat().map((record) => [record.id, record]));
  const receipts = Object.fromEntries(Object.entries(decisions.review.discussionProposals).map(([id, receipt]) => {
    if (receipt.recordedAt || receipt.decision !== 'accepted' || receipt.superseded) return [id, receipt];
    const changedAddition = (receipt.additions || []).some(({ record }) => { const current = records.get(record.id); return !current || Object.entries(record).some(([field, value]) => field !== 'quality' && !same(current[field], value)); });
    const changed = receipt.changes.some((change) => Object.entries(change.after).some(([field, value]) => String(records.get(change.targetId)?.[field] ?? '') !== value));
    const item = receipt.clarification;
    const gap = item && decisions.review.gaps?.[item.gapId];
    const changedAnswer = item && (gap?.answer !== item.answer || item.canResolve && (gap?.state !== 'closed' || gap.closureKind !== 'resolved')
      || item.checks.some((check) => { const current = decisions.review.gapRequirements?.[item.gapId]?.[check.requirementId]; return current?.state !== check.state || current?.reason !== check.reason || current?.stale; }));
    return [id, changed || changedAddition || changedAnswer ? { ...receipt, superseded: true } : receipt];
  }));
  return { ...decisions, review: { ...decisions.review, discussionProposals: receipts } };
}
