import { createHash, randomUUID } from 'node:crypto';

import { ApiError } from '../errors/api-error.js';
import { injectTrace } from '../observability/telemetry.js';
import { logEvent } from '../middleware/safe-logging.js';
import { isSupportedCreateMode } from '../domain/job-modes.js';
import { executionSettingsSnapshot } from '../domain/model-capabilities.js';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/;

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function materialSnapshot(materials, inputArtifactId) {
  const primary = materials?.primary || {
    artifactId: inputArtifactId,
    role: 'primary',
    name: null,
    sha256: null,
    status: 'AVAILABLE',
  };
  const baselineArtifacts = Array.isArray(materials?.baseline) ? materials.baseline : materials?.baseline?.artifacts || [];
  const references = Array.isArray(materials?.references) ? materials.references : [];
  return {
    primary,
    baseline: {
      status: baselineArtifacts.length ? 'AVAILABLE' : 'NOT_PROVIDED',
      artifacts: baselineArtifacts,
    },
    references,
  };
}

function prioritizedModels(configured, selected, limit = 3) {
  if (!selected) return configured.slice(0, limit);
  if (!configured.includes(selected)) {
    throw new ApiError({ status: 400, code: 'MODEL_NOT_ALLOWED', message: `Model ${selected} is not configured for this provider` });
  }
  return [selected, ...configured.filter((model) => model !== selected)].slice(0, limit);
}

function jobDeadlineMs(config, type, promptProfile) {
  return type === 'RESEARCH'
    ? Math.min(config.jobs.researchDeadlineMs, promptProfile?.performanceBudgetMs || Infinity)
    : config.jobs.decompositionDeadlineMs;
}

