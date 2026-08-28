import { ApiError } from '../errors/api-error.js';
import { canonicalSha256 } from '../prompts/prompt-utils.js';
import { normalizeProposalMetadata } from './proposal-metadata.js';
import { safeCitationUrl, normalizeCitations } from '../domain/research-evidence.js';

const fail = (message) => { throw new ApiError({ status: 400, code: 'INVALID_REVIEW_METADATA', message }); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value, maximum, name) => { if (value == null) return ''; if (typeof value !== 'string' || value.length > maximum) fail(`${name} is invalid`); return value.trim(); };
const copy = (value) => structuredClone(value);
const same = (left, right) => canonicalSha256(left) === canonicalSha256(right);

export function reviewIssues(content, gaps = {}) {
  const records = Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
  return [
    ...(content?.analysis?.GAP || []).filter((gap) => gaps[gap.id]?.state !== 'closed').map((gap) => ({ id: gap.id, kind: 'gap', text: gap.text })),
    ...records.filter((record) => record.quality && record.quality !== 'Готово').map((record) => ({ id: record.id, kind: 'quality', text: record.text, quality: record.quality })),
  ];
}

export function normalizeReviewMetadata({ supplied, inherited, content, allowedGaps = [], contextId, actorId, now, baseVersionId, finalizing = false, baseContent, researchResult, researchJobId }) {
  if (supplied === undefined && !inherited) return undefined;
  if (supplied !== undefined && (!object(supplied) || supplied.schemaVersion !== 1 || Buffer.byteLength(JSON.stringify(supplied), 'utf8') > 262144)) fail('review must use schemaVersion 1 and fit in 256 KiB');
  const previous = object(inherited) ? inherited : {};
  const input = supplied || {};
  const allowedFields = new Set(['schemaVersion', 'gaps', 'omissions', 'completeness', 'acknowledgment', 'proposals', 'citationChecks']);
  if (Object.keys(input).some((key) => !allowedFields.has(key) && (!(key in previous) || !same(input[key], previous[key])))) fail('Unknown review field');
  const stamp = { actorUserId: actorId, recordedAt: now.toISOString() };
  const records = Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
  const recordIds = new Set(records.map((record) => record.id));
  const gapById = new Map(allowedGaps.map((gap) => [gap.id, gap]));
  const next = { ...copy(previous), schemaVersion: 1, gaps: copy(previous.gaps || {}) };
  if (input.proposals !== undefined) next.proposals = normalizeProposalMetadata({ supplied: input.proposals, inherited: previous.proposals, content, baseContent, researchResult, researchJobId, baseVersionId, stamp });
  if (input.citationChecks !== undefined) {
    if (!object(input.citationChecks) || Object.keys(input.citationChecks).length > 600) fail('Invalid citation checks');
    const sources = new Map((researchResult?.insights || []).flatMap((insight) => normalizeCitations(insight.citations).map((citation, index) => [`${insight.id}:${index}`, citation])));
    next.citationChecks = copy(previous.citationChecks || {});
    for (const [key, value] of Object.entries(input.citationChecks)) {
      if (!object(value) || typeof value.checked !== 'boolean') fail('Invalid citation check');
      const note = cleanText(value.note, 5000, 'Source check note');
      const prior = previous.citationChecks?.[key];
      if (prior && prior.checked === value.checked && prior.note === note) { next.citationChecks[key] = copy(prior); continue; }
      const source = sources.get(key);
      if (!source || value.checked && !safeCitationUrl(source.url)) fail('Source is outside the authorized lineage or has an unsafe URL');
      next.citationChecks[key] = { checked: value.checked, note, source, researchJobId, ...stamp };
    }
  }
  if (input.gaps !== undefined) {
    if (!object(input.gaps) || Object.keys(input.gaps).length > 500) fail('gaps must be an object with at most 500 entries');
    for (const [id, value] of Object.entries(input.gaps)) {
      if (!gapById.has(id) || !object(value)) fail('Gap is outside the authorized review lineage');
      if (!['open', 'answered', 'closed'].includes(value.state)) fail('Invalid gap state');
      const answer = cleanText(value.answer, 20000, 'Gap answer');
      const reason = cleanText(value.reason, 5000, 'Gap reason');
      if (value.state === 'closed' && !reason) fail('Closing a gap requires a reason');
      if (previous.gaps?.[id]?.state === 'closed' && value.state !== 'closed' && !reason) fail('Reopening a gap requires a reason');
      if (value.state === 'answered' && !answer) fail('Answered gap requires an answer');
      const semantic = { answer, reason, state: value.state, affectedIds: (gapById.get(id).affectedIds || []).filter((target) => recordIds.has(target)) };
      const prior = previous.gaps?.[id];
      next.gaps[id] = prior && same(semantic, { answer: prior.answer, reason: prior.reason, state: prior.state, affectedIds: prior.affectedIds }) ? copy(prior) : { ...semantic, ...stamp };
    }
  }
  if (input.omissions !== undefined) {
    if (!Array.isArray(input.omissions) || input.omissions.length > 200) fail('At most 200 omissions are allowed');
    const ids = new Set();
    next.omissions = input.omissions.map((value) => {
      if (!object(value) || !/^OMISSION-[a-zA-Z0-9_-]{1,80}$/.test(value.id || '') || ids.has(value.id)) fail('Invalid omission identity');
      ids.add(value.id);
      const text = cleanText(value.text, 5000, 'Omission');
      const prior = previous.omissions?.find((entry) => entry.id === value.id);
      if (!text || !Array.isArray(value.requirementIds) || value.requirementIds.length > 100 || value.requirementIds.some((id) => !recordIds.has(id) && !prior?.requirementIds?.includes(id))) fail('Invalid omission or requirement reference');
      const semantic = { id: value.id, text, requirementIds: [...new Set(value.requirementIds)].filter((id) => recordIds.has(id)) };
      return prior && same(semantic, { id: prior.id, text: prior.text, requirementIds: prior.requirementIds }) ? copy(prior) : { ...semantic, ...stamp };
    });
  }
  next.omissions = (next.omissions || []).map((entry) => {
    const requirementIds = entry.requirementIds.filter((id) => recordIds.has(id));
    return requirementIds.length === entry.requirementIds.length ? entry : { ...entry, requirementIds, ...stamp };
  });
  const contentHash = canonicalSha256({ contextId: contextId || null, content });
  const semanticGaps = Object.fromEntries(Object.entries(next.gaps).map(([id, value]) => [id, { answer: value.answer, reason: value.reason, state: value.state }]));
  const issues = [...reviewIssues(content, next.gaps), ...(next.omissions || []).filter((item) => !item.requirementIds.length).map((item) => ({ id: item.id, kind: 'omission', text: item.text }))];
  const issuesHash = canonicalSha256({ contentHash, issues, gaps: semanticGaps, omissions: (next.omissions || []).map(({ id, text, requirementIds }) => ({ id, text, requirementIds })) });
  if (input.completeness !== undefined && !object(input.completeness)) fail('Invalid completeness check');
  if (input.acknowledgment !== undefined && !object(input.acknowledgment)) fail('Invalid acknowledgment');
  if (input.completeness?.check === true) {
    next.completeness = { checked: true, contentHash, note: cleanText(input.completeness.note, 5000, 'Completeness note'), stale: false, ...stamp };
  } else if (previous.completeness) next.completeness = { ...copy(previous.completeness), stale: previous.completeness.stale === true || previous.completeness.contentHash !== contentHash || input.completeness?.stale === true || !same(previous.omissions || [], next.omissions) };
  if (input.acknowledgment?.confirm === true) {
    next.acknowledgment = { confirmed: true, contentHash, issuesHash, baseVersionId: baseVersionId || null, issueIds: issues.map((issue) => issue.id), stale: false, ...stamp };
  } else if (previous.acknowledgment) next.acknowledgment = { ...copy(previous.acknowledgment), stale: previous.acknowledgment.stale === true || previous.acknowledgment.issuesHash !== issuesHash || input.acknowledgment?.stale === true };
  // Legacy clients remain writable, but cannot turn stale evidence into approval.
  if (supplied && finalizing && issues.length && (!next.acknowledgment?.confirmed || next.acknowledgment.stale)) {
    throw new ApiError({ status: 409, code: 'REVIEW_ACKNOWLEDGMENT_REQUIRED', message: 'Acknowledge the current open review items before finalizing', details: { issueIds: issues.map((issue) => issue.id) } });
  }
  return next;
}
