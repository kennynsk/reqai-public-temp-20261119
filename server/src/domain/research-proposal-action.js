// Older prompt versions omit intent. Contextual targetIds never imply replacement.
export function normalizeResearchProposalAction(proposal, groups, { required = false } = {}) {
  const invalid = (message, field = 'operation') => { throw Object.assign(new Error(message), { type: 'INVALID_REQUIREMENTS_INSIGHTS', field }); };
  if (proposal.operation === undefined) {
    if (required) invalid('Research proposal must declare add or replace');
    if (proposal.targetId != null) invalid('Replacement target requires an explicit operation', 'targetId');
    return {};
  }
  if (!['add', 'replace'].includes(proposal.operation)) invalid('Unknown research proposal operation');
  if (proposal.operation === 'add') {
    if (proposal.targetId != null) invalid('An addition cannot have a replacement target', 'targetId');
    return { operation: 'add', targetId: null };
  }
  if (typeof proposal.targetId !== 'string' || !groups?.[proposal.targetType]?.some((record) => record.id === proposal.targetId)) {
    invalid('Replacement target must be an existing requirement of the same type', 'targetId');
  }
  return { operation: 'replace', targetId: proposal.targetId };
}
