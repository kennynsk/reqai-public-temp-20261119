import { parseBabokOutput } from './babok-requirements-contract.js';

function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  try { return JSON.parse((fenced?.[1] || text).trim()); } catch (error) {
    throw Object.assign(new Error('Decomposition result must be valid JSON'), { type: 'INVALID_DECOMPOSITION_RESULT', cause: error });
  }
}

export function readDecompositionResult(text) {
  const value = parseJson(text);
  if (value?.schemaVersion === 'babok-requirements.v1') {
    return Object.freeze({ kind: 'BABOK', schemaVersion: value.schemaVersion, value: parseBabokOutput(text) });
  }
  if (value?.schemaVersion === 1 && value?.mode === 'DECOMPOSITION' && Array.isArray(value.decomposition)) {
    return Object.freeze({ kind: 'LEGACY', schemaVersion: value.schemaVersion, value });
  }
  throw Object.assign(new Error('Unsupported decomposition result schema'), { type: 'UNSUPPORTED_DECOMPOSITION_RESULT' });
}
