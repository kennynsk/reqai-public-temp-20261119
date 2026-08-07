import { createHash } from 'node:crypto';

import { heartbeat } from '@temporalio/activity';

import { evaluateOutcome } from '../domain/outcome.js';

function hashInput(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function createCheckpointedActivities({ jobRepository, handlers, siteId, heartbeatFn = heartbeat }) {
  async function checkpointed(name, input, discriminator, handler) {
    const stepId = discriminator ? `${name}:${discriminator}` : name; const inputHash = hashInput(input);
    const existing = await jobRepository.findCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, inputHash });
    if (existing) return { ...(existing.summary || {}), artifactId: existing.result_artifact_id, checkpointReplayed: true };
    heartbeatFn({ stepId });
    await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'RUNNING' });
    const heartbeatTimer = setInterval(() => heartbeatFn({ stepId }), 30_000);
    heartbeatTimer.unref?.();
    try {
      const result = await handler(input);
      await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'SUCCEEDED', resultArtifactId: result?.artifactId || null, summary: result });
      return result;
    } catch (error) {
      await jobRepository.saveCheckpoint({ tenantId: input.tenantId, jobId: input.jobId, stepId, stepType: name, inputHash, status: 'FAILED', summary: { reasonCode: error?.reasonCode || error?.type || error?.name || 'ACTIVITY_FAILED' } });
      throw error;
    } finally {
      clearInterval(heartbeatTimer);
    }
  }
  return {
    markRunning: (input) => jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'RUNNING', patch: { executionSite: siteId } }),
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
    async finalizeSucceeded(input) { const outcome = evaluateOutcome(input); return jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: outcome.status, outcome: outcome.outcome, patch: { progress: 100, resultArtifactId: input.resultArtifactId, reasonCode: outcome.reasonCode, completedSite: siteId } }); },
    finalizeFailed: (input) => jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'FAILED', patch: { reasonCode: input.reasonCode, completedSite: siteId } }),
    finalizeCancelled: (input) => jobRepository.transition({ tenantId: input.tenantId, jobId: input.jobId, toStatus: 'CANCELLED', patch: { reasonCode: input.reasonCode, completedSite: siteId } }),
  };
}
