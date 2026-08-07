import { createHash, randomUUID } from 'node:crypto';

import { ApiError } from '../errors/api-error.js';
import { injectTrace } from '../observability/telemetry.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function prioritizedModels(configured, selected, limit = 3) {
  if (!selected) return configured.slice(0, limit);
  if (!configured.includes(selected)) {
    throw new ApiError({ status: 400, code: 'MODEL_NOT_ALLOWED', message: `Model ${selected} is not configured for this provider` });
  }
  return [selected, ...configured.filter((model) => model !== selected)].slice(0, limit);
}

function validateComparison(config, comparison) {
  const availableModels = config.llm.availableModels || config.llm.models;
  if (!comparison) return null;
  return Object.fromEntries(['variantA', 'variantB'].map((key) => {
    const variant = comparison[key];
    return [key, {
      model: variant.model,
      models: prioritizedModels(availableModels, variant.model, config.llm.maxModelsPerStep),
      temperature: variant.temperature ?? 0.2,
    }];
  }));
}

export function createJobService({ config, jobRepository, operationalRepository, requirementsVersionService, clock = () => new Date(), uuid = randomUUID }) {
  return {
    async create({ auth, idempotencyKey, body, requestId }) {
      if (!config.asyncEnabled || !jobRepository) {
        throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Asynchronous job processing is disabled', retryable: true });
      }
      const mode = await operationalRepository?.get({ tenantId: auth.tenantId });
      if (['DRAIN','REJECT_NEW','FAILOVER_IN_PROGRESS'].includes(mode?.mode)) throw new ApiError({ status: 503, code: `OPERATIONAL_${mode.mode}`, message: 'Service is not accepting new jobs in the current operational mode', retryable: true, details: { retryAfterSeconds: 30 } });
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey || '')) {
        throw new ApiError({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 16 to 128 safe characters' });
      }
      const categories = body.options?.researchCategories;
      if (categories != null && (!Array.isArray(categories) || categories.length > config.jobs.maxResearchCategories)) {
        throw new ApiError({
          status: 400,
          code: 'RESEARCH_CATEGORY_LIMIT',
          message: `researchCategories must be an array with at most ${config.jobs.maxResearchCategories} items`,
        });
      }
      if (categories?.some((category) => typeof category !== 'string' || !category.trim())) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'researchCategories must contain non-empty strings' });
      }
      if (body.parentJobId && body.type !== 'RESEARCH') {
        throw new ApiError({ status: 400, code: 'INVALID_PARENT_JOB', message: 'parentJobId is supported only for research jobs' });
      }
      if (body.parentJobId) {
        if (!requirementsVersionService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Requirements version storage is disabled', retryable: true });
        if (body.options?.mode !== 'REQUIREMENTS_INSIGHTS') {
          throw new ApiError({ status: 400, code: 'INVALID_LINKED_RESEARCH_MODE', message: 'Research created from decomposition must use REQUIREMENTS_INSIGHTS mode' });
        }
        await requirementsVersionService.validateResearchInput({ auth, parentJobId: body.parentJobId, versionId: body.inputArtifactId });
      }

      const availableModels = config.llm.availableModels || config.llm.models;
      const selectedModels = prioritizedModels(availableModels, body.options?.model, config.llm.maxModelsPerStep);
      const comparison = body.options?.mode === 'MODEL_COMPARE'
        ? validateComparison(config, { variantA: body.options.variantA, variantB: body.options.variantB })
        : null;

      const now = clock();
      const deadlineMs = body.type === 'RESEARCH' ? config.jobs.researchDeadlineMs : config.jobs.decompositionDeadlineMs;
      const requestHash = createHash('sha256').update(canonicalJson(body)).digest('hex');
      const jobId = uuid();
      const result = await jobRepository.createAccepted({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        idempotencyKey,
        requestHash,
        idempotencyExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        job: {
          id: jobId,
          type: body.type,
          parentJobId: body.parentJobId || null,
          inputArtifactId: body.inputArtifactId,
          priority: body.type === 'DECOMPOSITION' ? config.jobs.decompositionPriority : config.jobs.researchPriority,
          createdSite: config.process.siteId,
          deadlineAt: new Date(now.getTime() + deadlineMs),
          configurationSnapshot: {
            models: selectedModels,
            configuredModels: availableModels,
            featureMode: body.options?.mode || (body.type === 'DECOMPOSITION' ? 'DECOMPOSITION' : 'AGENT_RESEARCH'),
            temperature: body.options?.temperature ?? 0.2,
            comparison,
            compareTarget: body.options?.compareTarget || 'CATEGORIES',
            researchKind: body.options?.researchKind || 'trends',
            researchKinds: body.options?.researchKinds || ['trends', 'competitors', 'practices'],
            allCategories: body.options?.allCategories !== false,
            inputFormat: body.options?.inputFormat || 'TEXT',
            maxModelsPerStep: config.llm.maxModelsPerStep,
            maxAttemptsPerModel: config.llm.maxAttemptsPerModel,
            requestTimeoutMs: config.llm.requestTimeoutMs,
            retryInitialDelayMs: config.llm.retryInitialDelayMs,
            retryMaxDelayMs: config.llm.retryMaxDelayMs,
            maxConcurrency: config.llm.maxConcurrency,
            chunkTargetTokens: config.llm.chunkTargetTokens,
            chunkOverlapTokens: config.llm.chunkOverlapTokens,
            chunkConcurrency: config.llm.chunkConcurrency,
            categoryConcurrency: config.llm.categoryConcurrency,
            maxResearchCategories: config.jobs.maxResearchCategories,
            researchCategories: categories?.map((category) => category.trim()) || null,
            taskQueues: config.temporal?.taskQueues || { decomposition: 'requirements-decomposition', research: 'requirements-research', synthesis: 'requirements-synthesis' },
          },
        },
        admission: {
          maxPerMinute: config.jobs.maxPerMinute,
          maxActivePerUser: config.jobs.maxActivePerUser,
          softBacklog: config.jobs.softBacklog,
          hardBacklog: config.jobs.hardBacklog,
        },
        event: {
          id: uuid(),
          type: 'job.accepted',
          payload: { jobId, parentJobId: body.parentJobId || null, inputArtifactId: body.inputArtifactId, tenantId: auth.tenantId, status: 'ACCEPTED', createdSite: config.process.siteId, occurredAt: now.toISOString(), traceContext: injectTrace({}) },
        },
        audit: {
          id: uuid(),
          action: 'job.create',
          actorRoles: auth.roles,
          requestId,
          metadata: { type: body.type, parentJobId: body.parentJobId || null, inputArtifactId: body.inputArtifactId },
        },
      });
      return result;
    },

    async cancel({ auth, jobId, requestId }) {
      if (!config.asyncEnabled || !jobRepository) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Asynchronous job processing is disabled', retryable: true });
      const privileged = auth.roles.some((role) => ['tenant-admin', 'system-admin'].includes(role));
      const result = await jobRepository.requestCancellation({
        tenantId: auth.tenantId,
        ownerUserId: privileged ? null : auth.userId,
        jobId,
        event: { id: uuid(), payload: { jobId, tenantId: auth.tenantId, status: 'CANCEL_REQUESTED', occurredAt: clock().toISOString() } },
        audit: { id: uuid(), actorId: auth.userId, actorRoles: auth.roles, requestId, sourceSite: config.process.siteId },
      });
      return result;
    },

    async retry({ auth, jobId, idempotencyKey, requestId }) {
      if (!config.asyncEnabled || !jobRepository) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Asynchronous job processing is disabled', retryable: true });
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey || '')) throw new ApiError({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 16 to 128 safe characters' });
      const original = await jobRepository.findVisibleById({ tenantId: auth.tenantId, ownerUserId: null, jobId });
      if (!original) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      if (!['FAILED', 'CANCELLED'].includes(original.status)) throw new ApiError({ status: 409, code: 'JOB_STATE_CONFLICT', message: 'Only failed or cancelled jobs can be retried' });
      const now = clock();
      const newJobId = uuid();
      const retryBody = { retryOf: jobId, type: original.type, inputArtifactId: original.input_artifact_id };
      return jobRepository.createAccepted({
        tenantId: auth.tenantId,
        ownerUserId: original.owner_user_id,
        idempotencyKey,
        requestHash: createHash('sha256').update(canonicalJson(retryBody)).digest('hex'),
        idempotencyExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        job: {
          id: newJobId,
          type: original.type,
          parentJobId: original.id,
          inputArtifactId: original.input_artifact_id,
          priority: original.priority,
          configurationSnapshot: original.configuration_snapshot,
          createdSite: config.process.siteId,
          deadlineAt: new Date(now.getTime() + (original.type === 'RESEARCH' ? config.jobs.researchDeadlineMs : config.jobs.decompositionDeadlineMs)),
        },
        admission: {
          maxPerMinute: config.jobs.maxPerMinute,
          maxActivePerUser: config.jobs.maxActivePerUser,
          softBacklog: config.jobs.softBacklog,
          hardBacklog: config.jobs.hardBacklog,
        },
        event: { id: uuid(), type: 'job.accepted', payload: { jobId: newJobId, retryOf: jobId, tenantId: auth.tenantId, status: 'ACCEPTED', occurredAt: now.toISOString() } },
        audit: { id: uuid(), action: 'job.retry', actorRoles: auth.roles, requestId, metadata: { retryOf: jobId } },
      });
    },
  };
}
