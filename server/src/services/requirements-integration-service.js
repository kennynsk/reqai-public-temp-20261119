import { createHash, randomUUID } from 'node:crypto';

import { ApiError } from '../errors/api-error.js';
import { canonicalJson } from '../prompts/prompt-utils.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = /^[1-9]\d*\.\d+\.\d+$/;
const PRIVILEGED = new Set(['tenant-admin', 'operator', 'auditor', 'system-admin']);

function invalid(message, details) {
  throw new ApiError({ status: 400, code: 'VALIDATION_ERROR', message, details });
}

function strictObject(value, allowed, name = 'request') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${name} must be a JSON object`);
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) invalid(`${name} contains unsupported fields`, { fields: unsupported });
}

function executionOptions(body, allowed = {}) {
  const result = {};
  if (body.model != null) {
    if (typeof body.model !== 'string' || !body.model.trim()) invalid('model must be a non-empty string');
    result.model = body.model.trim();
  }
  if (body.temperature != null) {
    if (!Number.isFinite(body.temperature) || body.temperature < 0 || body.temperature > 2) invalid('temperature must be from 0 to 2');
    result.temperature = body.temperature;
  }
  if (body.promptVersion != null) {
    if (typeof body.promptVersion !== 'string' || !VERSION.test(body.promptVersion)) invalid('promptVersion must use semantic versioning');
    result.promptVersion = body.promptVersion;
  }
  if (allowed.researchCategories && body.researchCategories != null) {
    if (!Array.isArray(body.researchCategories) || !body.researchCategories.length || body.researchCategories.some((item) => typeof item !== 'string' || !item.trim())) invalid('researchCategories must contain non-empty strings');
    result.researchCategories = body.researchCategories.map((item) => item.trim());
  }
  if (allowed.researchKinds && body.researchKinds != null) {
    const kinds = new Set(['trends', 'competitors', 'practices']);
    if (!Array.isArray(body.researchKinds) || !body.researchKinds.length || body.researchKinds.some((item) => !kinds.has(item))) invalid('researchKinds contains an unsupported value');
    result.researchKinds = [...body.researchKinds];
  }
  return result;
}

function ownerScope(auth) {
  return auth.roles.some((role) => PRIVILEGED.has(role)) ? null : auth.userId;
}

function contentHash(text) {
  return createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

function domainHash({ operation, inputArtifactId = null, inputSha256, options }) {
  return createHash('sha256').update(canonicalJson({ operation, inputArtifactId, inputSha256, options })).digest('hex');
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
      return { inputArtifactId: uuid(), inputSha256: contentHash(content), inlineContent: content };
    }
    if (!UUID.test(artifactId || '')) invalid('inputArtifactId must be a UUID');
    const metadata = await artifactRepository.metadata({ tenantId: auth.tenantId, ownerUserId: ownerScope(auth), artifactId });
    if (!metadata) throw new ApiError({ status: 404, code: 'ARTIFACT_NOT_FOUND', message: 'Input artifact not found' });
    return { inputArtifactId: artifactId, inputSha256: metadata.sha256, inlineContent: null };
  }

  async function submit({ auth, idempotencyKey, requestId, operation, input, type, parentJobId = null, options }) {
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey || '')) {
      throw new ApiError({ status: 400, code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must contain 16 to 128 safe characters' });
    }
    const requestHashOverride = domainHash({ operation, inputArtifactId: input.inlineContent ? null : input.inputArtifactId, inputSha256: input.inputSha256, options });
    const inlineArtifact = input.inlineContent == null ? null : {
      content: input.inlineContent,
      contentType: 'text/plain; charset=utf-8',
      sha256: input.inputSha256,
      expiresAt: new Date(clock().getTime() + config.retention.intermediateDays * 86_400_000),
    };
    const principalIdempotencyKey = createHash('sha256').update(`${auth.userId}\0${idempotencyKey || ''}`).digest('hex');
    return jobService.create({ auth, idempotencyKey: principalIdempotencyKey, requestId, requestHashOverride, inlineArtifact, body: { type, inputArtifactId: input.inputArtifactId, ...(parentJobId ? { parentJobId } : {}), options } });
  }

  return Object.freeze({
    async startDecomposition({ auth, idempotencyKey, requestId, command }) {
      strictObject(command, ['businessContext', 'inputArtifactId', 'model', 'temperature', 'promptVersion']);
      const input = await resolveInput({ auth, body: command, inlineField: 'businessContext' });
      const options = { mode: 'DECOMPOSITION', ...executionOptions(command) };
      return submit({ auth, idempotencyKey, requestId, operation: 'decomposition', input, type: 'DECOMPOSITION', options });
    },

    async startStandaloneResearch({ auth, idempotencyKey, requestId, command }) {
      strictObject(command, ['researchContext', 'inputArtifactId', 'strategy', 'model', 'temperature', 'promptVersion', 'researchCategories', 'researchKinds']);
      const strategy = command.strategy || 'agent';
      if (!['standard', 'agent'].includes(strategy)) invalid('strategy must be standard or agent');
      const input = await resolveInput({ auth, body: command, inlineField: 'researchContext' });
      const options = { mode: strategy === 'standard' ? 'STANDARD_RESEARCH' : 'AGENT_RESEARCH', ...executionOptions(command, { researchCategories: true, researchKinds: true }) };
      return submit({ auth, idempotencyKey, requestId, operation: 'standalone-research', input, type: 'RESEARCH', options });
    },

    async startRequirementsResearch({ auth, idempotencyKey, requestId, versionId, command }) {
      strictObject(command || {}, ['model', 'temperature', 'promptVersion']);
      if (!UUID.test(versionId || '')) invalid('versionId must be a UUID');
      const source = await requirementsVersionService.resolveResearchSource({ auth, versionId });
      const options = { mode: 'REQUIREMENTS_INSIGHTS', ...executionOptions(command || {}) };
      const input = { inputArtifactId: source.inputArtifactId, inputSha256: source.inputSha256, inlineContent: null };
      return submit({ auth, idempotencyKey, requestId, operation: 'requirements-research', input, type: 'RESEARCH', parentJobId: source.parentJobId, options });
    },
  });
}
