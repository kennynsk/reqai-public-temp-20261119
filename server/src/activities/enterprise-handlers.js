import { buildDecomposePrompt, buildInsightsPrompt } from '../../decomposer-prompts.js';
import {
  ASK_SYSTEM_PROMPT,
  buildAnalyzePrompt,
  buildAgentAnalyzePrompt,
  buildAgentImproveRequirementsPrompt,
  buildAgentResearchPrompt,
  buildAgentSynthesisPrompt,
  buildImproveRequirementsPrompt,
  buildResearchPrompt,
} from '../../prompts.js';
import { withExtractedTrace } from '../observability/telemetry.js';

function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || text).trim());
}

function modelPolicy(input, config, execution = {}) {
  const snapshot = input.configurationSnapshot;
  return {
    models: execution.models || snapshot.models,
    maxAttemptsPerModel: snapshot.maxAttemptsPerModel,
    requestTimeoutMs: snapshot.requestTimeoutMs,
    retryInitialDelayMs: snapshot.retryInitialDelayMs || config.llm.retryInitialDelayMs,
    retryMaxDelayMs: snapshot.retryMaxDelayMs || config.llm.retryMaxDelayMs,
    maxConcurrency: snapshot.maxConcurrency || config.llm.maxConcurrency,
  };
}

function researchPrompt(style, kind, category, requirements) {
  if (style === 'STANDARD') {
    return buildResearchPrompt(kind, category.name, category.description, category.level, requirements);
  }
  return buildAgentResearchPrompt({ ...category, originalRequirements: requirements });
}

const INSIGHT_CATEGORIES = new Set(['trends', 'patterns', 'risks', 'competitors', 'standards']);

function normalizeRequirementsInsights(value) {
  const insights = Array.isArray(value?.insights) ? value.insights : [];
  return insights
    .filter((item) => item && INSIGHT_CATEGORIES.has(item.category))
    .slice(0, 12)
    .map((item, index) => ({
      id: String(item.id || `insight-${index + 1}`),
      category: item.category,
      title: String(item.title || '').trim(),
      summary: String(item.summary || '').trim(),
      detail: String(item.detail || '').trim(),
      applicability: Math.max(0, Math.min(100, Number.isFinite(item.applicability) ? item.applicability : 50)),
      source_types: Array.isArray(item.source_types) ? item.source_types.map(String) : [],
      relatedTo: Array.isArray(item.relatedTo) ? item.relatedTo.map(String) : [],
      enhancements: Array.isArray(item.enhancements)
        ? item.enhancements.filter((enhancement) => enhancement && ['business', 'functional', 'nonfunctional'].includes(enhancement.targetType) && String(enhancement.text || '').trim()).map((enhancement) => ({ targetType: enhancement.targetType, text: String(enhancement.text).trim() }))
        : [],
    }))
    .filter((item) => item.title && item.summary);
}

