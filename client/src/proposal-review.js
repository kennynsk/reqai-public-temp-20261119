import { STRUCTURED_FIELDS } from './review-fields.js';
import { updateReviewMetadata, invalidateReviewEvidence, reviewEvidenceChanges } from './review-metadata.js';

export const proposalWarnings = (text) => [
  ...(/[\u3400-\u9fff]/u.test(text || '') ? ['В тексте есть фрагмент на другом языке. Проверьте формулировку.'] : []),
  ...(/(?:предложить|предлагается|рекомендовать|рекомендуется|следует)\s+(?:уточнить|добавить|дополнить|рассмотреть|зафиксировать|распространить)/iu.test(text || '') ? ['Это может быть инструкция аналитику, а не проверяемое требование.'] : []),
];
export function proposalRecord(content, type, id, text, fields, key, original) {
  if (!content.groups) return { ...original, id, text, fromResearch: true, researchEnhancementKey: key };
  const values = Object.fromEntries((STRUCTURED_FIELDS[type] || []).map(([field, , required]) => [field, fields[field]?.trim() || (required ? '' : null)]));
  const unchanged = original && original.text === text && Object.entries(values).every(([field, value]) => (original[field] ?? null) === value);
  return { ...original, id, text, ...values,
    ...(!original ? { quality: 'Требует уточнения', ...(type === 'BR' ? { relatedIds: [] } : { relatedTo: [] }) } : {}),
    source: unchanged ? original.source : { artifactId: `review-decision:${key}`, locator: 'Принятие точной формулировки пользователем', quote: text },
    provenance: unchanged ? original.provenance : 'Нормализовано',
    fromResearch: true, researchEnhancementKey: key,
  };
}
export function nextProposalId(state, type) {
  const groups = state.content.groups || state.content;
  const prefix = ({ business: 'BT', functional: 'FT', nonfunctional: 'NFT' })[type] || type;
  const ids = [...(state.reservedIds || []), ...Object.values(groups).flat().map((record) => record.id), ...(state.content.analysis?.GAP || []).map((record) => record.id)];
  const number = Math.max(0, ...ids.filter((id) => id?.startsWith(`${prefix}-`)).map((id) => Number(id.match(/\d+$/)?.[0] || 0))) + 1;
  return `${prefix}-${state.content.groups ? String(number).padStart(3, '0') : number}`;
}
export function applyProposal(state, enhancement, plan) {
  const content = structuredClone(state.content);
  const groups = content.groups || content;
  const prior = state.decisions.review?.proposals?.[enhancement.key];
  const previousRecord = Object.values(groups).flat().find((record) => record.researchEnhancementKey === enhancement.key);
  const original = plan.operation === 'replace' ? groups[plan.targetType].find((record) => record.id === plan.targetId) : previousRecord;
  if (plan.operation === 'replace' && !original) throw new Error('Выбранное требование больше не существует. Выберите цель заново.');
  if (original?.researchEnhancementKey && original.researchEnhancementKey !== enhancement.key) throw new Error('Это требование уже изменено другим AI-предложением. Сначала отмените то решение или добавьте отдельное требование.');
  if (previousRecord && (plan.targetType !== prior?.targetType && prior || plan.operation === 'replace' && previousRecord.id !== plan.targetId)) throw new Error('Сначала отмените прежнее принятие, чтобы изменить тип или цель.');
  const id = original?.id || nextProposalId(state, plan.targetType);
  const after = proposalRecord(content, plan.targetType, id, plan.text.trim(), plan.fields, enhancement.key, original);
  if (content.groups) {
    const ids = new Set([...Object.values(groups).flat(), ...content.context, ...['GAP', 'HYP', 'TERM'].flatMap((type) => content.analysis[type])].map((record) => record.id));
    const relationField = plan.targetType === 'BR' ? 'relatedIds' : 'relatedTo';
    const conditionIds = (enhancement.confirmationConditions || '').match(/\bGAP-\d+\b/g) || [];
    after[relationField] = [...new Set([...(after[relationField] || []), ...(original ? [] : (enhancement.targetIds || enhancement.relatedTo || []).filter((target) => target.startsWith('GAP-'))), ...conditionIds])].filter((target) => target !== id && ids.has(target));
  }
  groups[plan.targetType] = original ? groups[plan.targetType].map((record) => record.id === id ? after : record) : [...groups[plan.targetType], after];
  if (content.groups) {
    content.materials.references ||= [];
    const artifactId = after.source?.artifactId;
    if (artifactId?.startsWith('review-decision:') && !content.materials.references.some((item) => item.artifactId === artifactId)) content.materials.references.push({ artifactId, role: 'reference', name: `Решение пользователя по AI-предложению ${enhancement.key}`, sha256: null, status: 'AVAILABLE', embeddedReviewDecision: enhancement.key });
    // Acceptance establishes scope, not the unresolved details or parent links.
    const ownGap = content.analysis.GAP.find((gap) => gap.researchEnhancementKey === enhancement.key);
    const linkedGaps = content.analysis.GAP.filter((gap) => [...(after.relatedTo || []), ...(after.relatedIds || [])].includes(gap.id));
    const existingGaps = content.analysis.GAP.filter((gap) => gap.affectedIds.includes(id));
    if (ownGap) { ownGap.text = enhancement.confirmationConditions || ownGap.text; ownGap.source = after.source; }
    const needsGap = !ownGap && !linkedGaps.length && (enhancement.confirmationConditions || !existingGaps.length && (after.quality === 'Требует уточнения' || !original));
    if (enhancement.confirmationConditions) after.quality = 'Требует уточнения';
    if (needsGap) {
      const gapId = nextProposalId({ ...state, content }, 'GAP');
      content.analysis.GAP.push({ id: gapId, kind: 'Подтверждение AI-предложения', text: enhancement.confirmationConditions || `Не проверены полнота, проверяемость и трассировка принятого требования ${id}.`, affectedIds: [id], nextStep: 'Проверить условия применимости и связь с бизнес-целью; зафиксировать решение.', source: after.source, researchEnhancementKey: enhancement.key });
      after.quality = 'Требует уточнения';
    }
    if (!original) for (const target of enhancement.targetIds || enhancement.relatedTo || []) {
      if (!Object.values(groups).flat().some((record) => record.id === target) || target === id) continue;
      const parent = (plan.targetType === 'SR' && target.startsWith('BR-')) || (['FR', 'NFR'].includes(plan.targetType) && target.startsWith('SR-')) || (plan.targetType === 'NFR' && target.startsWith('BR-'));
      content.analysis.traceability.push({ from: parent ? target : id, to: parent ? id : target, relation: parent ? (target.startsWith('BR-') ? 'обосновывает' : 'реализует') : 'зависит от', status: 'Предполагается', source: null, researchEnhancementKey: enhancement.key });
    }
    content.summary.counts[plan.targetType] = groups[plan.targetType].length;
    content.summary.counts.GAP = content.analysis.GAP.length;
  }
  const accepted = [...new Set([...(state.decisions.acceptedEnhancementKeys || []), enhancement.key])];
  const decisions = updateReviewMetadata(invalidateReviewEvidence(state.decisions, reviewEvidenceChanges(state.content, content)), { proposals: { ...state.decisions.review?.proposals, [enhancement.key]: { operation: plan.operation, targetType: plan.targetType, targetId: id, originalText: enhancement.text, rationale: enhancement.rationale || '', confirmationConditions: enhancement.confirmationConditions || '', before: prior?.before ?? (plan.operation === 'replace' ? original : null), after, decision: 'accepted' } } });
  return { ...state, content, reservedIds: [...new Set([...(state.reservedIds || []), id, ...(content.analysis?.GAP || []).map((gap) => gap.id)])], decisions: { ...decisions, skippedResearch: false, acceptedEnhancementKeys: accepted, rejectedEnhancementKeys: (state.decisions.rejectedEnhancementKeys || []).filter((key) => key !== enhancement.key) } };
}
export function reverseProposal(state, key, retain) {
  const content = structuredClone(state.content);
  const groups = content.groups || content;
  const prior = state.decisions.review?.proposals?.[key];
  const removed = new Set();
  for (const type of Object.keys(groups)) {
    groups[type] = groups[type].flatMap((record) => {
      if (record.researchEnhancementKey !== key) return [record];
      if (retain) { const manual = { ...record, fromResearch: false, manuallyEdited: true }; delete manual.researchEnhancementKey; return [manual]; }
      if (prior?.operation === 'replace' && prior.before) return [structuredClone(prior.before)];
      removed.add(record.id); return [];
    });
    if (content.groups) content.summary.counts[type] = groups[type].length;
  }
  if (content.groups) {
    if (!retain) {
      content.analysis.GAP = content.analysis.GAP.filter((gap) => { if (gap.researchEnhancementKey !== key) return true; removed.add(gap.id); return false; });
      content.materials.references = (content.materials.references || []).filter((item) => item.embeddedReviewDecision !== key);
      content.summary.counts.GAP = content.analysis.GAP.length;
    }
    for (const record of [...Object.values(groups).flat(), ...content.context, ...['GAP', 'HYP', 'TERM'].flatMap((type) => content.analysis[type])]) for (const field of ['relatedIds', 'relatedTo', 'affectedIds']) if (record[field]) record[field] = record[field].filter((id) => !removed.has(id));
    content.analysis.traceability = content.analysis.traceability.filter((link) => !removed.has(link.from) && !removed.has(link.to) && (retain || link.researchEnhancementKey !== key));
    content.analysis.delta = content.analysis.delta.filter((item) => !removed.has(item.newId));
    content.summary.counts.DELTA = content.analysis.delta.length;
  }
  const retainedDecisions = structuredClone(state.decisions);
  for (const id of removed) if (id.startsWith('GAP-')) {
    if (retainedDecisions.review?.gaps) delete retainedDecisions.review.gaps[id];
    if (retainedDecisions.review?.gapRequirements) delete retainedDecisions.review.gapRequirements[id];
  }
  const decisions = updateReviewMetadata(invalidateReviewEvidence(retainedDecisions, reviewEvidenceChanges(state.content, content)), { proposals: { ...state.decisions.review?.proposals, ...(prior ? { [key]: { ...prior, decision: 'rejected', reversal: retain ? 'retain-manual' : 'restore-before' } } : {}) } });
  return { ...state, content, decisions: { ...decisions, acceptedEnhancementKeys: (state.decisions.acceptedEnhancementKeys || []).filter((id) => id !== key), rejectedEnhancementKeys: [...new Set([...(state.decisions.rejectedEnhancementKeys || []), key])] } };
}
