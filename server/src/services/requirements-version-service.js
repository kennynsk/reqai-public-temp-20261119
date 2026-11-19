import { ApiError } from '../errors/api-error.js';
import { canonicalSha256 } from '../prompts/prompt-utils.js';
import { babokIdentifierSet, validateBabokRegistry } from './babok-requirements-contract.js';
import { projectBabokRecovery } from './babok-recovery-registry.js';
import { normalizeReviewMetadata } from './review-metadata.js';
import { overlayLegacyReview } from './legacy-review-overlay.js';
import { deterministicSemanticIssues, registrySemanticRecords } from '../domain/babok-semantics.js';

const PRIVILEGED = new Set(['tenant-admin', 'operator', 'auditor', 'system-admin']);
const REQUIREMENT_GROUPS = ['business', 'functional', 'nonfunctional'];

function ownerScope(auth) {
  return auth.roles.some((role) => PRIVILEGED.has(role)) ? null : auth.userId;
}

function workflowJobId(job) {
  if (job.type === 'DECOMPOSITION' && (job.configuration_snapshot?.featureMode ?? 'DECOMPOSITION') === 'DECOMPOSITION') return job.id;
  return job.type === 'RESEARCH' && job.configuration_snapshot?.featureMode === 'REQUIREMENTS_INSIGHTS' ? job.parent_job_id : null;
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

function legacyProjection(registry) {
  return {
    business: registry.groups.BR.map((item) => ({ id: item.id, text: item.text, fromResearch: false })),
    functional: registry.groups.FR.map((item) => ({ id: item.id, text: item.text, fromResearch: false })),
    nonfunctional: registry.groups.NFR.map((item) => ({ id: item.id, text: item.text, fromResearch: false })),
  };
}

function normalizeRegistry(value) {
  try {
    const registry = structuredClone(validateBabokRegistry(value));
    // A certificate binds the generated candidate, not a later manual review.
    // Client-supplied certificates must never attest to edited requirements.
    delete registry.semanticValidation;
    const issues = deterministicSemanticIssues(registrySemanticRecords(registry)).filter((issue) => issue.code.startsWith('BR_'));
    if (issues.length) throw new ApiError({ status: 422, code: 'BABOK_SEMANTIC_INVALID', message: 'Бизнес-требование описывает метрику или устройство решения вместо самостоятельного бизнес-результата.', details: { issues } });
    return registry;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError({ status: 400, code: 'INVALID_BABOK_REGISTRY', message: error.message, details: error.details });
  }
}

function normalizeEditedRecordIds(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 200 || value.some((id) => typeof id !== 'string' || !id.trim() || id.length > 100)) {
    throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'editedRecordIds must be an array of at most 200 identifiers' });
  }
  return [...new Set(value.map((id) => id.trim()))];
}