export function createEnterpriseActivityHandlers({ artifactRepository, modelExecutor, promptCatalog = null, config }) {
  function renderedPrompt(input, step, variables, legacyBuilder) {
    const profile = input.configurationSnapshot.promptProfile;
    if (!profile) return legacyBuilder();
    if (!promptCatalog) throw Object.assign(new Error('Snapshotted prompt catalog is unavailable'), { type: 'PROMPT_BUNDLE_UNAVAILABLE' });
    const declaration = promptCatalog.get(profile.id, profile.version).templates[step];
    if (!declaration) throw Object.assign(new Error(`Prompt step ${step} is unavailable`), { type: 'PROMPT_INTEGRITY_ERROR' });
    const declaredVariables = Object.fromEntries(declaration.requiredVariables.map((name) => [name, variables[name]]));
    return promptCatalog.render(profile, step, declaredVariables).text;
  }

  function requirementsSection(requirements) {
    return requirements ? `\nТекущие требования:\n${JSON.stringify(requirements, null, 2)}` : '';
  }

  async function complete(input, stepId, prompt, execution = {}) {
    const messages = [
      ...(execution.systemPrompt ? [{ role: 'system', content: execution.systemPrompt }] : []),
      { role: 'user', content: prompt },
    ];
    return withExtractedTrace(input.traceContext, `temporal.activity.${stepId}`, () => modelExecutor.execute({
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      jobId: input.jobId,
      stepId,
      messages,
      policy: modelPolicy(input, config, execution),
      temperature: execution.temperature ?? input.configurationSnapshot.temperature,
      deadlineAt: input.deadlineAt,
      executionSite: config.process.siteId,
    }));
  }

  async function store(input, text, kind = 'INTERMEDIATE', contentType = 'text/plain; charset=utf-8') {
    const retentionDays = kind === 'RESULT' ? config.retention.finalResultsDays : config.retention.intermediateDays;
    return artifactRepository.createText({
      tenantId: input.tenantId,
      ownerUserId: input.ownerUserId,
      text,
      kind,
      contentType,
      maxBytes: config.jobs.resultMaxBytes,
      expiresAt: new Date(Date.now() + retentionDays * 86_400_000),
    });
  }

  async function artifactText(input, artifactId) {
    return artifactRepository.readText({ tenantId: input.tenantId, artifactId });
  }

  function executionFor(input) {
    if (!input.variant) return {};
    return input.configurationSnapshot.comparison?.[input.variant] || {};
  }

  return {
    async validateInput(input) {
      const metadata = await artifactRepository.metadata({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, artifactId: input.inputArtifactId });
      if (!metadata) throw Object.assign(new Error('Input artifact is unavailable'), { type: 'INPUT_ARTIFACT_UNAVAILABLE' });
      return { valid: true, sizeBytes: Number(metadata.size_bytes), sha256: metadata.sha256 };
    },

    async planChunks(input) {
      const targetChars = (input.configurationSnapshot.chunkTargetTokens || config.llm.chunkTargetTokens) * 4;
      const chunks = [];
      let pending = '';
      for await (const bytes of artifactRepository.readChunks({ tenantId: input.tenantId, artifactId: input.inputArtifactId })) {
        pending += bytes.toString('utf8').replace(/\r\n/g, '\n');
        while (pending.length >= targetChars) {
          const boundary = pending.lastIndexOf('\n', targetChars);
          const end = boundary > targetChars / 2 ? boundary : targetChars;
          const content = pending.slice(0, end);
          pending = pending.slice(end);
          const saved = await store(input, content);
          chunks.push({ chunkId: `chunk-${chunks.length + 1}`, artifactId: saved.artifactId });
        }
      }
      if (pending.trim() || !chunks.length) {
        const saved = await store(input, pending);
        chunks.push({ chunkId: `chunk-${chunks.length + 1}`, artifactId: saved.artifactId });
      }
      return { chunks, chunkCount: chunks.length };
    },

    async decomposeChunk(input) {
      const source = await artifactText(input, input.chunk.artifactId);
      const prompt = renderedPrompt(input, 'decompose', { businessContext: source }, () => buildDecomposePrompt(source));
      const response = await complete(input, `decompose-chunk:${input.chunk.chunkId}`, prompt);
      const saved = await store(input, response.text);
      return { ...saved, chunkId: input.chunk.chunkId, success: true, actualModel: response.actualModel, fallbackApplied: response.fallbackApplied };
    },

    async mergeDecomposition(input) {
      const sections = await Promise.all(input.sectionArtifactIds.map((id) => artifactText(input, id)));
      const result = {
        schemaVersion: 1,
        mode: 'DECOMPOSITION',
        outcome: input.failedChunks.length ? 'PARTIAL' : 'COMPLETE',
        decomposition: sections.map((text, index) => ({ sourceArtifactId: input.sectionArtifactIds[index], content: parseJson(text) })),
        failedChunks: input.failedChunks,
      };
      const saved = await store(input, JSON.stringify(result, null, 2), 'RESULT', 'application/json; charset=utf-8');
      return { ...saved, sectionCount: sections.length, failedSections: input.failedChunks.length };
    },

    async generateDecompositionInsights(input) {
      const source = await artifactText(input, input.inputArtifactId);
      const decomposition = parseJson(await artifactText(input, input.decompositionArtifactId));
      const prompt = renderedPrompt(input, 'insights', { businessContext: source, requirementsSection: requirementsSection(decomposition) }, () => buildInsightsPrompt(source, decomposition));
      const response = await complete(input, 'decomposition-insights', prompt);
      let insights;
      try { insights = parseJson(response.text); } catch { insights = { raw: response.text }; }
      const result = { schemaVersion: 1, mode: 'DECOMPOSITION_WITH_INSIGHTS', ...decomposition, insights };
      return store(input, JSON.stringify(result, null, 2), 'RESULT', 'application/json; charset=utf-8');
    },

    async generateRequirementsInsights(input) {
      const envelope = parseJson(await artifactText(input, input.inputArtifactId));
      if (envelope?.kind !== 'REQUIREMENTS_VERSION' || !envelope.requirements) {
        throw Object.assign(new Error('Requirements insights input must be a requirements version'), { type: 'INVALID_REQUIREMENTS_VERSION' });
      }
      const businessContext = envelope.businessContextArtifactId
        ? await artifactText(input, envelope.businessContextArtifactId)
        : JSON.stringify(envelope.requirements);
      const prompt = renderedPrompt(input, 'insights', { businessContext, requirementsSection: requirementsSection(envelope.requirements) }, () => buildInsightsPrompt(businessContext, envelope.requirements));
      const response = await complete(input, 'requirements-insights', prompt);
      let parsed;
      try { parsed = parseJson(response.text); } catch { throw Object.assign(new Error('Requirements insights response must be valid JSON'), { type: 'INVALID_REQUIREMENTS_INSIGHTS' }); }
      const insights = normalizeRequirementsInsights(parsed);
      if (!insights.length) throw Object.assign(new Error('Requirements insights response contains no usable insights'), { type: 'INVALID_REQUIREMENTS_INSIGHTS' });
      const result = {
        schemaVersion: 1,
        mode: 'REQUIREMENTS_INSIGHTS',
        baseRequirements: envelope.requirements,
        inputRequirementsVersionId: input.inputArtifactId,
        insights,
      };
      const saved = await store(input, JSON.stringify(result, null, 2), 'RESULT', 'application/json; charset=utf-8');
      return { ...saved, insightCount: insights.length, actualModel: response.actualModel, fallbackApplied: response.fallbackApplied };
    },

    async analyzeCategories(input) {
      if (input.configurationSnapshot.researchCategories?.length && input.analysisStyle !== 'AGENT') {
        return {
          style: input.analysisStyle || 'STANDARD',
          variant: input.variant || null,
          categories: input.configurationSnapshot.researchCategories.map((name, index) => ({ id: `category-${index + 1}`, name, description: name, level: 'продуктовый' })),
        };
      }
      const source = await artifactText(input, input.inputArtifactId);
      const style = input.analysisStyle || 'AGENT';
      const step = style === 'AGENT' ? 'agent-analyze' : 'analyze';
      const prompt = renderedPrompt(input, step, { requirements: source }, () => (style === 'AGENT' ? buildAgentAnalyzePrompt(source) : buildAnalyzePrompt(source)));
      const response = await complete(
        input,
        `analyze-categories:${input.stepKey || input.variant || style.toLowerCase()}`,
        prompt,
        executionFor(input),
      );
      const parsed = parseJson(response.text);
      return {
        style,
        variant: input.variant || null,
        categories: parsed.categories || [],
        dependencies: parsed.dependencies || {},
        criticalRisks: parsed.critical_risks || [],
        actualModel: response.actualModel,
        fallbackApplied: response.fallbackApplied,
      };
    },

    async researchCategory(input) {
      const source = await artifactText(input, input.inputArtifactId);
      const style = input.researchStyle || 'AGENT';
      const kind = input.kind || 'agent';
      const key = input.stepKey || `${input.variant || style}:${input.category.id}:${kind}`;
      const step = style === 'STANDARD' ? `research-${kind}` : 'agent-research';
      const variables = { name: input.category.name, description: input.category.description, level: input.category.level, requirements: source };
      const prompt = renderedPrompt(input, step, variables, () => researchPrompt(style, kind, input.category, source));
      const response = await complete(input, `research-category:${key}`, prompt, executionFor(input));
      const saved = await store(input, response.text);
      return {
        ...saved,
        categoryId: input.category.id,
        categoryName: input.category.name,
        style,
        kind,
        variant: input.variant || null,
        success: true,
        actualModel: response.actualModel,
        fallbackApplied: response.fallbackApplied,
      };
    },

    async synthesizeResearch(input) {
      const source = await artifactText(input, input.inputArtifactId);
      const reports = await Promise.all(input.resultArtifactIds.map((id) => artifactText(input, id)));
      const metadata = {
        failedCategories: input.failedCategories,
        sourceArtifactIds: input.resultArtifactIds,
        mode: input.configurationSnapshot.featureMode,
      };
      const prompt = renderedPrompt(input, 'synthesis', { requirements: source, combinedReport: reports.join('\n\n'), metadata: String(metadata) }, () => buildAgentSynthesisPrompt(source, reports.join('\n\n'), metadata));
      const response = await complete(input, `synthesize-research:${input.stepKey || input.variant || input.researchStyle || 'default'}`, prompt, executionFor(input));
      const saved = await store(input, response.text);
      return { ...saved, failedCategories: input.failedCategories, actualModel: response.actualModel, fallbackApplied: response.fallbackApplied };
    },

    async improveRequirements(input) {
      const source = await artifactText(input, input.inputArtifactId);
      const synthesis = await artifactText(input, input.synthesisArtifactId);
      const style = input.researchStyle || 'AGENT';
      const step = style === 'STANDARD' ? 'improve' : 'agent-improve';
      const prompt = renderedPrompt(input, step, { requirements: source, researchReport: synthesis }, () => (style === 'STANDARD'
        ? buildImproveRequirementsPrompt(source, [synthesis])
        : buildAgentImproveRequirementsPrompt(source, synthesis)));
      const response = await complete(input, `improve-requirements:${input.stepKey || input.variant || style.toLowerCase()}`, prompt, executionFor(input));
      const saved = await store(input, response.text);
      return { ...saved, actualModel: response.actualModel, fallbackApplied: response.fallbackApplied };
    },

    async assembleResearchResult(input) {
      const reports = await Promise.all((input.units || []).map(async (unit) => ({
        categoryId: unit.categoryId,
        categoryName: unit.categoryName,
        kind: unit.kind,
        style: unit.style,
        variant: unit.variant,
        actualModel: unit.actualModel,
        fallbackApplied: unit.fallbackApplied,
        content: unit.artifactId ? await artifactText(input, unit.artifactId) : null,
        reasonCode: unit.reasonCode || null,
      })));
      const synthesis = input.synthesisArtifactId ? await artifactText(input, input.synthesisArtifactId) : null;
      const improvedRaw = input.improvedArtifactId ? await artifactText(input, input.improvedArtifactId) : null;
      let improvementSuggestions = [];
      let proposedRequirements = null;
      let improvedRequirements = improvedRaw;
      if (improvedRaw) {
        try {
          const parsed = parseJson(improvedRaw);
          improvementSuggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
          proposedRequirements = parsed.proposedRequirements || null;
          improvedRequirements = parsed.summary || null;
        } catch { /* legacy plain-text result */ }
      }
      let baseRequirements = null;
      try {
        const inputEnvelope = parseJson(await artifactText(input, input.inputArtifactId));
        if (inputEnvelope.kind === 'REQUIREMENTS_VERSION') baseRequirements = inputEnvelope.requirements || null;
      } catch { /* standalone research can still use plain text */ }
      const comparison = input.comparison ? { ...input.comparison } : null;
      for (const side of ['baseline', 'agent']) {
        if (!comparison?.[side]) continue;
        comparison[side] = {
          synthesis: comparison[side].synthesisArtifactId ? await artifactText(input, comparison[side].synthesisArtifactId) : null,
          improvedRequirements: comparison[side].improvedArtifactId ? await artifactText(input, comparison[side].improvedArtifactId) : null,
        };
      }
      const result = {
        schemaVersion: 1,
        mode: input.configurationSnapshot.featureMode,
        analyses: input.analyses || [],
        reports,
        synthesis,
        improvedRequirements,
        improvementSuggestions,
        proposedRequirements,
        baseRequirements,
        inputRequirementsVersionId: baseRequirements ? input.inputArtifactId : null,
        failedUnits: input.failedUnits || [],
        comparison,
      };
      return store(input, JSON.stringify(result, null, 2), 'RESULT', 'application/json; charset=utf-8');
    },

    async promptTest(input) {
      const raw = await artifactText(input, input.inputArtifactId);
      let envelope;
      try { envelope = parseJson(raw); } catch { throw Object.assign(new Error('Prompt test input must be valid JSON'), { type: 'INVALID_PROMPT_TEST_INPUT' }); }
      if (typeof envelope.userPrompt !== 'string' || !envelope.userPrompt.trim()) throw Object.assign(new Error('userPrompt is required'), { type: 'INVALID_PROMPT_TEST_INPUT' });
      const response = await complete(input, 'prompt-test', envelope.userPrompt, { systemPrompt: envelope.systemPrompt || ASK_SYSTEM_PROMPT });
      const result = { schemaVersion: 1, mode: 'PROMPT_TEST', text: response.text, actualModel: response.actualModel, fallbackApplied: response.fallbackApplied };
      return store(input, JSON.stringify(result, null, 2), 'RESULT', 'application/json; charset=utf-8');
    },
  };
}
