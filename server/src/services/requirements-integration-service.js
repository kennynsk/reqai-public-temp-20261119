import { createHash, randomUUID } from 'node:crypto';

import { ApiError } from '../errors/api-error.js';
import { canonicalJson } from '../prompts/prompt-utils.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[1-9]\d*\.\d+\.\d+$/;
const PRIVILEGED = new Set(['tenant-admin', 'operator', 'auditor', 'system-admin']);
const MAX_REFERENCE_ARTIFACTS = 20;
const REASONING_LEVELS = new Set(['disabled', 'low', 'high', 'max']);

function invalid(message, details) {
  throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message, details });
}

function strictObject(value, allowed, name = 'request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be a JSON object`);
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) invalid(`${name} contains unsupported fields`, { fields: unsupported });
}

function executionOptions(body) {
  const result = {};
  if (body.model != null) {
    if (typeof body.model !== 'string' || !body.model.trim()) invalid('model must be a non-empty string');
    result.model = body.model.trim();
  }
  if (body.temperature != null) {
    if (!Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2) invalid('temperature must be from 0 to 2');
    result.temperature = body.temperature;
  }
  if (body.reasoning != null) {
    if (!REASONING_LEVELS.has(body.reasoning)) invalid('reasoning must be disabled, low, high or max');
    result.reasoning = body.reasoning;
  }
  if (body.promptVersion != null) {
    if (typeof body.promptVersion !== 'string' || !VERSION.test(body.promptVersion)) invalid('promptVersion must use semantic versioning');
    result.promptVersion = body.promptVersion;
  }
  return result;
}

function ownerScope(auth) {
  return auth.roles.some((role) => PRIVILEGED.has(role)) ? null : auth.userId;
}

