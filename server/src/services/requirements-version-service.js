import { ApiError } from '../errors/api-error.js';

const PRIVILEGED = new Set(['tenant-admin', 'operator', 'auditor', 'system-admin']);
const REQUIREMENT_GROUPS = ['business', 'functional', 'nonfunctional'];

function ownerScope(auth) {
  return auth.roles.some((role) => PRIVILEGED.has(role)) ? null : auth.userId;
}

function normalizeRequirements(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'requirements must be an object' });
  }
  const seen = new Set();
  return Object.fromEntries(REQUIREMENT_GROUPS.map((group) => {
    const items = value[group];
    if (!Array.isArray(items) || items.length > 500) {
      throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: `requirements.${group} must be an array with at most 500 items` });
    }
    return [group, items.map((item, index) => {
      const normalized = typeof item === 'string' ? { id: `${group}-${index + 1}`, text: item } : item;
      const id = String(normalized?.id || '').trim();
      const text = String(normalized?.text || '').trim();
      if (!id || !text || id.length > 100 || text.length > 20_000 || seen.has(id)) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: `requirements.${group} contains an invalid or duplicate item` });
      }
      const researchEnhancementKey = normalized.researchEnhancementKey == null ? null : String(normalized.researchEnhancementKey).trim();
      if (researchEnhancementKey != null && (!researchEnhancementKey || researchEnhancementKey.length > 200)) {
        throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: `requirements.${group} contains an invalid research enhancement key` });
      }
      seen.add(id);
      return { id, text, fromResearch: normalized.fromResearch === true, ...(researchEnhancementKey ? { researchEnhancementKey } : {}) };
    })];
  }));
}

function parseVersionContent(text) {
  try {
    const value = JSON.parse(text);
    if (value?.kind !== 'REQUIREMENTS_VERSION' || !value.requirements) throw new Error('invalid');
    return value;
  } catch {
    throw new ApiError({ status: 409, code: 'INVALID_REQUIREMENTS_VERSION', message: 'Artifact is not a requirements version' });
  }
}

