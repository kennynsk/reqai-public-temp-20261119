import { ApiError } from '../errors/api-error.js';
import { redactSensitive } from '../middleware/safe-logging.js';

const PRIVILEGED_READ_ROLES = new Set(['tenant-admin', 'operator', 'auditor', 'system-admin']);
const DIAGNOSTIC_DETAIL_ROLES = new Set(['operator', 'auditor', 'system-admin']);

function ownerScope(auth) {
  return auth.roles.some((role) => PRIVILEGED_READ_ROLES.has(role)) ? null : auth.userId;
}

function iso(value) { return value ? new Date(value).toISOString() : null; }
function duration(startedAt, completedAt, explicit = null) {
  if (explicit != null) return Number(explicit);
  if (!startedAt || !completedAt) return null;
  return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}
function cursorIndex(cursor) {
  if (!cursor) return 0;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Number.isInteger(value.index) || value.index < 0) throw new Error('invalid');
    return value.index;
  } catch {
    throw new ApiError({ status: 400, code: 'INVALID_CURSOR', message: 'cursor is invalid' });
  }
}
function stableSort(entries) {
  return entries.sort((a, b) => {
    const time = new Date(a.startedAt || a.completedAt || a.timestamp || 0) - new Date(b.startedAt || b.completedAt || b.timestamp || 0);
    return time || String(a.id).localeCompare(String(b.id));
  });
}

function compose(snapshot) {
  const custom = snapshot.entries.map((row) => ({
    id: row.id, source: 'TRACE', sequence: Number(row.sequence), category: row.category, name: row.name,
    status: row.status, stepId: row.step_id, startedAt: iso(row.started_at || row.created_at), completedAt: iso(row.completed_at),
    durationMs: duration(row.started_at, row.completed_at, row.duration_ms), metadata: redactSensitive(row.metadata || {}),
    detail: { state: row.detail_artifact_id ? (row.expires_at && new Date(row.expires_at) <= new Date() ? 'EXPIRED' : 'AVAILABLE') : 'NOT_RECORDED', kind: row.detail_kind || null, visibility: row.detail_visibility },
    inputArtifactId: row.input_artifact_id || null, outputArtifactId: row.output_artifact_id || null,
  }));
  const steps = snapshot.steps.map((row) => ({
    id: `step:${row.step_id}`, source: 'STEP', category: 'WORKFLOW', name: row.step_type, status: row.status,
    stepId: row.step_id, startedAt: iso(row.started_at || row.created_at), completedAt: iso(row.completed_at),
    durationMs: duration(row.started_at, row.completed_at), metadata: redactSensitive({ outcome: row.outcome, summary: row.summary, attempts: row.attempt_count }),
    detail: { state: 'NOT_RECORDED', kind: null, visibility: 'METADATA' }, inputArtifactId: null, outputArtifactId: row.result_artifact_id || null,
  }));
  const attempts = snapshot.attempts.map((row) => ({
    id: `attempt:${row.id}`, source: 'MODEL_ATTEMPT', category: row.status === 'FAILED' ? 'ERROR' : 'MODEL', name: `LLM: ${row.actual_model}`,
    status: row.status === 'SUCCEEDED' ? 'COMPLETED' : row.status, stepId: row.step_id, startedAt: iso(row.started_at), completedAt: iso(row.completed_at),
    durationMs: duration(row.started_at, row.completed_at, row.duration_ms),
    metadata: redactSensitive({ requestedModel: row.requested_model, actualModel: row.actual_model, executionId: row.execution_id, attempt: row.attempt, reasonCode: row.reason_code, providerRequestId: row.provider_request_id, executionSite: row.execution_site, tokenUsage: row.input_tokens == null && row.output_tokens == null ? null : { input: Number(row.input_tokens || 0), output: Number(row.output_tokens || 0) } }),
    detail: { state: 'NOT_RECORDED', kind: null, visibility: 'METADATA' }, inputArtifactId: null, outputArtifactId: null,
  }));
  const events = snapshot.events.map((row) => ({
    id: `event:${row.event_id}`, source: 'SERVER_EVENT', sequence: Number(row.sequence), category: 'EVENT', name: row.event_type, status: 'INFO', stepId: null,
    startedAt: iso(row.created_at), completedAt: iso(row.created_at), durationMs: 0,
    metadata: redactSensitive({ schemaVersion: row.schema_version, sequence: Number(row.sequence), payload: row.payload }),
    detail: { state: 'NOT_RECORDED', kind: null, visibility: 'METADATA' }, inputArtifactId: null, outputArtifactId: null,
  }));
  const versions = snapshot.versions.map((row) => ({
    id: `version:${row.id}`, source: 'REQUIREMENTS_VERSION', category: 'PERSISTENCE', name: 'Requirements version saved', status: 'COMPLETED', stepId: null,
    startedAt: iso(row.created_at), completedAt: iso(row.created_at), durationMs: 0,
    metadata: { versionId: row.id, sourceJobId: row.source_job_id, baseVersionId: row.base_version_id, researchJobId: row.research_job_id },
    detail: { state: 'AVAILABLE', kind: 'OUTPUT', visibility: 'METADATA' }, inputArtifactId: row.base_version_id || null, outputArtifactId: row.id,
  }));
  const artifacts = (snapshot.artifacts || []).map((row) => ({
    id: `artifact:${row.id}`, source: 'ARTIFACT', category: 'PERSISTENCE', name: `Artifact: ${row.kind}`, status: row.storage_status === 'AVAILABLE' ? 'COMPLETED' : 'INFO', stepId: null,
    startedAt: iso(row.created_at), completedAt: iso(row.completed_at || row.created_at), durationMs: duration(row.created_at, row.completed_at || row.created_at),
    metadata: { artifactId: row.id, kind: row.kind, contentType: row.content_type, sizeBytes: Number(row.size_bytes || 0), sha256: row.sha256, storageStatus: row.storage_status, expiresAt: iso(row.expires_at) },
    detail: { state: row.storage_status === 'AVAILABLE' ? 'NOT_RECORDED' : 'EXPIRED', kind: row.kind, visibility: 'METADATA' }, inputArtifactId: null, outputArtifactId: row.id,
  }));
  return stableSort([...custom, ...steps, ...attempts, ...events, ...versions, ...artifacts]);
}

