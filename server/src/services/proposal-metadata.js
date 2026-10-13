import { ApiError } from '../errors/api-error.js';
import { canonicalSha256 } from '../prompts/prompt-utils.js';

const fail = (message) => { throw new ApiError({ status: 400, code: 'INVALID_REVIEW_METADATA', message }); };
const semantic = (value) => Object.fromEntries(['operation', 'targetType', 'targetId', 'originalText', 'rationale', 'confirmationConditions', 'before', 'after', 'decision', 'reversal'].filter((key) => value[key] !== undefined).map((key) => [key, value[key]]));
export function normalizeProposalMetadata({ supplied, inherited = {}, content, baseContent, researchResult, researchJobId, baseVersionId, stamp }) {
  if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied) || Object.keys(supplied).length > 500) fail('Invalid proposal review map');
  const groups = content.groups || content;
  const baseGroups = baseContent?.groups || baseContent || {};
  const records = Object.values(groups).filter(Array.isArray).flat();
  const baseRecords = Object.values(baseGroups).filter(Array.isArray).flat();
  const proposals = new Map();
  for (const insight of researchResult?.insights || []) {
    const enhancements = insight.enhancements?.length ? insight.enhancements : [{ text: [insight.title, insight.summary].filter(Boolean).join('\n\n') }];
    enhancements.forEach((enhancement, index) => proposals.set(`${insight.id}:${index}`, { ...enhancement, rationale: enhancement.rationale || insight.rationale || '' }));
  }
  const result = structuredClone(inherited);
  for (const [key, value] of Object.entries(supplied)) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || key.length > 200) fail('Invalid proposal decision');
    const prior = inherited[key];
    // Unchanged historical decisions may accompany later manual edits.
    if (prior && canonicalSha256(semantic(prior)) === canonicalSha256(semantic(value))) { result[key] = structuredClone(prior); continue; }
    const original = proposals.get(key);
    if (!original) fail('Proposal is outside the authorized research lineage');
    if (!['accepted', 'rejected'].includes(value.decision) || !['add', 'replace'].includes(value.operation) || !Object.hasOwn(groups, value.targetType)) fail('Invalid proposal operation or target type');
    if (value.originalText !== original.text?.trim()) fail('Original proposal wording must match the research result');
    if (typeof value.targetId !== 'string' || value.targetId.length > 100 || value.after?.id !== value.targetId || !value.after?.text?.trim()) fail('Invalid proposal record');
    if (value.reversal !== undefined && !['retain-manual', 'restore-before'].includes(value.reversal)) fail('Invalid proposal reversal');
    const baseTarget = baseRecords.find((record) => record.id === value.targetId);
    if (value.operation === 'replace') {
      const expectedBefore = prior?.before || baseTarget;
      if (!expectedBefore || !value.before || canonicalSha256(value.before) !== canonicalSha256(expectedBefore)) fail('Replacement target changed; review the current target again');
    } else if (value.before !== null || baseTarget && !prior && baseTarget.researchEnhancementKey !== key) fail('Adding a proposal must not overwrite an existing target');
    const actual = groups[value.targetType].find((record) => record.id === value.targetId);
    if (value.decision === 'accepted') {
      if (!actual || canonicalSha256(actual) !== canonicalSha256(value.after) || actual.researchEnhancementKey !== key || records.filter((record) => record.researchEnhancementKey === key).length !== 1) fail('Accepted proposal must match exactly one saved record');
    } else if (records.some((record) => record.researchEnhancementKey === key)) fail('Rejected proposal must not retain an active proposal record');
    result[key] = { ...structuredClone(semantic(value)), originalText: original.text.trim(), rationale: original.rationale || '', confirmationConditions: original.confirmationConditions || '', researchJobId, baseVersionId: prior?.baseVersionId || baseVersionId || null, ...stamp };
  }
  return result;
}
