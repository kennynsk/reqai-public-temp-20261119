import { CancellationScope, defineSignal, isCancellation, patched, proxyActivities, setHandler } from '@temporalio/workflow';

const retryRequested = defineSignal('retryRequested');
const activityOptions = {
  startToCloseTimeout: '10 minutes',
  scheduleToCloseTimeout: '30 minutes',
  heartbeatTimeout: '1 minute',
  retry: {
    maximumAttempts: 3,
    initialInterval: '2 seconds',
    backoffCoefficient: 2,
    maximumInterval: '1 minute',
    // ModelExecutor already owns bounded retry/fallback. Re-running the whole
    // activity would bypass that budget and can duplicate paid provider calls.
    nonRetryableErrorTypes: ['ProviderError', 'NON_RETRYABLE_PROVIDER_ERROR', 'JOB_DEADLINE_EXPIRED'],
  },
};
const activities = proxyActivities(activityOptions);

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
    try { return await fn(item); } catch (error) { return { success: false, ...identity(item), reasonCode: error?.type || error?.name || 'ACTIVITY_FAILED' }; }
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
    await CancellationScope.nonCancellable(() => activities.finalizeFailed({ ...input, reasonCode: error?.type || error?.name || 'WORKFLOW_FAILED' }));
    throw error;
  }
}

function synthesisActivities(input) {
  return proxyActivities({
    ...activityOptions,
    taskQueue: input.configurationSnapshot.taskQueues?.synthesis || 'requirements-synthesis',
  });
}

function categoriesFor(input, analysis) {
  const categories = (analysis.categories || []).slice(0, input.configurationSnapshot.maxResearchCategories);
  return input.configurationSnapshot.allCategories === false ? categories.slice(0, 1) : categories;
}

async function researchUnits(input, categories, { style, variant = null }) {
  const kinds = style === 'STANDARD' ? input.configurationSnapshot.researchKinds : ['agent'];
  const units = categories.flatMap((category) => kinds.map((kind) => ({ category, kind })));
  return recoverable(
    units,
    input.configurationSnapshot.categoryConcurrency || 3,
    ({ category, kind }) => {
      assertDeadline(input);
      return activities.researchCategory({
        ...input,
        category,
        kind,
        variant,
        researchStyle: style,
        stepKey: [variant, style, category.id, kind].filter(Boolean).join(':'),
      });
    },
    ({ category, kind }) => ({ categoryId: category.id, categoryName: category.name, kind, style, variant }),
  );
}

async function synthesisAndImprovement(input, units, { style, variant = null }) {
  const synthesis = synthesisActivities(input);
  const successful = units.filter((unit) => unit.success && unit.artifactId);
  if (!successful.length) return { successful, synthesis: null, improved: null };
  assertDeadline(input);
  const synthesized = await synthesis.synthesizeResearch({
    ...input,
    variant,
    researchStyle: style,
    stepKey: [variant, style].filter(Boolean).join(':'),
    resultArtifactIds: successful.map((unit) => unit.artifactId),
    failedCategories: units.filter((unit) => !unit.success).map((unit) => `${unit.categoryId}:${unit.kind}`),
  });
  assertDeadline(input);
  const improved = await synthesis.improveRequirements({
    ...input,
    variant,
    researchStyle: style,
    stepKey: [variant, style].filter(Boolean).join(':'),
    synthesisArtifactId: synthesized.artifactId,
  });
  return { successful, synthesis: synthesized, improved };
}

export async function decompositionWorkflow(input) {
  return cancellationBoundary(input, async () => {
    assertDeadline(input);
    await activities.validateInput(input);
    const plan = await activities.planChunks({ ...input, workflowType: 'DECOMPOSITION' });
    const sections = await recoverable(plan.chunks, input.configurationSnapshot.chunkConcurrency || 3, async (chunk) => {
      assertDeadline(input);
      return activities.decomposeChunk({ ...input, chunk });
    }, (chunk) => ({ chunkId: chunk.chunkId }));
    const successful = sections.filter((section) => section.success && section.artifactId);
    const failedChunks = sections.filter((section) => !section.success).map((section) => section.chunkId);
    if (!successful.length) {
      return activities.finalizeSucceeded({ ...input, resultArtifactId: null, successfulUnits: 0, failedUnits: sections.length });
    }
    assertDeadline(input);
    const merged = await activities.mergeDecomposition({ ...input, sectionArtifactIds: successful.map((section) => section.artifactId), failedChunks });
    return activities.finalizeSucceeded({ ...input, resultArtifactId: merged.artifactId, successfulUnits: successful.length, failedUnits: failedChunks.length });
  });
}