export function createRequirementsVersionService({ config, jobRepository, artifactRepository, versionRepository, auditRepository, clock = () => new Date() }) {
  async function visibleJob(auth, jobId) {
    const job = await jobRepository.findVisibleById({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), jobId });
    if (!job) throw new ApiError({ status: 404, code: 'JOB_NOT_FOUND', message: 'Job not found' });
    return job;
  }

  async function visibleVersion(auth, versionId) {
    const row = await versionRepository.findVisibleById({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), id: versionId });
    if (!row) throw new ApiError({ status: 404, code: 'REQUIREMENTS_VERSION_NOT_FOUND', message: 'Requirements version not found' });
    const metadata = await artifactRepository.metadata({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), artifactId: versionId });
    if (!metadata) throw new ApiError({ status: 404, code: 'REQUIREMENTS_VERSION_NOT_FOUND', message: 'Requirements version artifact not found' });
    const content = parseVersionContent(await artifactRepository.readText({ tenantId: auth.tenantId, artifactId: versionId }));
    return { row, metadata, content };
  }

  return {
    async create({ auth, body, requestId }) {
      const sourceJob = await visibleJob(auth, body.sourceJobId);
      if (sourceJob.status !== 'SUCCEEDED') throw new ApiError({ status: 409, code: 'SOURCE_JOB_NOT_COMPLETE', message: 'Requirements can be saved only from a completed job' });
      if (!['DECOMPOSITION', 'RESEARCH'].includes(sourceJob.type)) throw new ApiError({ status: 409, code: 'INVALID_SOURCE_JOB', message: 'Unsupported requirements source job' });

      let base = null;
      if (body.baseVersionId) base = await visibleVersion(auth, body.baseVersionId);
      if (sourceJob.type === 'RESEARCH') {
        const basedOnResearchInput = sourceJob.input_artifact_id === body.baseVersionId;
        const basedOnSameResearchRevision = base?.row.source_job_id === sourceJob.id
          && base?.content.sourceJobType === 'RESEARCH'
          && base?.content.researchJobId === sourceJob.id;
        if (!basedOnResearchInput && !basedOnSameResearchRevision) {
          throw new ApiError({ status: 409, code: 'RESEARCH_VERSION_MISMATCH', message: 'Final requirements must be based on the research input or a final revision from the same research job' });
        }
      }

      const requirements = normalizeRequirements(body.requirements);
      const now = clock();
      const envelope = {
        schemaVersion: 1,
        kind: 'REQUIREMENTS_VERSION',
        sourceJobId: sourceJob.id,
        sourceJobType: sourceJob.type,
        businessContextArtifactId: sourceJob.type === 'DECOMPOSITION' ? sourceJob.input_artifact_id : base?.content.businessContextArtifactId || null,
        baseVersionId: base?.row.id || null,
        researchJobId: sourceJob.type === 'RESEARCH' ? sourceJob.id : null,
        requirements,
        decisions: body.decisions && typeof body.decisions === 'object' && !Array.isArray(body.decisions) ? body.decisions : {},
        createdAt: now.toISOString(),
      };
      const artifact = await artifactRepository.createText({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        text: JSON.stringify(envelope),
        kind: 'RESULT',
        contentType: 'application/vnd.reqai.requirements-version+json',
        expiresAt: new Date(now.getTime() + config.retention.finalResultsDays * 86_400_000),
        maxBytes: config.jobs.resultMaxBytes,
      });
      const row = await versionRepository.create({
        tenantId: auth.tenantId,
        ownerUserId: auth.userId,
        id: artifact.artifactId,
        sourceJobId: sourceJob.id,
        baseVersionId: base?.row.id || null,
        researchJobId: sourceJob.type === 'RESEARCH' ? sourceJob.id : null,
        decisions: envelope.decisions,
        event: {
          type: 'requirements.version-created',
          payload: {
            jobId: sourceJob.id,
            versionId: artifact.artifactId,
            baseVersionId: base?.row.id || null,
            researchJobId: sourceJob.type === 'RESEARCH' ? sourceJob.id : null,
            occurredAt: now.toISOString(),
          },
        },
      });
      await auditRepository?.record({ tenantId: auth.tenantId, actorId: auth.userId, actorRoles: auth.roles, action: 'requirements.version.create', targetType: 'requirements-version', targetId: row.id, requestId, sourceSite: config.process.siteId, metadata: { sourceJobId: sourceJob.id, baseVersionId: row.base_version_id } });
      return { versionId: row.id, sourceJobId: row.source_job_id, baseVersionId: row.base_version_id, researchJobId: row.research_job_id, requirements, decisions: envelope.decisions, createdAt: new Date(row.created_at).toISOString() };
    },

    async get({ auth, versionId }) {
      const value = await visibleVersion(auth, versionId);
      return { versionId: value.row.id, sourceJobId: value.row.source_job_id, baseVersionId: value.row.base_version_id, researchJobId: value.row.research_job_id, requirements: value.content.requirements, decisions: value.content.decisions || {}, createdAt: new Date(value.row.created_at).toISOString() };
    },

    async list({ auth, jobId }) {
      await visibleJob(auth, jobId);
      const rows = await versionRepository.listVisibleByJob({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), jobId });
      const items = await Promise.all(rows.map(async (row) => {
        const content = parseVersionContent(await artifactRepository.readText({ tenantId: auth.tenantId, artifactId: row.id }));
        return { versionId: row.id, sourceJobId: row.source_job_id, baseVersionId: row.base_version_id, researchJobId: row.research_job_id, requirements: content.requirements, decisions: content.decisions || row.decisions || {}, createdAt: new Date(row.created_at).toISOString() };
      }));
      return { items };
    },

    async validateResearchInput({ auth, parentJobId, versionId }) {
      const parent = await visibleJob(auth, parentJobId);
      if (parent.type !== 'DECOMPOSITION' || parent.status !== 'SUCCEEDED') {
        throw new ApiError({ status: 409, code: 'INVALID_RESEARCH_PARENT', message: 'Linked research requires a completed decomposition parent' });
      }
      const version = await visibleVersion(auth, versionId);
      if (version.row.source_job_id !== parentJobId || version.content.sourceJobType !== 'DECOMPOSITION') {
        throw new ApiError({ status: 409, code: 'RESEARCH_VERSION_MISMATCH', message: 'Requirements version does not belong to the parent decomposition job' });
      }
      return version;
    },

    async resolveResearchSource({ auth, versionId }) {
      const version = await visibleVersion(auth, versionId);
      if (version.content.sourceJobType !== 'DECOMPOSITION') {
        throw new ApiError({ status: 409, code: 'INVALID_RESEARCH_PARENT', message: 'Requirements research requires a version produced by decomposition' });
      }
      const parent = await visibleJob(auth, version.row.source_job_id);
      if (parent.type !== 'DECOMPOSITION' || parent.status !== 'SUCCEEDED') {
        throw new ApiError({ status: 409, code: 'INVALID_RESEARCH_PARENT', message: 'Requirements research requires a completed decomposition parent' });
      }
      return Object.freeze({ versionId: version.row.id, inputArtifactId: version.row.id, parentJobId: parent.id, inputSha256: version.metadata.sha256 });
    },
  };
}