export function createJobService({ config, jobRepository, operationalRepository, requirementsVersionService, jobTraceRepository, promptProfileResolver = null, babokSkillProfile = null, clock = () => new Date(), uuid = randomUUID }) {
  return {
    async create({ auth, idempotencyKey, body, requestId, requestHashOverride = null, inlineArtifact = null }) {
      if (!config.asyncEnabled || !jobRepository) {
        throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Asynchronous job processing is disabled', retryable: true });
      }
      const mode = await operationalRepository?.get({ tenantId: auth.tenantId });
      if (['DRAIN','REJECT_NEW','FAILOVER_IN_PROGRESS'].includes(mode?.mode)) throw new ApiError({ status: 503, code: `OPERATIONAL_${mode.mode}`, message: 'Service is not accepting new jobs in the current operational mode', retryable: true, details: { retryAfterSeconds: 30 } });
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey || '')) {
        throw new ApiError({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 16 to 128 safe characters' });
      }
      const featureMode = body.options?.mode || (body.type === 'DECOMPOSITION' ? 'DECOMPOSITION' : null);
      if (!isSupportedCreateMode(featureMode)) {
        throw new ApiError({ status: 400, code: 'UNSUPPORTED_JOB_MODE', message: 'Only DECOMPOSITION and requirements-linked REQUIREMENTS_INSIGHTS jobs can be created', details: { mode: featureMode } });
      }
      if (featureMode === 'DECOMPOSITION' && body.type !== 'DECOMPOSITION') {
        throw new ApiError({ status: 400, code: 'INVALID_JOB_TYPE', message: 'DECOMPOSITION mode requires DECOMPOSITION type' });
      }
      if (featureMode === 'REQUIREMENTS_INSIGHTS' && (body.type !== 'RESEARCH' || !body.parentJobId)) {
        throw new ApiError({ status: 400, code: 'INVALID_REQUIREMENTS_RESEARCH', message: 'REQUIREMENTS_INSIGHTS must be linked to an eligible requirements version' });
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
      const promptProfile = config.features?.versionedPrompts === true
        ? promptProfileResolver?.resolve({ type: body.type, mode: featureMode, requestedVersion: body.options?.promptVersion })
        : null;
      if (config.features?.versionedPrompts === true && !promptProfile) {
        throw new ApiError({ status: 503, code: 'PROMPT_POLICY_UNAVAILABLE', message: 'Versioned prompt policy is unavailable', retryable: true });
      }

      const now = clock();
      const deadlineMs = jobDeadlineMs(config, body.type, promptProfile);
      const requestHash = requestHashOverride || createHash('sha256').update(canonicalJson(body)).digest('hex');
      const jobId = uuid();
      const decompositionMode = featureMode === 'DECOMPOSITION';
      const reasoning = body.options?.reasoning
        ?? (decompositionMode && config.llm.decompositionThinking === 'enabled' ? 'enabled' : 'disabled');
      const materials = materialSnapshot(body.materials, body.inputArtifactId);
      const persist = inlineArtifact ? jobRepository.createAcceptedWithInlineArtifact.bind(jobRepository) : jobRepository.createAccepted.bind(jobRepository);
      const result = await persist({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        idempotencyKey,
        requestHash,
        idempotencyExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        ...(inlineArtifact ? { inlineArtifact } : {}),
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
            featureMode,
            ...(promptProfile ? { promptProfile } : {}),
            temperature: body.options?.temperature ?? 0.2,
            criticEnabled: body.options?.criticEnabled !== false,
            executionSettings: executionSettingsSnapshot({ model: selectedModels[0], reasoning, temperature: body.options?.temperature ?? 0.2 }),
            maxModelsPerStep: config.llm.maxModelsPerStep,
            maxAttemptsPerModel: config.llm.maxAttemptsPerModel,
            requestTimeoutMs: config.llm.requestTimeoutMs,
            retryInitialDelayMs: config.llm.retryInitialDelayMs,
            retryMaxDelayMs: config.llm.retryMaxDelayMs,
            outputTokens: decompositionMode
              ? (config.llm.decompositionOutputTokens || config.llm.outputTokens)
              : config.llm.outputTokens,
            maxConcurrency: config.llm.maxConcurrency,
            chunkTargetTokens: config.llm.chunkTargetTokens,
            chunkConcurrency: config.llm.chunkConcurrency,
            materials,
            reasoning,
            ...(decompositionMode && config.llm.decompositionThinking ? { thinking: config.llm.decompositionThinking } : {}),
            ...((decompositionMode || ['2.5.0', '2.6.0', '2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0', '2.13.0', '2.14.0', '2.15.0'].includes(promptProfile?.version)) && babokSkillProfile ? { babokSkillProfile } : {}),
            ...(Array.isArray(body.babokIdentifierSet) ? { babokIdentifierSet: [...new Set(body.babokIdentifierSet)] } : {}),
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
          metadata: {
            type: body.type,
            parentJobId: body.parentJobId || null,
            inputArtifactId: body.inputArtifactId,
            materials: {
              primary: { artifactId: materials.primary.artifactId, sha256: materials.primary.sha256 },
              baselineArtifactIds: materials.baseline.artifacts.map((item) => item.artifactId),
              referenceArtifactIds: materials.references.map((item) => item.artifactId),
            },
            ...(babokSkillProfile && (featureMode === 'DECOMPOSITION' || ['2.5.0', '2.6.0', '2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0', '2.13.0', '2.14.0', '2.15.0'].includes(promptProfile?.version)) ? { babokSkillProfile } : {}),
            ...(promptProfile ? { promptProfile: { id: promptProfile.id, version: promptProfile.version, manifestHash: promptProfile.manifestHash, outputSchemaVersion: promptProfile.outputSchemaVersion } } : {}),
          },
        },
      });
      if (!result.replayed && jobTraceRepository) {
        const append = (entry) => jobTraceRepository.append({ tenantId: auth.tenantId, jobId: result.job.id, ...entry }).catch((error) => {
          logEvent('warn', 'job.trace.append.failed', { jobId: result.job.id, category: entry.category, errorType: error?.name || 'Error' });
        });
        await append({ category: 'LIFECYCLE', name: 'Task created', status: 'COMPLETED', startedAt: now, completedAt: now, durationMs: 0, metadata: { type: body.type, mode: body.options?.mode || null, requestId, ...(promptProfile ? { promptProfile: { id: promptProfile.id, version: promptProfile.version, manifestHash: promptProfile.manifestHash, outputSchemaVersion: promptProfile.outputSchemaVersion } } : {}) } });
        await append({ category: 'INSTRUCTIONS', name: 'Adapted Skill instructions', status: 'INFO', startedAt: now, completedAt: now, durationMs: 0, metadata: { skillUsage: babokSkillProfile && (featureMode === 'DECOMPOSITION' || ['2.5.0', '2.6.0', '2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0', '2.13.0', '2.14.0', '2.15.0'].includes(promptProfile?.version)) ? 'BUNDLE_SNAPSHOTTED' : 'NOT_APPLICABLE', ...(babokSkillProfile && (featureMode === 'DECOMPOSITION' || ['2.5.0', '2.6.0', '2.7.0', '2.8.0', '2.9.0', '2.10.0', '2.11.0', '2.12.0', '2.13.0', '2.14.0', '2.15.0'].includes(promptProfile?.version)) ? { skillProfile: { id: babokSkillProfile.id, version: babokSkillProfile.version, manifestHash: babokSkillProfile.manifestHash } } : {}) } });
      }
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
      if (!result.replayed && jobTraceRepository) await jobTraceRepository.append({ tenantId: auth.tenantId, jobId, category: 'LIFECYCLE', name: 'Cancellation requested', status: 'INFO', startedAt: clock(), completedAt: clock(), durationMs: 0, metadata: { requestId } }).catch((error) => logEvent('warn', 'job.trace.append.failed', { jobId, category: 'LIFECYCLE', errorType: error?.name || 'Error' }));
      return result;
    },

    async retry({ auth, jobId, idempotencyKey, requestId }) {
      if (!config.asyncEnabled || !jobRepository) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Asynchronous job processing is disabled', retryable: true });
      if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey || '')) throw new ApiError({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 16 to 128 safe characters' });
      const original = await jobRepository.findVisibleById({ tenantId: auth.tenantId, ownerUserId: null, jobId });
      if (!original) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      if (!['FAILED', 'CANCELLED'].includes(original.status)) throw new ApiError({ status: 409, code: 'JOB_STATE_CONFLICT', message: 'Only failed or cancelled jobs can be retried' });
      if (!isSupportedCreateMode(original.configuration_snapshot?.featureMode)) {
        throw new ApiError({ status: 409, code: 'JOB_MODE_RETIRED', message: 'Retired job modes cannot be retried' });
      }
      const now = clock();
      const newJobId = uuid();
      const retryBody = { retryOf: jobId, type: original.type, inputArtifactId: original.input_artifact_id };
      const result = await jobRepository.createAccepted({
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
          deadlineAt: new Date(now.getTime() + jobDeadlineMs(config, original.type, original.configuration_snapshot?.promptProfile)),
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
      if (!result.replayed && jobTraceRepository) await jobTraceRepository.append({ tenantId: auth.tenantId, jobId: result.job.id, category: 'RETRY', name: 'Task retry created', status: 'INFO', startedAt: now, completedAt: now, durationMs: 0, metadata: { retryOf: jobId, requestId } }).catch((error) => logEvent('warn', 'job.trace.append.failed', { jobId: result.job.id, category: 'RETRY', errorType: error?.name || 'Error' }));
      return result;
    },
  };
}
