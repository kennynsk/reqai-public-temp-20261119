import { createHash } from 'node:crypto';

import { ApplicationFailure, heartbeat } from '@temporalio/activity';

import { evaluateOutcome } from '../domain/outcome.js';
import { logEvent, redactDiagnosticMetadata } from '../middleware/safe-logging.js';

function lifecycleReference(input, status, outcome = null, reasonCode = null) {
  return { jobId: input.jobId, status, outcome, resultArtifactId: input.resultArtifactId || null, reasonCode };
}

function hashInput(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

const USER_PROGRESS = Object.freeze({
  validate: { start: [5, 'validation', 'Проверяем исходные данные'], complete: [10, 'validation', 'Исходные данные проверены'] },
  'plan-chunks': { start: [10, 'preparation', 'Подготавливаем контекст для AI'], complete: [15, 'preparation', 'Контекст подготовлен'] },
  'decompose-chunk': { start: [20, 'model', 'AI формирует структуру требований'], complete: [20, 'model', 'AI формирует структуру требований'] },
  'merge-decomposition': { start: [70, 'assembly', 'Собираем требования по категориям'], complete: [90, 'persistence', 'Сохраняем результат декомпозиции'] },
  'requirements-insights': { start: [20, 'model', 'AI анализирует требования и формирует рекомендации'], complete: [90, 'assembly', 'Собираем карточки рекомендаций'] },
});

const NON_RETRYABLE_FAILURE_TYPES = new Set([
  'JOB_DEADLINE_EXPIRED',
  'BABOK_SEMANTIC_INVALID',
  'OUTPUT_CONTRACT_VIOLATION',
  'BABOK_OUTPUT_INVALID',
  'INVALID_DECOMPOSITION_RESULT',
  'UNSUPPORTED_DECOMPOSITION_RESULT',
  'INVALID_REQUIREMENTS_INSIGHTS',
  'NO_USABLE_OUTPUT',
  'PROMPT_BUNDLE_UNAVAILABLE',
  'PROMPT_INTEGRITY_ERROR',
  'PROMPT_RENDER_TOO_LARGE',
]);

export function failureReason(error) {
  const value = error?.reasonCode || error?.type || error?.code || error?.name;
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,99}$/.test(value) ? value : 'ACTIVITY_FAILED';
}

function safeFailureDetails(error) {
  const details = error?.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  if (error.type === 'BABOK_SEMANTIC_INVALID' && Array.isArray(details.issues)) return {
    policy: details.policy === 'babok-semantic.v2' ? details.policy : 'babok-semantic.v1',
    issues: details.issues.slice(0, 30).map((issue) => ({ key: String(issue.key || '$').slice(0, 100), code: String(issue.code || 'SEMANTIC_REVIEW_FINDING').slice(0, 100), reason: '[REDACTED]' })),
  };
  const path = typeof details.path === 'string' ? details.path.slice(0, 256) : null;
  const reason = typeof details.reason === 'string' ? '[REDACTED]' : null;
  return path || reason ? { ...(path ? { path } : {}), ...(reason ? { reason } : {}) } : null;
}

export function toNonRetryableActivityFailure(error) {
  const reasonCode = failureReason(error);
  const safeCode = /^[A-Z][A-Z0-9_]{0,99}$/.test(reasonCode) ? reasonCode : 'ACTIVITY_FAILED';
  return ApplicationFailure.create({ message: safeCode, type: safeCode, nonRetryable: error?.nonRetryable === true || NON_RETRYABLE_FAILURE_TYPES.has(reasonCode), details: [redactDiagnosticMetadata(safeFailureDetails(error))] });
}

