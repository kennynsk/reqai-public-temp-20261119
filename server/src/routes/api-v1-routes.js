import express from 'express';

import { requireAnyRole } from '../auth/authorization.js';
import { createAuthenticationMiddleware, rejectClientTenantMiddleware } from '../middleware/authentication.js';
import { apiErrorHandler, apiNotFound } from '../middleware/api-error-handler.js';
import { ApiError, badRequest } from '../errors/api-error.js';
import { streamJobEvents } from '../services/sse-service.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECOMPOSITION_MODES = new Set(['DECOMPOSITION', 'DECOMPOSITION_WITH_INSIGHTS']);
const RESEARCH_MODES = new Set(['REQUIREMENTS_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST']);
const RESEARCH_KINDS = new Set(['trends', 'competitors', 'practices']);

function validateVariant(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('VALIDATION_ERROR', `${field} must be an object`, { field });
  const unsupported = Object.keys(value).filter((key) => !['model', 'temperature'].includes(key));
  if (unsupported.length) throw badRequest('VALIDATION_ERROR', `${field} contains unsupported fields`, { field, fields: unsupported });
  if (typeof value.model !== 'string' || !value.model.trim()) throw badRequest('VALIDATION_ERROR', `${field}.model is required`, { field: `${field}.model` });
  if (value.temperature != null && (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) {
    throw badRequest('VALIDATION_ERROR', `${field}.temperature must be from 0 to 2`, { field: `${field}.temperature` });
  }
}

function validateJobOptions(type, options = {}) {
  const allowed = new Set(['mode', 'model', 'temperature', 'researchCategories', 'researchKinds', 'allCategories', 'variantA', 'variantB', 'compareTarget', 'researchKind', 'inputFormat', 'promptVersion']);
  const unsupported = Object.keys(options).filter((key) => !allowed.has(key));
  if (unsupported.length) throw badRequest('VALIDATION_ERROR', 'options contains unsupported fields', { fields: unsupported });
  const mode = options.mode || (type === 'DECOMPOSITION' ? 'DECOMPOSITION' : 'AGENT_RESEARCH');
  const allowedModes = type === 'DECOMPOSITION' ? DECOMPOSITION_MODES : RESEARCH_MODES;
  if (!allowedModes.has(mode)) throw badRequest('VALIDATION_ERROR', `Unsupported mode ${mode} for ${type}`, { field: 'options.mode' });
  if (options.model != null && (typeof options.model !== 'string' || !options.model.trim())) throw badRequest('VALIDATION_ERROR', 'options.model must be a non-empty string', { field: 'options.model' });
  if (options.temperature != null && (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)) throw badRequest('VALIDATION_ERROR', 'options.temperature must be from 0 to 2', { field: 'options.temperature' });
  if (options.researchKinds != null && (!Array.isArray(options.researchKinds) || !options.researchKinds.length || options.researchKinds.some((kind) => !RESEARCH_KINDS.has(kind)))) {
    throw badRequest('VALIDATION_ERROR', 'options.researchKinds contains an unsupported research kind', { field: 'options.researchKinds' });
  }
  if (options.compareTarget != null && !['CATEGORIES', 'RESEARCH'].includes(options.compareTarget)) throw badRequest('VALIDATION_ERROR', 'options.compareTarget must be CATEGORIES or RESEARCH', { field: 'options.compareTarget' });
  if (options.researchKind != null && !RESEARCH_KINDS.has(options.researchKind)) throw badRequest('VALIDATION_ERROR', 'options.researchKind is unsupported', { field: 'options.researchKind' });
  if (options.inputFormat != null && !['TEXT', 'PROMPT_JSON'].includes(options.inputFormat)) throw badRequest('VALIDATION_ERROR', 'options.inputFormat is unsupported', { field: 'options.inputFormat' });
  if (options.promptVersion != null && !/^[1-9]\d*\.\d+\.\d+$/.test(options.promptVersion)) throw badRequest('VALIDATION_ERROR', 'options.promptVersion must use semantic versioning', { field: 'options.promptVersion' });
  if (mode === 'MODEL_COMPARE') {
    validateVariant(options.variantA, 'options.variantA');
    validateVariant(options.variantB, 'options.variantB');
  }
  if (mode === 'PROMPT_TEST' && options.inputFormat !== 'PROMPT_JSON') throw badRequest('VALIDATION_ERROR', 'PROMPT_TEST requires inputFormat PROMPT_JSON', { field: 'options.inputFormat' });
  return { ...options, mode };
}

function validateCreateJob(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('VALIDATION_ERROR', 'JSON object body is required');
  const allowed = new Set(['type', 'inputArtifactId', 'parentJobId', 'options']);
  const unsupported = Object.keys(body).filter((key) => !allowed.has(key));
  if (unsupported.length) throw badRequest('VALIDATION_ERROR', 'Request contains unsupported fields', { fields: unsupported });
  if (!['DECOMPOSITION', 'RESEARCH'].includes(body.type)) throw badRequest('VALIDATION_ERROR', 'type must be DECOMPOSITION or RESEARCH', { field: 'type' });
  if (!UUID_PATTERN.test(body.inputArtifactId || '')) throw badRequest('VALIDATION_ERROR', 'inputArtifactId must be a UUID', { field: 'inputArtifactId' });
  if (body.parentJobId != null && !UUID_PATTERN.test(body.parentJobId)) throw badRequest('VALIDATION_ERROR', 'parentJobId must be a UUID', { field: 'parentJobId' });
  if (body.options != null && (typeof body.options !== 'object' || Array.isArray(body.options))) {
    throw badRequest('VALIDATION_ERROR', 'options must be an object', { field: 'options' });
  }
  return { ...body, options: validateJobOptions(body.type, body.options || {}) };
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function requireUuid(value, field = 'jobId') {
  if (!UUID_PATTERN.test(value || '')) throw badRequest('VALIDATION_ERROR', `${field} must be a UUID`, { field });
  return value;
}

function acceptedResponse(res, result) {
  const jobId = result.job.id;
  const statusUrl = `/api/v1/jobs/${jobId}`;
  res.set('Location', statusUrl);
  res.set('Retry-After', '2');
  return res.status(202).json({
    jobId,
    status: result.job.status,
    statusUrl,
    eventsUrl: `${statusUrl}/events`,
    resultUrl: `${statusUrl}/result`,
    cancelUrl: `${statusUrl}/cancel`,
    idempotencyReplayed: result.replayed,
  });
}

function jobResponse(row) {
  return {
    jobId: row.id,
    parentJobId: row.parent_job_id ?? null,
    inputArtifactId: row.input_artifact_id,
    type: row.type,
    mode: row.configuration_snapshot?.featureMode ?? null,
    status: row.status,
    outcome: row.outcome ?? null,
    progress: Number(row.progress ?? 0),
    currentStep: row.current_step ?? null,
    message: row.message ?? null,
    resultArtifactId: row.result_artifact_id ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function artifactResponse(row) {
  return { artifactId: row.id, size: Number(row.size_bytes), sha256: row.sha256, contentType: row.content_type, createdAt: new Date(row.created_at).toISOString() };
}

function ownerScope(auth) {
  return auth.roles.some((role) => ['tenant-admin', 'operator', 'auditor', 'system-admin'].includes(role)) ? null : auth.userId;
}

export function createApiV1Router({ config, services = {} }) {
  const router = express.Router();
  const jsonParser = express.json({ limit: '1mb' });

  router.use('/api/v1', createAuthenticationMiddleware(config));
  router.use('/api/v1', (req, res, next) => {
    if (req.method === 'POST' && req.originalUrl?.split('?')[0] === '/api/v1/artifacts') return next();
    return jsonParser(req, res, next);
  });
  router.use('/api/v1', rejectClientTenantMiddleware);

  router.get('/api/v1', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), (req, res) => {
    res.json({
      name: 'ReqAI Enterprise API',
      version: 'v1',
      requestId: req.context?.requestId,
      userId: req.auth.userId,
      tenantId: req.auth.tenantId,
      capabilities: {
        models: config.llm.availableModels || config.llm.models,
        decompositionModes: [...DECOMPOSITION_MODES],
        researchModes: [...RESEARCH_MODES],
        researchKinds: [...RESEARCH_KINDS],
        domainOperations: config.features?.requirementsIntegrationApi ? ['decomposition', 'standalone-research', 'requirements-research'] : [],
        promptReleases: config.features?.versionedPrompts ? Object.fromEntries(Object.entries(config.prompts.policy).map(([id, release]) => [id, { active: release.active, selectable: release.released }])) : {},
      },
    });
  });

  if (config.features?.requirementsIntegrationApi) {
    router.post('/api/v1/decompositions', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
      if (!services.requirementsIntegrationService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Requirements integration API is unavailable', retryable: true });
      acceptedResponse(res, await services.requirementsIntegrationService.startDecomposition({
        auth: req.auth,
        idempotencyKey: req.get('Idempotency-Key'),
        requestId: req.context?.requestId,
        command: req.body,
      }));
    }));

    router.post('/api/v1/research', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
      if (!services.requirementsIntegrationService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Requirements integration API is unavailable', retryable: true });
      acceptedResponse(res, await services.requirementsIntegrationService.startStandaloneResearch({
        auth: req.auth,
        idempotencyKey: req.get('Idempotency-Key'),
        requestId: req.context?.requestId,
        command: req.body,
      }));
    }));

    router.post('/api/v1/requirements/versions/:versionId/research', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
      if (!services.requirementsIntegrationService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Requirements integration API is unavailable', retryable: true });
      acceptedResponse(res, await services.requirementsIntegrationService.startRequirementsResearch({
        auth: req.auth,
        idempotencyKey: req.get('Idempotency-Key'),
        requestId: req.context?.requestId,
        versionId: requireUuid(req.params.versionId, 'versionId'),
        command: req.body,
      }));
    }));
  }

  router.post('/api/v1/jobs', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
    const result = await services.jobService.create({
      auth: req.auth,
      idempotencyKey: req.get('Idempotency-Key'),
      body: validateCreateJob(req.body),
      requestId: req.context?.requestId,
    });
    acceptedResponse(res, result);
  }));

  router.get('/api/v1/jobs', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    res.json(await services.jobQueryService.list({
      auth: req.auth,
      cursor: req.query.cursor,
      limit: req.query.limit || 20,
      status: req.query.status,
    }));
  }));

  router.get('/api/v1/jobs/:jobId', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    res.json(await services.jobQueryService.get({
      auth: req.auth,
      jobId: requireUuid(req.params.jobId),
      requestId: req.context?.requestId,
    }));
  }));

  router.get('/api/v1/jobs/:jobId/result', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    res.json(await services.jobQueryService.result({
      auth: req.auth,
      jobId: requireUuid(req.params.jobId),
      requestId: req.context?.requestId,
    }));
  }));

  router.get('/api/v1/jobs/:jobId/trace', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    if (!services.jobTraceService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Task diagnostics are disabled', retryable: true });
    res.json(await services.jobTraceService.trace({
      auth: req.auth,
      jobId: requireUuid(req.params.jobId),
      cursor: req.query.cursor,
      limit: req.query.limit || 50,
      requestId: req.context?.requestId,
    }));
  }));

  router.get('/api/v1/jobs/:jobId/trace/:entryId', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    if (!services.jobTraceService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Task diagnostics are disabled', retryable: true });
    res.json(await services.jobTraceService.detail({
      auth: req.auth,
      jobId: requireUuid(req.params.jobId),
      entryId: requireUuid(req.params.entryId, 'entryId'),
      requestId: req.context?.requestId,
    }));
  }));

  router.post('/api/v1/jobs/:jobId/cancel', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
    const jobId = requireUuid(req.params.jobId);
    const result = await services.jobService.cancel({ auth: req.auth, jobId, requestId: req.context?.requestId });
    res.status(202).json(jobResponse(result.job));
  }));

  router.post('/api/v1/jobs/:jobId/retry', requireAnyRole('tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
    const result = await services.jobService.retry({
      auth: req.auth,
      jobId: requireUuid(req.params.jobId),
      idempotencyKey: req.get('Idempotency-Key'),
      requestId: req.context?.requestId,
    });
    acceptedResponse(res, result);
  }));

  router.post('/api/v1/artifacts', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
    if (!services.artifactRepository) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Artifact storage is disabled', retryable: true });
    const checksum = String(req.get('X-Content-SHA256') || '');
    if (!/^[a-f0-9]{64}$/i.test(checksum)) throw badRequest('VALIDATION_ERROR', 'X-Content-SHA256 must be a SHA-256 hex digest');
    const row = await services.artifactRepository.upload({
      tenantId: req.auth.tenantId, ownerUserId: req.auth.userId, readable: req,
      expectedSha256: checksum, contentType: req.get('Content-Type') || 'application/octet-stream',
      maxBytes: config.jobs.inputMaxBytes,
      expiresAt: new Date(Date.now() + config.retention.finalResultsDays * 86400000),
    });
    res.status(201).json(artifactResponse(row));
  }));

  router.post('/api/v1/requirements/versions', requireAnyRole('user', 'tenant-admin', 'system-admin'), asyncRoute(async (req, res) => {
    if (!services.requirementsVersionService) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Requirements version storage is disabled', retryable: true });
    const body = req.body || {};
    requireUuid(body.sourceJobId, 'sourceJobId');
    if (body.baseVersionId != null) requireUuid(body.baseVersionId, 'baseVersionId');
    const value = await services.requirementsVersionService.create({ auth: req.auth, body, requestId: req.context?.requestId });
    res.status(201).json(value);
  }));

  router.get('/api/v1/requirements/versions/:versionId', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    res.json(await services.requirementsVersionService.get({ auth: req.auth, versionId: requireUuid(req.params.versionId, 'versionId') }));
  }));

  router.get('/api/v1/jobs/:jobId/requirements/versions', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    res.json(await services.requirementsVersionService.list({ auth: req.auth, jobId: requireUuid(req.params.jobId) }));
  }));

  router.get('/api/v1/artifacts/:artifactId', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    const artifactId = requireUuid(req.params.artifactId, 'artifactId');
    const row = await services.artifactRepository?.metadata({ tenantId: req.auth.tenantId, ownerUserId: ownerScope(req.auth), artifactId });
    if (!row) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: 'Artifact not found' });
    res.set('Content-Type', row.content_type); res.set('Content-Length', String(row.size_bytes)); res.set('ETag', `"sha256-${row.sha256}"`);
    await services.artifactRepository.streamTo({ tenantId: req.auth.tenantId, artifactId, writable: res });
  }));

  router.get('/api/v1/jobs/:jobId/result/content', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    const result = await services.jobQueryService.result({ auth: req.auth, jobId: requireUuid(req.params.jobId), requestId: req.context?.requestId });
    if (!result.resultArtifactId) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: 'Result has no content artifact' });
    const row = await services.artifactRepository.metadata({ tenantId: req.auth.tenantId, ownerUserId: ownerScope(req.auth), artifactId: result.resultArtifactId });
    if (!row) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: 'Result artifact not found' });
    res.set('Content-Type', row.content_type); res.set('Content-Length', String(row.size_bytes));
    await services.artifactRepository.streamTo({ tenantId: req.auth.tenantId, artifactId: row.id, writable: res });
  }));

  router.get('/api/v1/jobs/:jobId/events', requireAnyRole('user', 'tenant-admin', 'operator', 'auditor', 'system-admin'), asyncRoute(async (req, res) => {
    const jobId = requireUuid(req.params.jobId); await services.jobQueryService.get({ auth: req.auth, jobId, requestId: req.context?.requestId });
    const last = req.get('Last-Event-ID') || '0'; if (!/^\d+$/.test(last)) throw badRequest('INVALID_LAST_EVENT_ID', 'Last-Event-ID must be a numeric sequence');
    streamJobEvents({ repository: services.eventRepository, tenantId: req.auth.tenantId, jobId, afterSequence: Number(last), response: res, heartbeatMs: config.sse.heartbeatMs, pollMs: config.sse.pollMs, sourceSite: config.process.siteId });
  }));

  router.post('/api/v1/admin/webhooks/:deliveryId/redeliver', requireAnyRole('system-admin'), asyncRoute(async (req, res) => {
    const deliveryId = requireUuid(req.params.deliveryId, 'deliveryId');
    await services.auditRepository.record({ tenantId: req.auth.tenantId, actorId: req.auth.userId, actorRoles: req.auth.roles, action: 'webhook.redeliver', targetType: 'webhook-delivery', targetId: deliveryId, requestId: req.context?.requestId, sourceSite: config.process.siteId });
    const result = await services.webhookRepository.redeliver({ tenantId: req.auth.tenantId, id: deliveryId }); if (!result.rowCount) throw new ApiError({ status: 404, code: 'WEBHOOK_DELIVERY_NOT_FOUND', message: 'DLQ delivery not found' }); res.status(202).json({ deliveryId, status: 'PENDING' });
  }));

  router.post('/api/v1/admin/workflows/:jobId/reset', requireAnyRole('system-admin'), asyncRoute(async (req, res) => {
    const jobId = requireUuid(req.params.jobId); const { runId, workflowTaskFinishEventId, reason } = req.body || {};
    if (!runId || !Number.isInteger(workflowTaskFinishEventId) || !reason) throw badRequest('VALIDATION_ERROR', 'runId, workflowTaskFinishEventId and reason are required');
    await services.auditRepository.record({ tenantId: req.auth.tenantId, actorId: req.auth.userId, actorRoles: req.auth.roles, action: 'workflow.reset', targetType: 'job', targetId: jobId, requestId: req.context?.requestId, sourceSite: config.process.siteId, metadata: { runId } });
    res.status(202).json(await services.workflowEngine.reset({ executionId: jobId, runId, workflowTaskFinishEventId, reason }));
  }));

  router.get('/api/v1/admin/operations/mode', requireAnyRole('operator','system-admin'), asyncRoute(async(req,res)=>res.json(await services.operationalRepository.get({tenantId:req.auth.tenantId}))));
  router.put('/api/v1/admin/operations/mode', requireAnyRole('operator','system-admin'), asyncRoute(async(req,res)=>{const {mode,reason,expectedVersion}=req.body||{};await services.auditRepository.record({tenantId:req.auth.tenantId,actorId:req.auth.userId,actorRoles:req.auth.roles,action:'maintenance.mode.change',targetType:'operational-state',targetId:'global',requestId:req.context?.requestId,sourceSite:config.process.siteId,metadata:{mode,reason}});const value=await services.operationalRepository.set({tenantId:req.auth.tenantId,mode,reason,actorId:req.auth.userId,expectedVersion});if(!value)throw new ApiError({status:409,code:'OPERATIONAL_VERSION_CONFLICT',message:'Operational mode changed concurrently'});res.json(value);}));

  router.use('/api/v1', apiNotFound);
  router.use(apiErrorHandler);
  return router;
}