export function createJobTraceService({ config, jobTraceRepository, artifactRepository, auditRepository }) {
  return {
    async trace({ auth, jobId, cursor, limit = 50, requestId }) {
      const parsedLimit = Number(limit);
      const maxPageSize = config.diagnostics?.maxPageSize || 100;
      if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > maxPageSize) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: `limit must be an integer from 1 to ${maxPageSize}` });
      const snapshot = await jobTraceRepository.snapshot({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), jobId });
      if (!snapshot) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
      const index = cursorIndex(cursor); const all = compose(snapshot); const timeline = all.slice(index, index + parsedLimit);
      const job = snapshot.job;
      await auditRepository?.record({ tenantId: auth.tenantId, actorId: auth.userId, actorRoles: auth.roles, action: 'job.trace.view', targetType: 'job', targetId: jobId, requestId, sourceSite: config.process.siteId, metadata: { cursor: index, limit: parsedLimit } });
      return {
        jobId, type: job.type, mode: job.configuration_snapshot?.featureMode || null, status: job.status, outcome: job.outcome || null, reasonCode: job.reason_code || null,
        currentStep: job.current_step || null, createdAt: iso(job.created_at), startedAt: iso(job.started_at), completedAt: iso(job.completed_at),
        durationMs: duration(job.started_at || job.created_at, job.completed_at), skillUsage: job.configuration_snapshot?.babokSkillProfile ? 'BUNDLE_SNAPSHOTTED' : 'NOT_APPLICABLE',
        ...(job.configuration_snapshot?.babokSkillProfile ? { skillProfile: Object.fromEntries(['id', 'version', 'manifestHash'].map((key) => [key, job.configuration_snapshot.babokSkillProfile[key]])) } : {}),
        ...(job.configuration_snapshot?.promptProfile ? { instructionProfile: Object.fromEntries(['id', 'version', 'manifestHash'].map((key) => [key, job.configuration_snapshot.promptProfile[key]])) } : {}),
        timeline, nextCursor: index + parsedLimit < all.length ? Buffer.from(JSON.stringify({ index: index + parsedLimit })).toString('base64url') : null,
      };
    },

    async detail({ auth, jobId, entryId, requestId }) {
      const entry = await jobTraceRepository.findVisibleEntry({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), jobId, entryId });
      if (!entry) throw new ApiError({ status: 404, code: 'TRACE_ENTRY_NOT_FOUND', message: 'Trace entry not found' });
      const systemOnly = entry.detail_visibility === 'SYSTEM_ADMIN' || entry.detail_kind === 'ERROR_STACK';
      const allowed = systemOnly ? auth.roles.includes('system-admin') : auth.roles.some((role) => DIAGNOSTIC_DETAIL_ROLES.has(role));
      if (!allowed) {
        if (systemOnly) throw new ApiError({ status: 403, code: 'TRACE_DETAIL_FORBIDDEN', message: 'Diagnostic detail is not available for this role' });
        return { entryId, state: 'REDACTED', content: null };
      }
      await auditRepository?.record({ tenantId: auth.tenantId, actorId: auth.userId, actorRoles: auth.roles, action: 'job.trace.detail.view', targetType: 'job-trace-entry', targetId: entryId, requestId, sourceSite: config.process.siteId, metadata: { jobId, detailKind: entry.detail_kind } });
      if (!entry.detail_artifact_id) return { entryId, state: 'NOT_RECORDED', content: null };
      if (entry.expires_at && new Date(entry.expires_at) <= new Date()) return { entryId, state: 'EXPIRED', content: null };
      const metadata = await artifactRepository.metadata({ tenantId: auth.tenantId, ownerUserId: null, artifactId: entry.detail_artifact_id });
      if (!metadata) return { entryId, state: 'EXPIRED', content: null };
      const raw = await artifactRepository.readText({ tenantId: auth.tenantId, artifactId: entry.detail_artifact_id, maxBytes: config.diagnostics?.maxDetailBytes || 1_048_576 });
      let content; try { content = JSON.parse(raw); } catch { content = raw; }
      return { entryId, state: 'AVAILABLE', kind: entry.detail_kind, contentType: metadata.content_type, content: redactSensitive(content) };
    },
  };
}
