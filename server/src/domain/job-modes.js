export const SUPPORTED_CREATE_MODES = Object.freeze(['DECOMPOSITION', 'REQUIREMENTS_INSIGHTS']);
export const RETIRED_MODES = Object.freeze([
  'DECOMPOSITION_WITH_INSIGHTS',
  'STANDARD_RESEARCH',
  'AGENT_RESEARCH',
  'MODEL_COMPARE',
  'AGENT_COMPARE',
  'PROMPT_TEST',
]);

const supported = new Set(SUPPORTED_CREATE_MODES);
const retired = new Set(RETIRED_MODES);

export function isSupportedCreateMode(mode) {
  return supported.has(mode);
}

export function isRetiredMode(mode) {
  return retired.has(mode);
}