function contentHash(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function domainHash({ operation, input, options }) {
  const primary = input.inlineContent
    ? { role: 'primary', sha256: input.inputSha256 }
    : input.materials.primary;
  return createHash('sha256').update(canonicalJson({
    operation,
    materials: {
      primary,
      baseline: input.materials.baseline,
      references: input.materials.references,
    },
    babokIdentifierSet: input.babokIdentifierSet || null,
    options,
  })).digest('hex');
}

export function createRequirementsIntegrationService({ config, artifactRepository, jobService, requirementsVersionService, uuid = randomUUID, clock = () => new Date() }) {
  async function resolveInput({ auth, body, inlineField }) {
    const inline = body[inlineField];
    const artifactId = body.inputArtifactId;
    const hasInline = typeof inline === 'string' && inline.trim().length > 0;
    const hasArtifact = artifactId != null;
    if (hasInline === hasArtifact) invalid(`Exactly one of ${inlineField} or inputArtifactId is required`);
    if (inline != null && typeof inline !== 'string') invalid(`${inlineField} must be a string`);
    if (hasInline) {
      const content = inline.trim();
      const size = Buffer.byteLength(content, 'utf8');
      if (size > Math.min(config.jobs.inputMaxBytes, 1024 * 1024)) throw new ApiError({ status: 413, code: 'INLINE_INPUT_TOO_LARGE', message: 'Inline input is too large; upload it through POST /api/v1/artifacts and submit inputArtifactId' });
      const inputArtifactId = uuid();
      const inputSha256 = contentHash(content);
      return {
        inputArtifactId,
        inputSha256,
        inlineContent: content,
        materials: {
          primary: { artifactId: inputArtifactId, role: 'primary', name: 'Inline business context', sha256: inputSha256, status: 'AVAILABLE' },
          baseline: [],
          references: [],
        },
      };
    }
    if (!UUID.test(artifactId || '')) invalid('inputArtifactId must be a UUID');
    const metadata = await artifactRepository.validateMaterial({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), artifactId });
    if (!metadata) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: 'Input artifact not found' });
    return {
      inputArtifactId: artifactId,
      inputSha256: metadata.sha256,
      inlineContent: null,
      materials: {
        primary: { artifactId, role: 'primary', name: metadata.name || metadata.filename || 'Primary source', sha256: metadata.sha256, status: 'AVAILABLE' },
        baseline: [],
        references: [],
      },
    };
  }

  async function resolveOptionalMaterials({ auth, body, input }) {
    const baselineArtifactId = body.baselineArtifactId ?? null;
    const referenceArtifactIds = body.referenceArtifactIds ?? [];
    if (baselineArtifactId !== null && !UUID.test(baselineArtifactId)) invalid('baselineArtifactId must be a UUID');
    if (!Array.isArray(referenceArtifactIds)) invalid('referenceArtifactIds must be an array of UUIDs');
    if (referenceArtifactIds.length > MAX_REFERENCE_ARTIFACTS) invalid(`referenceArtifactIds must contain at most ${MAX_REFERENCE_ARTIFACTS} artifacts`);
    if (referenceArtifactIds.some((artifactId) => !UUID.test(artifactId))) invalid('referenceArtifactIds must contain only UUIDs');
    if (new Set(referenceArtifactIds).size !== referenceArtifactIds.length) invalid('referenceArtifactIds must not contain duplicates');
    const requested = [baselineArtifactId, ...referenceArtifactIds].filter(Boolean);
    if (new Set([input.inputArtifactId, ...requested]).size !== requested.length + 1) invalid('Primary, baseline and reference artifacts must be distinct');
    const descriptors = await Promise.all(requested.map(async (artifactId) => {
      const metadata = await artifactRepository.validateMaterial({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), artifactId });
      if (!metadata) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: `Material artifact ${artifactId} not found` });
      const role = artifactId === baselineArtifactId ? 'baseline' : 'reference';
      return { artifactId, role, name: metadata.name || metadata.filename || `${role} artifact`, sha256: metadata.sha256, status: 'AVAILABLE' };
    }));
    input.materials = {
      primary: input.materials.primary,
      baseline: descriptors.filter((item) => item.role === 'baseline'),
      references: descriptors.filter((item) => item.role === 'reference'),
    };
    return input;
  }

  async function submit({ auth, idempotencyKey, requestId, operation, input, type, parentJobId = null, options }) {
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey || '')) {
      throw new ApiError({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 16 to 128 safe characters' });
    }
    const requestHashOverride = domainHash({ operation, input, options });
    const inlineArtifact = input.inlineContent == null ? null : {
      content: input.inlineContent,
      contentType: 'text/plain; charset=utf-8',
      sha256: input.inputSha256,
      expiresAt: new Date(clock().getTime() + config.retention.intermediateDays * 86_400_000),
    };
    const principalIdempotencyKey = createHash('sha256').update(`${auth.userId}\0${idempotencyKey || ''}`).digest('hex');
    return jobService.create({ auth, idempotencyKey: principalIdempotencyKey, requestHashOverride, inlineArtifact, requestId, body: { type, inputArtifactId: input.inputArtifactId, materials: input.materials, ...(input.babokIdentifierSet ? { babokIdentifierSet: input.babokIdentifierSet } : {}), ...(parentJobId ? { parentJobId } : {}), options } });
  }

  return Object.freeze({
    async startDecomposition({ auth, idempotencyKey, requestId, command }) {
      strictObject(command, ['businessContext', 'inputArtifactId', 'baselineArtifactId', 'referenceArtifactIds', 'model', 'temperature', 'reasoning', 'promptVersion']);
      const input = await resolveOptionalMaterials({ auth, body: command, input: await resolveInput({ auth, body: command, inlineField: 'businessContext' }) });
      const options = { mode: 'DECOMPOSITION', ...executionOptions(command) };
      return submit({ auth, idempotencyKey, requestId, operation: 'decomposition', input, type: 'DECOMPOSITION', options });
    },

    async startRequirementsResearch({ auth, idempotencyKey, requestId, versionId, command }) {
      strictObject(command || {}, ['model', 'temperature', 'reasoning', 'promptVersion']);
      if (!UUID.test(versionId || '')) invalid('versionId must be a UUID');
      const source = await requirementsVersionService.resolveResearchSource({ auth, versionId });
      const options = { mode: 'REQUIREMENTS_INSIGHTS', ...executionOptions(command || {}) };
      const input = { inputArtifactId: source.inputArtifactId, inputSha256: source.inputSha256, inlineContent: null, materials: { primary: { artifactId: source.inputArtifactId, role: 'primary', name: 'Requirements version', sha256: source.inputSha256, status: 'AVAILABLE' }, baseline: [], references: [] }, babokIdentifierSet: source.babokIdentifierSet };
      return submit({ auth, idempotencyKey, requestId, operation: 'requirements-research', input, type: 'RESEARCH', parentJobId: source.parentJobId, options });
    },
  });
}
