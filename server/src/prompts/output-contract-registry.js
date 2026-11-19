import { parseBabokOutput } from '../services/babok-requirements-contract.js';

const CONTRACTS = new Map();

function parseJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  return JSON.parse((fenced?.[1] || text).trim());
}

function requireObject(value, id) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error(`Output does not satisfy ${id}`), { type: 'OUTPUT_CONTRACT_VIOLATION' });
  }
  return value;
}

export function registerOutputContract(id, parse) {
  if (!/^[a-z][a-z0-9-]*\.v[1-9][0-9]*$/.test(id) || typeof parse !== 'function' || CONTRACTS.has(id)) {
    throw new Error(`Invalid or duplicate output contract ${id}`);
  }
  CONTRACTS.set(id, Object.freeze({ id, parse }));
}

registerOutputContract('decomposition.v1', (text) => requireObject(parseJson(text), 'decomposition.v1'));
registerOutputContract('babok-requirements.v1', parseBabokOutput);
registerOutputContract('requirements-insights.v1', (text) => {
  const value = requireObject(parseJson(text), 'requirements-insights.v1');
  if (!Array.isArray(value.insights)) throw Object.assign(new Error('insights must be an array'), { type: 'OUTPUT_CONTRACT_VIOLATION' });
  return value;
});

export function getOutputContract(id) {
  const contract = CONTRACTS.get(id);
  if (!contract) throw Object.assign(new Error(`Unsupported output contract ${id}`), { type: 'UNSUPPORTED_OUTPUT_CONTRACT' });
  return contract;
}

export function hasOutputContract(id) {
  return CONTRACTS.has(id);
}

export function outputContractIds() {
  return [...CONTRACTS.keys()].sort();
}
