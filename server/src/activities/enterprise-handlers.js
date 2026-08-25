import { buildDecomposePrompt, buildInsightsPrompt } from '../../decomposer-prompts.js';
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
  function renderedPrompt(input, step, variables, fallbackBuilder) {
    const profile = input.configurationSnapshot.promptProfile;
    if (!profile) return fallbackBuilder();
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

  };
}
