const STAGES = ['preparation', 'generation', 'assembly', 'audit', 'result'];

const STEP_STAGES = {
  validate: 'preparation',
  'plan-chunks': 'preparation',
  'decompose-chunk': 'generation',
  'requirements-insights': 'generation',
  'consolidate-decomposition': 'assembly',
  'merge-decomposition': 'assembly',
  'recover-requirements': 'result',
};

function stageOf(entry) {
  if (entry.name === 'Task completed') return 'result';
  if (!entry.stepId) return null;
  if (/^(?:consolidate-decomposition|requirements-insights)(?::(?:audit[:\-]|semantic-repair:|patch-contract-repair)|$)/u.test(entry.stepId)
    && (entry.stepId.includes(':') || entry.name.startsWith('BABOK '))) return 'audit';
  return STEP_STAGES[entry.stepId.split(':', 1)[0]] || null;
}

function safeCode(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/u.test(value) ? value : null;
}

function safeModel(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_./:-]{0,99}$/u.test(value) ? value : null;
}

function attemptKey(entry) {
  const { executionId, actualModel, attempt } = entry.metadata || {};
  return executionId && Number.isInteger(attempt) && actualModel ? JSON.stringify([executionId, actualModel, attempt]) : null;
}

function modelAttempt(entry, verdict) {
  const status = verdict?.status === 'FAILED' ? 'rejected' : verdict?.status === 'COMPLETED' ? 'accepted'
    : { RUNNING: 'running', COMPLETED: 'received', FAILED: 'failed' }[entry.status];
  return {
    id: entry.id, status, startedAt: entry.startedAt, durationMs: entry.durationMs,
    model: safeModel(entry.metadata?.actualModel),
    reasonCode: issuesFrom(verdict ? [verdict] : []).at(-1)?.code || safeCode(entry.metadata?.reasonCode),
  };
}

function finished(entry) {
  return entry.status === 'COMPLETED' || entry.status === 'SUCCEEDED';
}

function issuesFrom(entries) {
  const issues = new Map();
  for (const entry of entries) {
    const data = entry.metadata || {};
    const findings = data.issues || data.details?.issues || data.summary?.details?.issues;
    if (!Array.isArray(findings)) continue;
    for (const issue of findings) {
      const code = safeCode(issue?.code);
      if (!code) continue;
      const key = typeof issue.key === 'string' && /^(?:\$|(?:BR|SR|FR|NFR|TR|CON|CTX|GAP|HYP|TERM|SOURCE|INS|INSIGHT)-\d+(?::\d+)?)$/u.test(issue.key) ? issue.key : null;
      issues.set(JSON.stringify([key, code]), { key, code });
    }
  }
  return [...issues.values()].slice(-8);
}

function summarize(stage, entries, job) {
  const checkpoints = new Map();
  const attempts = new Map();
  const verdicts = new Map();
  for (const entry of entries) {
    if (entry.source === 'STEP') checkpoints.set(entry.stepId, entry);
    if (stage === 'audit' && ['BABOK audit rejected', 'BABOK audit accepted'].includes(entry.name)) verdicts.set(entry.stepId, entry);
    if (entry.source === 'MODEL_ATTEMPT' || (entry.source === 'TRACE' && entry.name.startsWith('LLM attempt') && ['RUNNING', 'COMPLETED', 'FAILED'].includes(entry.status))) {
      const key = attemptKey(entry) || entry.id;
      const previous = attempts.get(key);
      if (!previous || previous.status === 'RUNNING') attempts.set(key, entry);
    }
  }
  const stepRows = [...checkpoints.values()];
  const calls = [...attempts.values()].filter((entry) => ['RUNNING', 'COMPLETED', 'FAILED'].includes(entry.status));
  const completed = entries.findLast((entry) => stage === 'audit' ? entry.name === 'BABOK audit accepted' && finished(entry) : entry.name === 'Task completed' && finished(entry));
  const retry = calls.some((entry) => entry.status === 'FAILED') || entries.some((entry) => ['BABOK audit response contract repair', 'BABOK semantic correction required'].includes(entry.name));
  const lastFailure = entries.findLast((entry) => entry.status === 'FAILED');
  const terminal = ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(job.status);
  let status = terminal ? 'unknown' : 'running';
  if (completed || (stepRows.length && stepRows.every(finished))) status = retry ? 'completed_after_retry' : 'completed';
  else if (stage === 'audit' && entries.some((entry) => entry.name === 'BABOK audit skipped')) status = 'skipped';
  else if (terminal && lastFailure) status = stepRows.some(finished) ? 'partial' : 'failed';
  const startedAt = entries.find((entry) => entry.startedAt)?.startedAt || null;
  const completedAt = ['completed', 'completed_after_retry', 'failed', 'partial'].includes(status)
    ? entries.map((entry) => entry.completedAt).filter(Boolean).sort().at(-1) || null : null;
  return {
    stage, status, startedAt, completedAt, attemptCount: calls.length,
    attempts: calls.slice(-8).map((call) => modelAttempt(call, call.status === 'COMPLETED' ? verdicts.get(call.stepId) : null)),
    reasonCode: safeCode(lastFailure?.metadata?.reasonCode || lastFailure?.metadata?.summary?.reasonCode),
    issues: issuesFrom(entries),
  };
}

export function summarizeJobTrace(timeline, job) {
  const grouped = new Map(STAGES.map((stage) => [stage, []]));
  const traceCalls = new Set(timeline.filter((entry) => entry.source === 'TRACE' && entry.name.startsWith('LLM attempt')).map(attemptKey).filter(Boolean));
  for (const entry of timeline) {
    if (entry.source === 'MODEL_ATTEMPT' && traceCalls.has(attemptKey(entry))) continue;
    grouped.get(stageOf(entry))?.push(entry);
  }
  const audit = grouped.get('audit');
  const parent = job.type === 'RESEARCH' ? 'generation' : 'assembly';
  const failedParent = grouped.get(parent).findLast((entry) => entry.source === 'STEP' && entry.status === 'FAILED');
  if (failedParent && (audit.length || failedParent.metadata?.summary?.reasonCode === 'BABOK_SEMANTIC_INVALID')) audit.push(failedParent);

  const stages = STAGES.filter((stage) => grouped.get(stage).length).map((stage) => summarize(stage, grouped.get(stage), job));
  const recovery = grouped.get('result').findLast((entry) => entry.source === 'STEP' && entry.stepId === 'recover-requirements' && finished(entry));
  const auditStage = stages.find((stage) => stage.stage === 'audit');
  if (auditStage?.status === 'unknown' && job.outcome === 'PARTIAL' && recovery) {
    auditStage.status = 'failed';
    auditStage.reasonCode = safeCode(recovery.metadata?.summary?.recoveryReasonCode);
    auditStage.completedAt = recovery.startedAt;
  }
  const candidate = stages.find((stage) => stage.stage === parent);
  if (candidate && ['failed', 'running', 'unknown'].includes(candidate.status) && audit.some((entry) => entry !== failedParent)) {
    candidate.status = 'completed';
    candidate.reasonCode = null;
    candidate.issues = [];
    candidate.completedAt = audit[0].startedAt;
  }
  return { stages };
}