export async function researchWorkflow(input) {
  return cancellationBoundary(input, async () => {
    const mode = input.configurationSnapshot.featureMode || 'AGENT_RESEARCH';
    const synthesis = synthesisActivities(input);
    assertDeadline(input);
    await activities.validateInput(input);

    if (mode === 'REQUIREMENTS_INSIGHTS') {
      const result = await activities.generateRequirementsInsights(input);
      return activities.finalizeSucceeded({ ...input, resultArtifactId: result.artifactId, successfulUnits: 1, failedUnits: 0 });
    }

    if (mode === 'PROMPT_TEST') {
      const result = await activities.promptTest(input);
      return activities.finalizeSucceeded({ ...input, resultArtifactId: result.artifactId, successfulUnits: 1, failedUnits: 0 });
    }

    if (mode === 'MODEL_COMPARE') {
      const analysisA = await activities.analyzeCategories({ ...input, analysisStyle: 'STANDARD', variant: 'variantA', stepKey: 'variantA' });
      const analysisB = await activities.analyzeCategories({ ...input, analysisStyle: 'STANDARD', variant: 'variantB', stepKey: 'variantB' });
      let units = [];
      if (input.configurationSnapshot.compareTarget === 'RESEARCH') {
        const category = categoriesFor(input, analysisA)[0];
        if (category) {
          const kind = input.configurationSnapshot.researchKind || 'trends';
          const [unitA, unitB] = await Promise.all([
            activities.researchCategory({ ...input, category, kind, researchStyle: 'STANDARD', variant: 'variantA', stepKey: `variantA:${category.id}:${kind}` }),
            activities.researchCategory({ ...input, category, kind, researchStyle: 'STANDARD', variant: 'variantB', stepKey: `variantB:${category.id}:${kind}` }),
          ]);
          units = [unitA, unitB];
        }
      }
      const result = await synthesis.assembleResearchResult({
        ...input,
        analyses: [analysisA, analysisB],
        units,
        failedUnits: [],
        comparison: { target: input.configurationSnapshot.compareTarget, variants: input.configurationSnapshot.comparison },
      });
      return activities.finalizeSucceeded({ ...input, resultArtifactId: result.artifactId, successfulUnits: 2, failedUnits: 0 });
    }

    if (mode === 'AGENT_COMPARE') {
      const [baselineAnalysis, agentAnalysis] = await Promise.all([
        activities.analyzeCategories({ ...input, analysisStyle: 'STANDARD', stepKey: 'baseline' }),
        activities.analyzeCategories({ ...input, analysisStyle: 'AGENT', stepKey: 'agent' }),
      ]);
      const categories = categoriesFor(input, agentAnalysis.categories?.length ? agentAnalysis : baselineAnalysis);
      const [baselineUnits, agentUnits] = await Promise.all([
        researchUnits(input, categories, { style: 'STANDARD' }),
        researchUnits(input, categories, { style: 'AGENT' }),
      ]);
      const [baseline, agent] = await Promise.all([
        synthesisAndImprovement(input, baselineUnits, { style: 'STANDARD', variant: 'baseline' }),
        synthesisAndImprovement(input, agentUnits, { style: 'AGENT', variant: 'agent' }),
      ]);
      const allUnits = [...baselineUnits, ...agentUnits];
      const result = await synthesis.assembleResearchResult({
        ...input,
        analyses: [baselineAnalysis, agentAnalysis],
        units: allUnits,
        failedUnits: allUnits.filter((unit) => !unit.success),
        comparison: {
          target: 'AGENT_VS_STANDARD',
          baseline: { synthesisArtifactId: baseline.synthesis?.artifactId, improvedArtifactId: baseline.improved?.artifactId },
          agent: { synthesisArtifactId: agent.synthesis?.artifactId, improvedArtifactId: agent.improved?.artifactId },
        },
      });
      const successful = allUnits.filter((unit) => unit.success).length;
      return activities.finalizeSucceeded({ ...input, resultArtifactId: result.artifactId, successfulUnits: successful, failedUnits: allUnits.length - successful });
    }

    const style = mode === 'STANDARD_RESEARCH' ? 'STANDARD' : 'AGENT';
    const analysis = await activities.analyzeCategories({ ...input, analysisStyle: style, stepKey: style.toLowerCase() });
    const categories = categoriesFor(input, analysis);
    const units = await researchUnits(input, categories, { style });
    const completed = await synthesisAndImprovement(input, units, { style });
    const result = await synthesis.assembleResearchResult({
      ...input,
      analyses: [analysis],
      units,
      synthesisArtifactId: completed.synthesis?.artifactId,
      improvedArtifactId: completed.improved?.artifactId,
      failedUnits: units.filter((unit) => !unit.success),
    });
    return activities.finalizeSucceeded({ ...input, resultArtifactId: result.artifactId, successfulUnits: completed.successful.length, failedUnits: units.length - completed.successful.length });
  });
}
