import { CancellationScope, defineSignal, isCancellation, patched, proxyActivities, setHandler } from '@temporalio/workflow';

const retryRequested = defineSignal('retryRequested');
const activityOptions = {
  startToCloseTimeout: '10 minutes',
  scheduleToCloseTimeout: '30 minutes',
  // SDK 1.22 throttles outbound heartbeats to 0.8 × heartbeatTimeout (48s for a
  // 1-minute timeout). LLM activities sit minutes on the provider call, and the
  // 12s margin caused heartbeat-timeout retries that re-ran paid model calls.
  heartbeatTimeout: '3 minutes',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    // ModelExecutor already owns bounded retry/fallback. Re-running the whole
    // activity would bypass that budget and can duplicate paid provider calls.
    nonRetryableErrorTypes: [
      'ProviderError',
      'NON_RETRYABLE_PROVIDER_ERROR',
      'JOB_DEADLINE_EXPIRED',
      'OUTPUT_CONTRACT_VIOLATION',
      'BABOK_OUTPUT_INVALID',
      'INVALID_DECOMPOSITION_RESULT',
      'UNSUPPORTED_DECOMPOSITION_RESULT',
      'INVALID_REQUIREMENTS_INSIGHTS',
      'BABOK_SEMANTIC_INVALID',
      'NO_USABLE_OUTPUT',
      'PROMPT_BUNDLE_UNAVAILABLE',
      'PROMPT_INTEGRITY_ERROR',
      'PROMPT_RENDER_TOO_LARGE',
    ],
  },
};
const activities = proxyActivities(activityOptions);
// A semantic pass includes generation, review and at most two complete
// correction/audit pairs. Individual provider calls already have their own
// deadline and retry policy; the enclosing activity must not time out at 10m.
const semanticActivities = proxyActivities({ ...activityOptions,
  startToCloseTimeout: '45 minutes', scheduleToCloseTimeout: '55 minutes',
});
const compactSemanticActivities = proxyActivities({ ...activityOptions,
  startToCloseTimeout: '5 minutes', scheduleToCloseTimeout: '6 minutes', retry: { ...activityOptions.retry, maximumAttempts: 1 },
});

const researchSemanticActivities = proxyActivities({ ...activityOptions,
  startToCloseTimeout: '16 minutes', scheduleToCloseTimeout: '17 minutes', retry: { ...activityOptions.retry, maximumAttempts: 1 },
});

function semanticActivitiesFor(input) {
  if (patched('babok-research-activity-budget-v1') && input.configurationSnapshot.promptProfile?.performanceBudgetMs > 240_000 && input.configurationSnapshot.promptProfile?.id === 'requirements-insights') return researchSemanticActivities;
  if (patched('babok-compact-activity-budget-v1') && input.configurationSnapshot.promptProfile?.semanticPolicy === 'babok-semantic.v2') return compactSemanticActivities;
  return patched('babok-semantic-activity-budget-v1') && input.configurationSnapshot.promptProfile?.templates?.['semantic-audit']
    ? semanticActivities : activities;
}

function assertDeadline(input) {
  if (Date.now() >= new Date(input.deadlineAt).getTime()) throw Object.assign(new Error('Job deadline expired'), { name: 'JOB_DEADLINE_EXPIRED' });
}

async function bounded(items, concurrency, fn) {
  const output = [];
  for (let i = 0; i < items.length; i += concurrency) output.push(...await Promise.all(items.slice(i, i + concurrency).map(fn)));
  return output;
}

async function recoverable(items, concurrency, fn, identity) {
  return bounded(items, concurrency, async (item) => {
    try { return await fn(item); } catch (error) {
      const cause = error?.cause;
      return { success: false, ...identity(item), reasonCode: cause?.reasonCode || cause?.type || error?.reasonCode || error?.type || error?.name || 'ACTIVITY_FAILED' };
    }
  });
}

async function cancellationBoundary(input, run) {
  let retryReason = null;
  setHandler(retryRequested, (value) => { retryReason = value?.reason || 'operator'; });
  patched('reqai-workflow-v1');
  try {
    await activities.markRunning(input);
    return await run(() => retryReason);
  } catch (error) {
    if (isCancellation(error)) {
      await CancellationScope.nonCancellable(() => activities.finalizeCancelled({ ...input, reasonCode: 'CANCELLED_BY_REQUEST' }));
      return { status: 'CANCELLED' };
    }
    const cause = error?.cause;
    await CancellationScope.nonCancellable(() => activities.finalizeFailed({ ...input, reasonCode: cause?.reasonCode || cause?.type || error?.reasonCode || error?.type || error?.name || 'WORKFLOW_FAILED' }));
    throw error;
  }
}

export async function decompositionWorkflow(input) {
  return cancellationBoundary(input, async () => {
    assertDeadline(input);
    await activities.validateInput(input);
    const plan = await activities.planChunks({ ...input, workflowType: 'DECOMPOSITION' });
    const sections = await recoverable(plan.chunks, input.configurationSnapshot.chunkConcurrency || 3, async (chunk) => {
      assertDeadline(input);
      return activities.decomposeChunk({ ...input, chunk });
    }, (chunk) => ({ chunkId: chunk.chunkId, sourceArtifactId: chunk.artifactId }));
    const successful = sections.filter((section) => section.success && section.artifactId);
    const failedChunks = sections.filter((section) => !section.success).map((section) => ({ chunkId: section.chunkId, artifactId: section.sourceArtifactId }));
    if (!successful.length) {
      return activities.finalizeSucceeded({ ...input, resultArtifactId: null, successfulUnits: 0, failedUnits: sections.length });
    }
    assertDeadline(input);
    const merged = await semanticActivitiesFor(input).mergeDecomposition({ ...input, sectionArtifactIds: successful.map((section) => section.artifactId), failedChunks });
    const textDraft = patched('babok-text-draft-outcome-v1') && merged.textDraft === true;
    return activities.finalizeSucceeded({ ...input, resultArtifactId: merged.artifactId, successfulUnits: successful.length, failedUnits: failedChunks.length, ...(textDraft ? { textDraft: true } : {}) });
  });
}

export async function researchWorkflow(input) {
  return cancellationBoundary(input, async () => {
    const mode = input.configurationSnapshot.featureMode;
    if (mode !== 'REQUIREMENTS_INSIGHTS') throw Object.assign(new Error(`Unsupported research workflow mode: ${mode || 'missing'}`), { name: 'UNSUPPORTED_JOB_MODE' });
    assertDeadline(input);
    await activities.validateInput(input);
    const result = await semanticActivitiesFor(input).generateRequirementsInsights(input);
    return activities.finalizeSucceeded({ ...input, resultArtifactId: result.artifactId, successfulUnits: 1, failedUnits: 0 });
  });
}
