import { ApiError } from '../errors/api-error.js';
import { canonicalSha256 } from '../prompts/prompt-utils.js';
import { normalizeProposalMetadata } from './proposal-metadata.js';
import { safeCitationUrl, normalizeCitations } from '../domain/research-evidence.js';
import { currentGapClarification } from './gap-review-state.js';
import { QUALITY_POLICY, QUALITY_VALUES } from './requirement-quality-context.js';
import { validateQualityEvidence } from './quality-evidence.js';

const fail = (message) => { throw new ApiError({ status: 400, code: 'INVALID_REVIEW_METADATA', message }); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const cleanText = (value, maximum, name) => { if (value == null) return ''; if (typeof value !== 'string' || value.length > maximum) fail(`${name} is invalid`); return value.trim(); };
const copy = (value) => structuredClone(value);
const same = (left, right) => canonicalSha256(left) === canonicalSha256(right);
const DISCUSSION_REQUIREMENT_FIELDS = {
  BR: new Set(['text', 'successIndicator']),
  SR: new Set(['text', 'role']),
  FR: new Set(['text']),
  NFR: new Set(['text', 'category', 'scope', 'verificationMethod']),
  TR: new Set(['text', 'completionCriterion']),
  CON: new Set(['text', 'obligation', 'scope']),
};

function recordsFromContent(content) {
  return Object.values(content?.groups || content || {})
    .filter(Array.isArray)
    .flat()
    .filter((record) => record && typeof record.id === 'string');
}

export function linkedRequirements(content, gap) {
  const records = recordsFromContent(content);
  const ids = new Set(records.map((record) => record.id));
  const contextIds = new Set([...(content?.context || []), ...Object.values(content?.analysis || {}).filter(Array.isArray).flat()]
    .filter((record) => record?.id).map((record) => record.id));
  const linked = new Set((Array.isArray(gap?.affectedIds) ? gap.affectedIds : []).filter((id) => !contextIds.has(id)));
  for (const record of records) {
    const related = [...(record.relatedIds || []), ...(record.relatedTo || [])];
    if (related.includes(gap.id)) linked.add(record.id);
  }
  return {
    ids: [...linked],
    unresolved: [...linked].filter((id) => !ids.has(id)),
    records: new Map(records.map((record) => [record.id, record])),
  };
}

function confirmationBasis({ gap, answer, record }) {
  return {
    questionHash: canonicalSha256({ id: gap.id, text: String(gap.text || '').trim() }),
    answerHash: canonicalSha256(String(answer || '').trim()),
    requirementHash: canonicalSha256(record || { id: null, missing: true }),
  };
}

function checkIsCurrent(check, basis) {
  return Boolean(check)
    && check.stale !== true
    && check.questionHash === basis.questionHash
    && check.answerHash === basis.answerHash
    && check.requirementHash === basis.requirementHash;
}

function normalizeDiscussionProposals({ supplied, inherited = {}, content, stamp, baseVersionId = null, review = {} }) {
  if (!object(supplied) || Object.keys(supplied).length > 500) fail('Invalid discussion proposal receipt map');
  const records = new Map(recordsFromContent(content).map((record) => [record.id, record]));
  const result = copy(inherited || {});
  for (const [proposalId, value] of Object.entries(supplied)) {
    if (!/^[A-Za-z0-9._:-]{8,160}$/.test(proposalId) || !object(value)) fail('Invalid discussion proposal receipt');
    if (value.proposalId !== undefined && value.proposalId !== proposalId) fail('Discussion proposal identity does not match its receipt key');
    const prior = inherited?.[proposalId];
    if (prior && same(prior, value)) { result[proposalId] = copy(prior); continue; }
    if (!['accepted', 'rejected'].includes(value.decision)) fail('Discussion proposal receipt must be accepted or rejected');
    if (value.superseded !== undefined && typeof value.superseded !== 'boolean') fail('Invalid superseded discussion receipt');
    if (!Array.isArray(value.changes) || value.changes.length < (value.decision === 'accepted' && !value.clarification ? 1 : 0) || value.changes.length > 20) fail('Invalid discussion proposal changes');
    const changes = value.changes.map((change) => {
      if (!object(change) || typeof change.targetId !== 'string' || !records.has(change.targetId) || !object(change.before) || !object(change.after)) fail('Discussion proposal target is outside the current requirements');
      const type = String(change.targetId).split('-', 1)[0];
      const allowed = DISCUSSION_REQUIREMENT_FIELDS[type];
      if (!allowed) fail('Discussion proposal target must be a requirement');
      const fields = Object.keys(change.after);
      if (!fields.length || fields.some((field) => !allowed.has(field))) fail('Discussion proposal contains an unsupported field');
      if (fields.some((field) => typeof change.after[field] !== 'string' || change.after[field].length > 20_000)) fail('Discussion proposal field is invalid');
      const before = Object.fromEntries(fields.map((field) => [field, change.before[field] ?? '']));
      if (change.beforeHash !== undefined && change.beforeHash !== canonicalSha256(before)) fail('Discussion proposal base hash is invalid');
      const current = records.get(change.targetId);
      if (value.decision === 'accepted' && !value.superseded && fields.some((field) => String(current[field] ?? '') !== String(change.after[field] ?? ''))) fail('Accepted discussion proposal does not match the saved requirement');
      return { targetId: change.targetId, targetType: type, before, after: Object.fromEntries(fields.map((field) => [field, String(change.after[field]).trim()])), beforeHash: canonicalSha256(before), ...(change.rationale ? { rationale: cleanText(change.rationale, 5000, 'Discussion proposal rationale') } : {}) };
    });
    const baseHash = canonicalSha256(changes.map(({ targetId, beforeHash }) => ({ targetId, beforeHash })));
    if (value.baseHash !== undefined && value.baseHash !== baseHash) fail('Discussion proposal hash does not match its changes');
    let gapBases;
    if (value.gapBases !== undefined) {
      if (!object(value.gapBases) || Object.keys(value.gapBases).length > 500) fail('Invalid discussion proposal GAP bases');
      gapBases = Object.fromEntries(Object.entries(value.gapBases).map(([gapId, basis]) => {
        if (!/^GAP-[A-Za-z0-9_-]{1,96}$/.test(gapId) || !object(basis)) fail('Invalid discussion proposal GAP basis');
        const question = cleanText(basis.question, 20000, 'Discussion proposal GAP question');
        const answer = cleanText(basis.answer, 20000, 'Discussion proposal GAP answer');
        return [gapId, { question, answer }];
      }));
    }
    let clarification;
    if (value.clarification !== undefined) {
      const item = value.clarification;
      if (!object(item) || !content.analysis?.GAP.some((gap) => gap.id === item.gapId) || typeof item.canResolve !== 'boolean') fail('Invalid guided clarification receipt');
      const answer = cleanText(item.answer, 20000, 'Clarification answer');
      if (!answer || !Array.isArray(item.remainingQuestions) || item.remainingQuestions.length > 20) fail('Invalid remaining clarification questions');
      const remainingQuestions = item.remainingQuestions.map((question) => cleanText(question, 2000, 'Remaining question'));
      if (value.decision === 'accepted' && !value.superseded && (review.gaps?.[item.gapId]?.answer?.trim() !== answer || (item.canResolve && (remainingQuestions.length || review.gaps?.[item.gapId]?.state !== 'closed' || review.gaps?.[item.gapId]?.closureKind !== 'resolved')))) fail('Guided clarification receipt does not match the saved decision');
      const linkage = linkedRequirements(content, content.analysis.GAP.find((gap) => gap.id === item.gapId));
      if (!Array.isArray(item.checks) || !item.checks.length || item.checks.length > 100) fail('Invalid guided clarification checks');
      const seen = new Set();
      const checks = item.checks.map((check) => {
        if (!object(check) || !linkage.records.has(check.requirementId) || !linkage.ids.includes(check.requirementId) || seen.has(check.requirementId) || !['incorporated', 'no-change'].includes(check.state)) fail('Invalid guided requirement disposition');
        seen.add(check.requirementId);
        const reason = cleanText(check.reason, 5000, 'Clarification check reason');
        if (!reason || (check.state === 'incorporated') !== changes.some((change) => change.targetId === check.requirementId)) fail('Guided checks must match the changes');
        if (!value.superseded && !same({ state: check.state, reason }, { state: review.gapRequirements?.[item.gapId]?.[check.requirementId]?.state, reason: review.gapRequirements?.[item.gapId]?.[check.requirementId]?.reason })) fail('Guided checks do not match the saved confirmations');
        return { requirementId: check.requirementId, state: check.state, reason };
      });
      if (changes.some((change) => !seen.has(change.targetId))) fail('A guided change needs a requirement disposition');
      clarification = { gapId: item.gapId, answer, canResolve: item.canResolve, remainingQuestions, checks };
    }
    let qualityAssessment;
    if (value.qualityAssessment !== undefined) {
      const assessment = value.qualityAssessment;
      // Historical evidence is immutable. Superseding an old receipt must not
      // require regenerating or upgrading its already saved certificate.
      if (prior?.qualityAssessment && same(prior.qualityAssessment, assessment)) qualityAssessment = copy(assessment);
      else {
      if (!object(assessment) || assessment.schemaVersion !== QUALITY_POLICY || !object(assessment.basis) || !Array.isArray(assessment.assessedRecords) || !Array.isArray(assessment.assessments) || !assessment.assessments.length || assessment.assessments.length > 10000) fail('Invalid AI quality assessment receipt');
      const seen = new Set();
      if (assessment.semanticReview?.pass !== true || assessment.semanticReview?.schemaVersion !== 'babok-quality-review.v1' || assessment.semanticReview?.revision !== assessment.revision || !Array.isArray(assessment.semanticReview?.checks) || assessment.semanticReview.checks.length !== assessment.assessments.length || assessment.semanticReview.checks.some((check) => check.pass !== true || !Array.isArray(check.issues) || check.issues.length) || new Set(assessment.semanticReview.checks.map((check) => check.id)).size !== assessment.assessments.length) fail('AI quality assessment needs an independent review of every record');
      if (assessment.assessments.length !== assessment.assessedRecords.length || new Set(assessment.assessedRecords.map((record) => record.id)).size !== assessment.assessments.length) fail('AI quality evidence must cover the assessed registry');
      for (const item of assessment.assessments) {
        if (!records.has(item?.id) || seen.has(item.id) || !QUALITY_VALUES.includes(item.quality) || !cleanText(item.reason, 2000, 'Quality assessment reason') || !Array.isArray(item.blockingGapIds)) fail('Invalid AI quality assessment');
        seen.add(item.id);
        if (!assessment.semanticReview.checks.some((check) => check.id === item.id)) fail('Missing independent quality review');
        try { validateQualityEvidence(item, { records: assessment.assessedRecords, gaps: content.analysis?.GAP || [] }); } catch (error) { fail(error.message); }
        if (value.decision === 'accepted' && !value.superseded && records.get(item.id).quality !== item.quality) fail('AI quality assessment does not match saved statuses');
      }
      qualityAssessment = copy(assessment);
      }
    }
    const proposalBaseVersionId = value.baseVersionId == null ? undefined : cleanText(value.baseVersionId, 128, 'Discussion proposal base version');
    if (proposalBaseVersionId && baseVersionId && proposalBaseVersionId !== baseVersionId) fail('Discussion proposal base version does not match the saved version');
    result[proposalId] = { proposalId, decision: value.decision, changes, baseHash, ...(proposalBaseVersionId ? { baseVersionId: proposalBaseVersionId } : {}), ...(gapBases ? { gapBases } : {}), ...(value.discarded === true ? { discarded: true } : {}), ...(value.superseded === true ? { superseded: true } : {}), ...(clarification ? { clarification } : {}), ...(qualityAssessment ? { qualityAssessment } : {}), ...stamp };
  }
  return result;
}

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
  const allowedFields = new Set(['schemaVersion', 'gaps', 'gapRequirements', 'omissions', 'completeness', 'acknowledgment', 'proposals', 'citationChecks', 'discussionProposals']);
  if (Object.keys(input).some((key) => !allowedFields.has(key) && (!(key in previous) || !same(input[key], previous[key])))) fail('Unknown review field');
  const stamp = { actorUserId: actorId, recordedAt: now.toISOString() };
  const records = Object.values(content?.groups || content || {}).filter(Array.isArray).flat();
  const recordIds = new Set(records.map((record) => record.id));
  const baseRecords = new Map(recordsFromContent(baseContent).map((record) => [record.id, record]));
  const gapById = new Map(allowedGaps.map((gap) => [gap.id, gap]));
  const next = { ...copy(previous), schemaVersion: 1, gaps: copy(previous.gaps || {}) };
  if (input.proposals !== undefined) next.proposals = normalizeProposalMetadata({ supplied: input.proposals, inherited: previous.proposals, content, baseContent, researchResult, researchJobId, baseVersionId, stamp });
  if (input.discussionProposals !== undefined) next.discussionProposals = normalizeDiscussionProposals({ supplied: input.discussionProposals, inherited: previous.discussionProposals, content, stamp, baseVersionId, review: input });
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
      const closureKind = Object.hasOwn(value, 'closureKind')
        ? (value.closureKind == null ? null : cleanText(value.closureKind, 32, 'Gap closure kind'))
        : (previous.gaps?.[id]?.closureKind || null);
      if (closureKind && !['resolved', 'dismissed'].includes(closureKind)) fail('Invalid gap closure kind');
      if (closureKind === 'dismissed' && value.state !== 'closed') fail('Dismissed gaps must be closed');
      if (closureKind === 'resolved' && value.state !== 'closed') fail('Resolved gaps must be closed');
      if (closureKind === 'resolved' && !answer) fail('Resolved gaps require an answer');
      const semantic = { answer, reason, state: value.state, closureKind, affectedIds: (gapById.get(id).affectedIds || []).filter((target) => recordIds.has(target)) };
      const prior = previous.gaps?.[id];
      next.gaps[id] = prior && same(semantic, { answer: prior.answer, reason: prior.reason, state: prior.state, closureKind: prior.closureKind || null, affectedIds: prior.affectedIds }) ? copy(prior) : { ...semantic, ...(closureKind ? { closureKind } : {}), ...stamp };
    }
  }

  const suppliedGapRequirements = input.gapRequirements;
  const hasGapChecklist = suppliedGapRequirements !== undefined || Object.keys(previous.gapRequirements || {}).length > 0;
  if (suppliedGapRequirements !== undefined && (!object(suppliedGapRequirements) || Object.keys(suppliedGapRequirements).length > 500)) {
    fail('gapRequirements must be an object with at most 500 gaps');
  }
  if (suppliedGapRequirements !== undefined) {
    for (const gapId of Object.keys(suppliedGapRequirements)) if (!gapById.has(gapId)) fail('Gap is outside the authorized review lineage');
  }
  if (hasGapChecklist) {
    next.gapRequirements = copy(previous.gapRequirements || {});
    const gapsToTrack = allowedGaps.filter((gap) => {
      const supplied = suppliedGapRequirements?.[gap.id];
      return suppliedGapRequirements !== undefined && supplied !== undefined
        || Object.hasOwn(next.gapRequirements, gap.id)
        || next.gaps?.[gap.id]?.closureKind === 'resolved';
    });
    for (const gap of gapsToTrack) {
      const linkage = linkedRequirements(content, gap);
      const contextIds = new Set([...(content?.context || []), ...Object.values(content?.analysis || {}).filter(Array.isArray).flat()].filter((record) => record?.id).map((record) => record.id));
      const supplied = suppliedGapRequirements?.[gap.id];
      if (supplied !== undefined && (!object(supplied) || Object.keys(supplied).length > Math.max(100, linkage.ids.length + 20))) fail('Invalid GAP requirement checklist');
      if (supplied !== undefined) {
        for (const requirementId of Object.keys(supplied)) if (!linkage.ids.includes(requirementId) && !contextIds.has(requirementId)) fail('Requirement is not linked to this GAP');
      }
      // Older versions incorrectly stored TERM/CTX as missing requirements.
      // Retire those entries while retaining diagnostics for genuinely missing IDs.
      const priorChecks = object(next.gapRequirements[gap.id]) ? Object.fromEntries(Object.entries(next.gapRequirements[gap.id]).filter(([id]) => !contextIds.has(id))) : {};
      const nextChecks = { ...priorChecks };
      for (const requirementId of linkage.ids) {
        const value = supplied?.[requirementId] ?? priorChecks[requirementId] ?? { state: 'pending' };
        if (!object(value)) fail('Invalid GAP requirement confirmation');
        const state = value.state || 'pending';
        if (!['pending', 'incorporated', 'no-change'].includes(state)) fail('Invalid GAP requirement confirmation state');
        const reason = cleanText(value.reason, 5000, 'GAP requirement confirmation reason');
        if (state === 'no-change' && !reason) fail('A no-change confirmation requires a reason');
        const answer = next.gaps?.[gap.id]?.answer || previous.gaps?.[gap.id]?.answer || '';
        const record = linkage.records.get(requirementId);
        const basis = confirmationBasis({ gap, answer, record });
        const prior = priorChecks[requirementId];
        // Preserve legacy hashes and author/time when only the assessment was
        // updated. The old confirmation must match the trusted saved version,
        // the current question and the current answer; every other field must
        // be identical. No client-supplied hash can bypass a content change.
        const before = baseRecords.get(requirementId);
        const assessmentOnly = record && before && record.quality !== before.quality && same({ ...record, quality: before.quality }, before);
        const current = checkIsCurrent(prior, basis) || assessmentOnly && checkIsCurrent(prior, confirmationBasis({ gap, answer, record: before }));
        const missing = linkage.unresolved.includes(requirementId);
        const freshlyAccepted = Object.values(next.discussionProposals || {}).some((receipt) => !previous.discussionProposals?.[receipt.proposalId] && receipt.decision === 'accepted' && !receipt.superseded && receipt.clarification?.gapId === gap.id && receipt.clarification.checks.some((check) => check.requirementId === requirementId && check.state === state && check.reason === reason));
        if (missing || !freshlyAccepted && !current && prior && (prior.state === 'incorporated' || prior.state === 'no-change') && state !== 'pending') {
          nextChecks[requirementId] = { state: 'pending', reason: '', stale: true, unresolved: missing, ...basis, ...(prior.actorUserId ? { previousActorUserId: prior.actorUserId } : {}), ...stamp };
          continue;
        }
        if (state === 'pending') {
          nextChecks[requirementId] = { state: 'pending', reason: '', ...(value.stale === true ? { stale: true } : {}), ...(missing ? { unresolved: true } : {}), ...basis, ...(prior && current ? { actorUserId: prior.actorUserId, recordedAt: prior.recordedAt } : stamp) };
          continue;
        }
        if (missing) {
          nextChecks[requirementId] = { state: 'pending', reason: '', unresolved: true, stale: true, ...basis, ...stamp };
          continue;
        }
        if (prior && current && prior.state === state && prior.reason === reason) nextChecks[requirementId] = { ...copy(prior), ...basis };
        else nextChecks[requirementId] = { state, reason, ...basis, ...stamp };
      }
      // Keep a checked reference that is no longer linked as an explicit stale item.
      for (const [requirementId, prior] of Object.entries(priorChecks)) {
        if (Object.hasOwn(nextChecks, requirementId) || !object(prior)) continue;
        nextChecks[requirementId] = { ...copy(prior), state: 'pending', stale: true, unresolved: true, reason: '' };
      }
      next.gapRequirements[gap.id] = nextChecks;
    }
  }

  for (const gap of allowedGaps) {
    const state = next.gaps?.[gap.id];
    if (!state) continue;
    const closureKind = state.closureKind || null;
    if (closureKind === 'resolved') {
      const clarification = currentGapClarification(next, gap.id);
      if (clarification?.canResolve === false) throw new ApiError({ status: 409, code: 'REVIEW_GAP_ANSWERS_REQUIRED', message: 'The accepted clarification is partial; provide the remaining answers before resolving this GAP', details: { gapId: gap.id } });
      const linkage = linkedRequirements(content, gap);
      const checks = next.gapRequirements?.[gap.id] || {};
      const complete = linkage.ids.length > 0 && linkage.ids.every((requirementId) => {
        const check = checks[requirementId];
        const basis = confirmationBasis({ gap, answer: state.answer, record: linkage.records.get(requirementId) });
        return !linkage.unresolved.includes(requirementId) && (check?.state === 'incorporated' || check?.state === 'no-change') && checkIsCurrent(check, basis);
      });
      if (!complete) {
        const requested = input.gaps?.[gap.id];
        const explicitlyResolving = requested?.closureKind === 'resolved' && previous.gaps?.[gap.id]?.closureKind !== 'resolved';
        if (explicitlyResolving) throw new ApiError({ status: 409, code: 'REVIEW_GAP_CHECKLIST_REQUIRED', message: 'Every linked requirement must have a current confirmation before resolving this GAP', details: { gapId: gap.id, requirementIds: linkage.ids, unresolved: linkage.unresolved } });
        const priorResolution = previous.gaps?.[gap.id];
        next.gaps[gap.id] = {
          ...state,
          state: state.answer?.trim() ? 'answered' : 'open',
          closureKind: null,
          reason: `Нужна повторная проверка: изменились требования, ответ или связи (${linkage.ids.filter((id) => checks[id]?.state === 'pending').join(', ')}).`,
          resolutionHistory: [...(priorResolution?.resolutionHistory || []), { ...copy(priorResolution || state), reopenedAt: now.toISOString(), reopenedReason: 'Подтверждения требований устарели' }],
          ...stamp,
        };
      }
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