export function createCheckpointedActivities({ jobRepository, jobTraceRepository, diagnosticCapture, handlers, siteId, heartbeatFn = heartbeat }) {
  const trace = (input, entry) => jobTraceRepository?.append({ tenantId: input.tenantId, jobId: input.jobId, ...entry }).catch((error) => {
    logEvent('warn', 'job.trace.append.failed', { jobId: input.jobId, category: entry.category, errorType: error?.name || 'Error' });
  });
  const reportProgress = async (input, name, phase) => {
    const milestone = USER_PROGRESS[name]?.[phase];
    if (!milestone || !jobRepository.updateProgress) return;
    const [progress, currentStep, message] = milestone;
    await jobRepository.updateProgress({ tenantId: input.tenantId, jobId: input.jobId, progress, currentStep, message });
  };
  async function checkpointed(name, input, discriminator, handler) {
    const stepId = discriminator ? `${name}:${discriminator}` : name; const inputHash = hashInput(input);
    const existing = await jobRepository.findCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, inputHash });
    if (existing) {
      await reportProgress(input, name, 'complete');
      return { ...(existing.summary || {}), artifactId: existing.result_artifact_id, checkpointReplayed: true };
    }
    heartbeatFn({ stepId });
    await reportProgress(input, name, 'start');
    await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'RUNNING' });
    await trace(input, { category: name === 'validate' ? 'VALIDATION' : name.includes('plan') ? 'CONTEXT' : 'WORKFLOW', name, status: 'RUNNING', stepId, startedAt: new Date(), metadata: { inputHash } });
    await diagnosticCapture?.capture({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, jobId: input.jobId, stepId, category: 'CONTEXT', name: `${name} input captured`, kind: 'INPUT', content: input });
    const heartbeatTimer = setInterval(() => heartbeatFn({ stepId }), 30_000);
    heartbeatTimer.unref?.();
    try {
      const result = await handler(input);
      await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'SUCCEEDED', resultArtifactId: result?.artifactId || null, summary: result });
      await reportProgress(input, name, 'complete');
      await trace(input, { category: name === 'validate' ? 'VALIDATION' : name.includes('assemble') || name.includes('merge') ? 'PERSISTENCE' : 'WORKFLOW', name, status: 'COMPLETED', stepId, completedAt: new Date(), outputArtifactId: result?.artifactId || null, metadata: { checkpoint: 'SUCCEEDED' } });
      await diagnosticCapture?.capture({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, jobId: input.jobId, stepId, category: 'PERSISTENCE', name: `${name} output captured`, kind: 'INTERMEDIATE', content: result });
      return result;
    } catch (error) {
      const reasonCode = failureReason(error);
      const details = redactDiagnosticMetadata(safeFailureDetails(error));
      await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'FAILED', summary: { reasonCode, ...(details ? { details } : {}) } });
      await trace(input, { category: 'ERROR', name, status: 'FAILED', stepId, completedAt: new Date(), metadata: { reasonCode, ...(details ? { details } : {}) } });
      await diagnosticCapture?.capture({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, jobId: input.jobId, stepId, category: 'ERROR', name: `${name} error detail captured`, kind: 'ERROR_STACK', visibility: 'SYSTEM_ADMIN', content: { errorType: error?.name || 'Error', reasonCode, ...(details ? { details } : {}), stack: error?.stack } });
      throw toNonRetryableActivityFailure(error);
    } finally {
      clearInterval(heartbeatTimer);
    }
  }
  return {
    async markRunning(input) { await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'RUNNING', patch: { executionSite: siteId, progress: 2, currentStep: 'starting', message: 'Запускаем обработку' } }); await trace(input, { category: 'WORKFLOW', name: 'Workflow initialized', status: 'RUNNING', startedAt: new Date(), metadata: { executionSite: siteId } }); return lifecycleReference(input, 'RUNNING'); },
    validateInput: (input) => checkpointed('validate', input, null, handlers.validateInput),
    planChunks: (input) => checkpointed('plan-chunks', input, null, handlers.planChunks),
    decomposeChunk: (input) => checkpointed('decompose-chunk', input, input.chunk.chunkId, handlers.decomposeChunk),
    mergeDecomposition: (input) => checkpointed('merge-decomposition', input, null, handlers.mergeDecomposition),
    generateRequirementsInsights: (input) => checkpointed('requirements-insights', input, null, handlers.generateRequirementsInsights),
    recoverRequirements: (input) => checkpointed('recover-requirements', input, null, handlers.recoverRequirements),
    async finalizeSucceeded(input) { const outcome = evaluateOutcome(input); await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: outcome.status, outcome: outcome.outcome, patch: { progress: 100, resultArtifactId: input.resultArtifactId, reasonCode: outcome.reasonCode, completedSite: siteId } }); await trace(input, { category: 'RESULT', name: 'Task completed', status: 'COMPLETED', completedAt: new Date(), outputArtifactId: input.resultArtifactId, metadata: { outcome: outcome.outcome, reasonCode: outcome.reasonCode } }); return lifecycleReference(input, outcome.status, outcome.outcome, outcome.reasonCode); },
    async finalizeFailed(input) { await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'FAILED', patch: { reasonCode: input.reasonCode, completedSite: siteId } }); await trace(input, { category: 'ERROR', name: 'Task failed', status: 'FAILED', completedAt: new Date(), metadata: { reasonCode: input.reasonCode } }); return lifecycleReference(input, 'FAILED', null, failureReason({ reasonCode: input.reasonCode })); },
    async finalizeCancelled(input) { await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'CANCELLED', patch: { reasonCode: input.reasonCode, completedSite: siteId } }); await trace(input, { category: 'LIFECYCLE', name: 'Task cancelled', status: 'COMPLETED', completedAt: new Date(), metadata: { reasonCode: input.reasonCode } }); return lifecycleReference(input, 'CANCELLED', null, failureReason({ reasonCode: input.reasonCode })); },
  };
}
