import { ApiError } from '../errors/api-error.js';

const BUNDLE_BY_MODE = Object.freeze({
  DECOMPOSITION: 'requirements-decomposition',
  REQUIREMENTS_INSIGHTS: 'requirements-insights',
});

export function createPromptProfileResolver({ catalog, policy }) {
  return Object.freeze({
    resolve({ type, mode, requestedVersion }) {
      const id = BUNDLE_BY_MODE[mode];
      if (!id || (type === 'DECOMPOSITION') !== mode.startsWith('DECOMPOSITION')) {
        throw new ApiError({ status: 400, code: 'PROMPT_PROFILE_UNSUPPORTED', message: `No production prompt profile is defined for ${type}/${mode}` });
      }
      const release = policy[id];
      if (!release) throw new ApiError({ status: 503, code: 'PROMPT_POLICY_UNAVAILABLE', message: `Prompt policy for ${id} is unavailable`, retryable: true });
      const version = requestedVersion || release.active;
      if (!release.released.includes(version)) throw new ApiError({ status: 400, code: 'PROMPT_VERSION_NOT_RELEASED', message: `Prompt version ${version} is not released for ${id}` });
      const bundle = catalog.get(id, version);
      if (!bundle.workflowPurposes.includes(mode)) throw new ApiError({ status: 409, code: 'PROMPT_PURPOSE_MISMATCH', message: `Prompt bundle ${id}@${version} does not support ${mode}` });
      return Object.freeze({
        id,
        version,
        manifestHash: bundle.manifestHash,
        outputSchemaVersion: bundle.outputSchemaVersion,
        templates: Object.freeze(Object.fromEntries(Object.entries(bundle.templates).map(([step, value]) => [step, { sha256: value.sha256 }]))),
      });
    },
  });
}
