import { createHash } from 'node:crypto';

import { heartbeat } from '@temporalio/activity';

import { evaluateOutcome } from '../domain/outcome.js';
import { logEvent } from '../middleware/safe-logging.js';

function hashInput(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function createCheckpointedActivities({ jobRepository, jobTraceRepository, diagnosticCapture, handlers, siteId, heartbeatFn = heartbeat }) {
  const trace = (input, entry) => jobTraceRepository?.append({ tenantId: input.tenantId, jobId: input.jobId, ...entry }).catch((error) => {
    logEvent('warn', 'job.trace.append.failed', { jobId: input.jobId, category: entry.category, errorType: error?.name || 'Error' });
  });
  async function checkpointed(name, input, discriminator, handler) {
    const stepId = discriminator ? `${name}:${discriminator}` : name; const inputHash = hashInput(input);
    const existing = await jobRepository.findCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, inputHash });
    if (existing) return { ...(existing.summary || {}), artifactId: existing.result_artifact_id, checkpointReplayed: true };
    heartbeatFn({ stepId });
    await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'RUNNING' });
    await trace(input, { category: name === 'validate' ? 'VALIDATION' : name.includes('plan') ? 'CONTEXT' : 'WORKFLOW', name, status: 'RUNNING', stepId, startedAt: new Date(), metadata: { inputHash } });
    await diagnosticCapture?.capture({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, jobId: input.jobId, stepId, category: 'CONTEXT', name: `${name} input captured`, kind: 'INPUT', content: input });
    const heartbeatTimer = setInterval(() => heartbeatFn({ stepId }), 30_000);
    heartbeatTimer.unref?.();
    try {
      const result = await handler(input);
      await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'SUCCEEDED', resultArtifactId: result?.artifactId || null, summary: result });
      await trace(input, { category: name === 'validate' ? 'VALIDATION' : name.includes('assemble') || name.includes('merge') ? 'PERSISTENCE' : 'WORKFLOW', name, status: 'COMPLETED', stepId, completedAt: new Date(), outputArtifactId: result?.artifactId || null, metadata: { checkpoint: 'SUCCEEDED' } });
      await diagnosticCapture?.capture({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, jobId: input.jobId, stepId, category: 'PERSISTENCE', name: `${name} output captured`, kind: 'INTERMEDIATE', content: result });
      return result;
    } catch (error) {
      await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'FAILED', summary: { reasonCode: error?.reasonCode || error?.type || error?.name || 'ACTIVITY_FAILED' } });
      await trace(input, { category: 'ERROR', name, status: 'FAILED', stepId, completedAt: new Date(), metadata: { reasonCode: error?.reasonCode || error?.type || error?.name || 'ACTIVITY_FAILED' } });
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
    }
  }
  return {
    async markRunning(input) { const value = await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'RUNNING', patch: { executionSite: siteId } }); await trace(input, { category: 'WORKFLOW', name: 'Workflow initialized', status: 'RUNNING', startedAt: new Date(), metadata: { executionSite: siteId } }); return value; },
    validateInput: (input) => checkpointed('validate', input, null, handlers.validateInput),
    planChunks: (input) => checkpointed('plan-chunks', input, null, handlers.planChunks),
    decomposeChunk: (input) => checkpointed('decompose-chunk', input, input.chunk.chunkId, handlers.decomposeChunk),
    mergeDecomposition: (input) => checkpointed('merge-decomposition', input, null, handlers.mergeDecomposition),
    generateDecompositionInsights: (input) => checkpointed('decomposition-insights', input, null, handlers.generateDecompositionInsights),
    generateRequirementsInsights: (input) => checkpointed('requirements-insights', input, null, handlers.generateRequirementsInsights),
    analyzeCategories: (input) => checkpointed('analyze-categories', input, input.stepKey || input.variant || input.analysisStyle || null, handlers.analyzeCategories),
    researchCategory: (input) => checkpointed('research-category', input, input.stepKey || [input.variant, input.researchStyle, input.category.id, input.kind].filter(Boolean).join(':'), handlers.researchCategory),
    synthesizeResearch: (input) => checkpointed('synthesize-research', input, input.stepKey || input.variant || input.researchStyle || null, handlers.synthesizeResearch),
    improveRequirements: (input) => checkpointed('improve-requirements', input, input.stepKey || input.variant || input.researchStyle || null, handlers.improveRequirements),
    assembleResearchResult: (input) => checkpointed('assemble-research-result', input, null, handlers.assembleResearchResult),
    promptTest: (input) => checkpointed('prompt-test', input, null, handlers.promptTest),
    async finalizeSucceeded(input) { const outcome = evaluateOutcome(input); const value = await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: outcome.status, outcome: outcome.outcome, patch: { progress: 100, resultArtifactId: input.resultArtifactId, reasonCode: outcome.reasonCode, completedSite: siteId } }); await trace(input, { category: 'RESULT', name: 'Task completed', status: 'COMPLETED', completedAt: new Date(), outputArtifactId: input.resultArtifactId, metadata: { outcome: outcome.outcome, reasonCode: outcome.reasonCode } }); return value; },
    async finalizeFailed(input) { const value = await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'FAILED', patch: { reasonCode: input.reasonCode, completedSite: siteId } }); await trace(input, { category: 'ERROR', name: 'Task failed', status: 'FAILED', completedAt: new Date(), metadata: { reasonCode: input.reasonCode } }); return value; },
    async finalizeCancelled(input) { const value = await jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'CANCELLED', patch: { reasonCode: input.reasonCode, completedSite: siteId } }); await trace(input, { category: 'LIFECYCLE', name: 'Task cancelled', status: 'COMPLETED', completedAt: new Date(), metadata: { reasonCode: input.reasonCode } }); return value; },
  };
}
