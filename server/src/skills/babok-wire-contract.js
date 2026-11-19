import Ajv from 'ajv';
import { BABOK_OUTPUT_CONTRACT } from '../services/babok-requirements-contract.js';

const object = (properties) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const array = (items) => ({ type: 'array', items });
const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
const string = { type: 'string', minLength: 1, pattern: '\\S' };
const citation = object({ artifactId: string, locator: string, quote: nullable(string) });

// Compile the same field declarations used by the registry contract. Enum
// alternatives describe ONE string, never a list of values in the response.
function field(value) {
  if (Array.isArray(value)) return { type: 'string', enum: [...value] };
  if (value && typeof value === 'object') return object(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, field(item)])));
  if (value.endsWith('|null')) return nullable(field(value.slice(0, -5)));
  if (value.endsWith('[]')) return array(field(value.slice(0, -2)));
  if (value === 'citation') return citation;
  if (value === 'integer') return { type: 'integer', minimum: 0 };
  if (value === 'boolean') return { type: 'boolean' };
  if (value === 'record-id') return { ...string, pattern: '^[A-Z]+-[0-9]{3,}$' };
  if (value.endsWith('-###')) return { ...string, pattern: `^${value.slice(0, -3)}[0-9]{3,}$` };
  if (value === 'string') return string;
  return { const: value, type: 'string' };
}

// Materials, execution scope and counters belong to the server.
// They are deliberately absent from the model's required response.
export const BABOK_MODEL_JSON_SCHEMA = object({
  schemaVersion: field(BABOK_OUTPUT_CONTRACT.schemaVersion),
  mode: field(BABOK_OUTPUT_CONTRACT.mode),
  outcome: field(BABOK_OUTPUT_CONTRACT.outcome),
  summary: object({ text: nullable({ type: 'string' }), conclusions: array(string) }),
  context: array(object({ ...field(BABOK_OUTPUT_CONTRACT.context).properties, source: nullable(citation) })),
  groups: object(Object.fromEntries(Object.entries(BABOK_OUTPUT_CONTRACT.groups).map(([key, record]) => [key, array(field(record))]))),
  analysis: object(Object.fromEntries(Object.entries(BABOK_OUTPUT_CONTRACT.analysis).map(([key, record]) => [key, array(field(record))]))),
});

// Lossless transport compatibility only: unwrap a singleton enum if its sole
// value is valid. Never guess statuses, discard links or repair semantic facts.
export function normalizeBabokWireResponse(value) {
  const result = structuredClone(value);
  function visit(item, schema) {
    if (!item || typeof item !== 'object' || !schema) return;
    if (schema.type === 'array' && Array.isArray(item)) {
      item.forEach((entry) => visit(entry, schema.items));
    } else if (schema.type === 'object' && !Array.isArray(item)) {
      for (const [key, child] of Object.entries(schema.properties)) {
        if (child.enum && Array.isArray(item[key]) && item[key].length === 1 && child.enum.includes(item[key][0])) item[key] = item[key][0];
        else if (child.anyOf?.some((branch) => branch.type === 'null')) {
          if (item[key] === undefined || (typeof item[key] === 'string' && !item[key].trim())) item[key] = null;
          else visit(item[key], child.anyOf.find((branch) => branch.type !== 'null'));
        } else visit(item[key], child);
      }
    }
  }
  visit(result, BABOK_MODEL_JSON_SCHEMA);
  return result;
}


// Accept existing full envelopes and extension fields without deleting them.
// The generated prompt is strict; runtime compatibility checks all known fields.
const compatibilitySchema = structuredClone(BABOK_MODEL_JSON_SCHEMA);
function allowExtensions(schema) {
  if (schema.type === 'object') {
    schema.additionalProperties = true;
    Object.values(schema.properties).forEach(allowExtensions);
  }
  if (schema.items) allowExtensions(schema.items);
  schema.anyOf?.forEach(allowExtensions);
}
allowExtensions(compatibilitySchema);
const validateShape = new Ajv({ allErrors: true, strict: true }).compile(compatibilitySchema);

export function prepareBabokWireResponse(value) {
  const normalized = normalizeBabokWireResponse(value);
  if (!validateShape(normalized)) {
    const errors = validateShape.errors;
    const issues = errors.slice(0, 50).map((error) => ({
      path: `$${error.instancePath.split('/').slice(1).map((part) => /^\d+$/.test(part) ? `[${part}]` : `.${part.replace(/~1/g, '/').replace(/~0/g, '~')}`).join('')}${error.keyword === 'required' ? `.${error.params.missingProperty}` : ''}`,
      reason: `${error.message}; ${JSON.stringify(error.params)}`,
    }));
    throw Object.assign(new Error('BABOK response does not match the wire schema'), {
      type: 'OUTPUT_CONTRACT_VIOLATION', code: 'BABOK_OUTPUT_INVALID',
      details: { ...issues[0], issues, totalIssues: errors.length },
    });
  }
  return normalized;
}
