import { STRUCTURED_FIELDS } from './review-fields.js';

export function researchProposalAction(enhancement, review) {
  const prior = review?.state.decisions.review?.proposals?.[enhancement.key];
  const groups = review?.content?.groups || review?.content || {};
  const operation = prior?.operation || enhancement.operation;
  const targetType = prior?.targetType || enhancement.targetType;
  const targetId = prior?.targetId || enhancement.targetId;
  const target = operation === 'replace' ? groups[targetType]?.find((record) => record.id === targetId) : null;
  return { operation, targetType, targetId, target, before: prior?.before || target, prior };
}

// Omitted fields inherit the target; explicit null clears an optional field.
export function researchProposalFields(enhancement, target) {
  const fields = { ...target };
  for (const [field] of STRUCTURED_FIELDS[enhancement.targetType] || []) {
    if (Object.hasOwn(enhancement, field)) fields[field] = enhancement[field];
  }
  return fields;
}
