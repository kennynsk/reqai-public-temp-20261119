import { ApiError } from '../errors/api-error.js';

const PRIVILEGED_READ_ROLES = new Set(['tenant-admin', 'operator', 'auditor', 'system-admin']);
const JOB_STATUSES = new Set(['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED']);

function ownerScope(auth) {
  return auth.roles.some((role) => PRIVILEGED_READ_ROLES.has(role)) ? null : auth.userId;
}

function mapJob(row) {
  return {
    jobId: row.id,
    parentJobId: row.parent_job_id ?? null,
    inputArtifactId: row.input_artifact_id,
    type: row.type,
    mode: row.configuration_snapshot?.featureMode ?? null,
    status: row.status,
    outcome: row.outcome ?? null,
    reasonCode: row.reason_code ?? null,
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

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ createdAt: new Date(row.created_at).toISOString(), id: row.id }), 'utf8').toString('base64url');
}

function decodeCursor(cursor) {
  if (!cursor) return {};
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!value.createdAt || !value.id || Number.isNaN(Date.parse(value.createdAt))) throw new Error('invalid');
    return { beforeCreatedAt: value.createdAt, beforeId: value.id };
  } catch {
    throw new ApiError({ status: 400, code: 'INVALID_CURSOR', message: 'cursor is invalid' });
  }
}

export function createJobQueryService({ jobRepository, auditRepository, config }) {
  function requireRepository() {
    if (!jobRepository) throw new ApiError({ status: 503, code: 'ASYNC_PLATFORM_DISABLED', message: 'Asynchronous job processing is disabled', retryable: true });
  }
  async function auditView(auth, action, jobId, requestId) {
    await auditRepository?.record({
      tenantId: auth.tenantId,
      actorId: auth.userId,
      actorRoles: auth.roles,
      action,
      targetType: 'job',
      targetId: jobId,
      requestId,
      sourceSite: config.process.siteId,
    });
  }

  return {
    async list({ auth, cursor, limit = 20, status }) {
      requireRepository();
      if (status && !JOB_STATUSES.has(status)) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'status is invalid' });
      const parsedLimit = Number(limit);
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'limit must be an integer from 1 to 100' });
      }
      const rows = await jobRepository.listVisible({
        tenantId: auth.tenantId,
        ownerUserId: ownerScope(auth),
        status: status || null,
        limit: parsedLimit,
        ...decodeCursor(cursor),
      });
      const hasMore = rows.length > parsedLimit;
      const items = rows.slice(0, parsedLimit);
      return { items: items.map(mapJob), nextCursor: hasMore ? encodeCursor(items.at(-1)) : null };
    },

    async get({ auth, jobId, requestId }) {
      requireRepository();
      const row = await jobRepository.findVisibleById({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), jobId });
      if (!row) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      await auditView(auth, 'job.view', jobId, requestId);
      return mapJob(row);
    },

    async result({ auth, jobId, requestId }) {
      requireRepository();
      const value = await jobRepository.getResult({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), jobId });
      if (!value) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      if (value.job.status !== 'SUCCEEDED') {
        throw new ApiError({ status: 409, code: 'RESULT_NOT_READY', message: 'Job result is not available yet', retryable: !['FAILED', 'CANCELLED'].includes(value.job.status) });
      }
      await auditView(auth, 'job.result.view', jobId, requestId);
      const failedSteps = value.steps.filter((step) => step.status === 'FAILED').map((step) => ({ stepId: step.step_id, stepType: step.step_type, summary: step.summary }));
      return {
        jobId,
        parentJobId: value.job.parent_job_id ?? null,
        inputArtifactId: value.job.input_artifact_id,
        type: value.job.type,
        status: value.job.status,
        outcome: value.job.outcome,
        mode: value.job.configuration_snapshot?.featureMode ?? null,
        summary: value.job.message ?? null,
        resultArtifactId: value.job.result_artifact_id ?? null,
        resultContentUrl: value.job.result_artifact_id ? `/api/v1/jobs/${jobId}/result/content` : null,
        failedSteps,
        modelAttempts: value.attempts.map((attempt) => ({
          stepId: attempt.step_id,
          requestedModel: attempt.requested_model,
          model: attempt.actual_model,
          executionId: attempt.execution_id ?? null,
          attempt: attempt.attempt,
          result: attempt.status,
          reasonCode: attempt.reason_code ?? null,
          tokenUsage: attempt.input_tokens == null && attempt.output_tokens == null ? null : { input: Number(attempt.input_tokens || 0), output: Number(attempt.output_tokens || 0) },
          durationMs: attempt.duration_ms == null ? null : Number(attempt.duration_ms),
        })),
      };
    },
  };
}