function parseVersionContent(text) {
  try {
    const value = JSON.parse(text);
    if (value?.kind !== 'REQUIREMENTS_VERSION' || (!value.requirements && !value.registry)) throw new Error('invalid');
    if (value.registry?.schemaVersion === 'babok-requirements.v1') validateBabokRegistry(value.registry);
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

  const service = {
    async create({ auth, body, requestId }) {
      const sourceJob = await visibleJob(auth, body.sourceJobId);
      if (sourceJob.status !== 'SUCCEEDED') throw new ApiError({ status: 409, code: 'SOURCE_JOB_NOT_COMPLETE', message: 'Requirements can be saved only from a completed job' });
      if (!['DECOMPOSITION', 'RESEARCH'].includes(sourceJob.type)) throw new ApiError({ status: 409, code: 'INVALID_SOURCE_JOB', message: 'Unsupported requirements source job' });

      const clientMutationId = body.clientMutationId ?? null;
      if (clientMutationId !== null && (typeof clientMutationId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(clientMutationId))) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid save identity' });
      if (body.expectedLatestVersionId !== undefined && body.expectedLatestVersionId !== null && (typeof body.expectedLatestVersionId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.expectedLatestVersionId))) throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid expected version' });
      const mutationHash = clientMutationId ? canonicalSha256(body) : null;
      if (clientMutationId) {
        const previous = await versionRepository.findMutation({ tenantId: auth.tenantId, ownerUserId: auth.userId, sourceJobId: sourceJob.id, clientMutationId });
        if (previous) {
          if (previous.mutation_hash !== mutationHash) throw new ApiError({ status: 409, code: 'VERSION_MUTATION_CONFLICT', message: 'Save identity was already used for different content' });
          return service.get({ auth, versionId: previous.id });
        }
      }

      let base = null;
      if (body.baseVersionId) base = await visibleVersion(auth, body.baseVersionId);
      if (base && sourceJob.type === 'DECOMPOSITION' && base.row.source_job_id !== sourceJob.id) throw new ApiError({ status: 409, code: 'REQUIREMENTS_VERSION_MISMATCH', message: 'The base version belongs to a different workflow' });
      if (sourceJob.type === 'RESEARCH') {
        const basedOnResearchInput = sourceJob.input_artifact_id === body.baseVersionId;
        const basedOnSameResearchRevision = base?.row.source_job_id === sourceJob.id
          && base?.content.sourceJobType === 'RESEARCH'
          && base?.content.researchJobId === sourceJob.id;
        if (!basedOnResearchInput && !basedOnSameResearchRevision) {
          throw new ApiError({ status: 409, code: 'RESEARCH_VERSION_MISMATCH', message: 'Final requirements must be based on the research input or a final revision from the same research job' });
        }
      }

      const registry = body.registry || body.babokRegistry ? normalizeRegistry(body.registry || body.babokRegistry) : base?.content.registry ? normalizeRegistry(overlayLegacyReview(base.content.registry, normalizeRequirements(body.requirements))) : null;
      const requirements = registry ? legacyProjection(registry) : normalizeRequirements(body.requirements);
      const now = clock();
      const suppliedDecisions = body.decisions && typeof body.decisions === 'object' && !Array.isArray(body.decisions) ? body.decisions : {};
      const decisions = { ...(base?.content.decisions || {}), ...suppliedDecisions, ...(sourceJob.type === 'RESEARCH' ? { skippedResearch: false } : {}) };
      const businessContextArtifactId = sourceJob.type === 'DECOMPOSITION' ? sourceJob.input_artifact_id : base?.content.businessContextArtifactId || null;
      let researchResult = null;
      if (sourceJob.type === 'RESEARCH' && (suppliedDecisions.review?.proposals || suppliedDecisions.review?.citationChecks) && sourceJob.result_artifact_id) {
        try { researchResult = JSON.parse(await artifactRepository.readText({ tenantId: auth.tenantId, artifactId: sourceJob.result_artifact_id })); }
        catch { throw new ApiError({ status: 409, code: 'REVIEW_SOURCE_UNAVAILABLE', message: 'Research review context is unavailable' }); }
      }
      let analysisBase = base?.content.registry || null;
      const importingRecovery = decisions.recoveryImported === true && base?.content.decisions?.recoveryImported !== true;
      if ((!analysisBase || importingRecovery) && suppliedDecisions.review && sourceJob.result_artifact_id) {
        let original;
        try { original = JSON.parse(await artifactRepository.readText({ tenantId: auth.tenantId, artifactId: sourceJob.result_artifact_id })); }
        catch { throw new ApiError({ status: 409, code: 'REVIEW_SOURCE_UNAVAILABLE', message: 'Original review context is unavailable' }); }
        analysisBase = original?.manualRegistry && original.recovery
          ? projectBabokRecovery(original, analysisBase || original.manualRegistry, base?.content.decisions).registry
          : analysisBase || original;
      }
      const review = normalizeReviewMetadata({ supplied: suppliedDecisions.review, inherited: base?.content.decisions?.review, content: registry || requirements, allowedGaps: analysisBase?.analysis?.GAP || [], contextId: businessContextArtifactId, actorId: auth.userId, now, baseVersionId: base?.row.id, finalizing: sourceJob.type === 'RESEARCH' || decisions.skippedResearch === true, baseContent: base?.content.registry || base?.content.requirements, researchResult, researchJobId: sourceJob.type === 'RESEARCH' ? sourceJob.id : null });
      if (review !== undefined) decisions.review = review;
      const manualDecisionMetadata = {
        actorUserId: auth.userId,
        recordedAt: now.toISOString(),
        decisionKeys: Object.keys(decisions).sort(),
        editedRecordIds: normalizeEditedRecordIds(body.editedRecordIds),
      };
      const envelope = {
        schemaVersion: registry ? 2 : 1,
        kind: 'REQUIREMENTS_VERSION',
        ...(sourceJob.title || base?.content.title ? { title: sourceJob.type === 'RESEARCH' ? base?.content.title || sourceJob.title : sourceJob.title || base?.content.title } : {}),
        sourceJobId: sourceJob.id,
        sourceJobType: sourceJob.type,
        businessContextArtifactId,
        baseVersionId: base?.row.id || null,
        researchJobId: sourceJob.type === 'RESEARCH' ? sourceJob.id : null,
        requirements,
        ...(registry ? {
          contentSchemaVersion: registry.schemaVersion,
          registry,
          analysisContext: {
            summary: registry.summary,
            context: registry.context,
            analysis: registry.analysis,
            scope: registry.scope,
          },
          materialLineage: {
            sourceJobMaterials: sourceJob.type === 'RESEARCH' ? base?.content.materialLineage?.sourceJobMaterials || null : sourceJob.configuration_snapshot?.materials || null,
            resultMaterials: registry.materials,
            primaryArtifactId: businessContextArtifactId,
          },
          promptProfile: sourceJob.configuration_snapshot?.promptProfile || null,
          babokSkillProfile: sourceJob.configuration_snapshot?.babokSkillProfile || null,
        } : {}),
        decisions,
        revision: {
          kind: 'MANUAL_REVIEW',
          baseVersionId: base?.row.id || null,
          sourceJobId: sourceJob.id,
          manualDecisionMetadata,
        },
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
        clientMutationId,
        mutationHash,
        expectedLatestVersionId: body.expectedLatestVersionId,
        workflowJobId: workflowJobId(sourceJob),
        workflowOwnerId: ownerScope(auth),
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
      if (row.id !== artifact.artifactId) return service.get({ auth, versionId: row.id });
      await auditRepository?.record({ tenantId: auth.tenantId, actorId: auth.userId, actorRoles: auth.roles, action: 'requirements.version.create', targetType: 'requirements-version', targetId: row.id, requestId, sourceSite: config.process.siteId, metadata: { sourceJobId: sourceJob.id, baseVersionId: row.base_version_id, manualDecisionMetadata } });
      return { ...(envelope.title ? { title: envelope.title } : {}), versionId: row.id, sourceJobId: row.source_job_id, baseVersionId: row.base_version_id, researchJobId: row.research_job_id, requirements, ...(registry ? { registry, analysisContext: envelope.analysisContext, materialLineage: envelope.materialLineage, contentSchemaVersion: envelope.contentSchemaVersion } : {}), decisions: envelope.decisions, revision: envelope.revision, createdAt: new Date(row.created_at).toISOString() };
    },

    async get({ auth, versionId }) {
      const value = await visibleVersion(auth, versionId);
      return { ...(value.content.title ? { title: value.content.title } : {}), versionId: value.row.id, sourceJobId: value.row.source_job_id, baseVersionId: value.row.base_version_id, researchJobId: value.row.research_job_id, requirements: value.content.requirements, ...(value.content.registry ? { registry: value.content.registry, analysisContext: value.content.analysisContext || null, materialLineage: value.content.materialLineage || null, contentSchemaVersion: value.content.contentSchemaVersion || value.content.registry.schemaVersion } : {}), decisions: value.content.decisions || {}, revision: value.content.revision || null, createdAt: new Date(value.row.created_at).toISOString() };
    },

    async list({ auth, jobId }) {
      const job = await visibleJob(auth, jobId);
      const scope = { tenantId: auth.tenantId, ownerUserId: ownerScope(auth) };
      const root = workflowJobId(job);
      const [rows, finalRow] = await Promise.all([
        versionRepository.listVisibleByJob({ ...scope, jobId }),
        root ? versionRepository.findWorkflowFinal({ ...scope, workflowJobId: root }) : null,
      ]);
      const items = await Promise.all(rows.map(async (row) => {
        const content = parseVersionContent(await artifactRepository.readText({ tenantId: auth.tenantId, artifactId: row.id }));
        return { ...(content.title ? { title: content.title } : {}), versionId: row.id, sourceJobId: row.source_job_id, baseVersionId: row.base_version_id, researchJobId: row.research_job_id, requirements: content.requirements, ...(content.registry ? { registry: content.registry, analysisContext: content.analysisContext || null, materialLineage: content.materialLineage || null, contentSchemaVersion: content.contentSchemaVersion || content.registry.schemaVersion } : {}), decisions: content.decisions || row.decisions || {}, revision: content.revision || null, createdAt: new Date(row.created_at).toISOString() };
      }));
      const workflowFinal = finalRow ? items.find((version) => version.versionId === finalRow.id) ?? await service.get({ auth, versionId: finalRow.id }) : null;
      return { items, workflowFinal };
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
      return Object.freeze({
        versionId: version.row.id,
        inputArtifactId: version.row.id,
        parentJobId: parent.id,
        inputSha256: version.metadata.sha256,
        ...(version.content.registry ? { babokIdentifierSet: babokIdentifierSet(version.content.registry) } : {}),
      });
    },
  };
  return service;
}
