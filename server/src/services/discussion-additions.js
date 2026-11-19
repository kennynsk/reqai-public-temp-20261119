import { ApiError } from '../errors/api-error.js';
import { deterministicSemanticIssues } from '../domain/babok-semantics.js';

const fieldsByType = {
  BR: ['text', 'successIndicator'], SR: ['text', 'role'], FR: ['text'],
  NFR: ['text', 'category', 'scope', 'verificationMethod'], TR: ['text', 'completionCriterion'], CON: ['text', 'obligation', 'scope'],
};
const invalid = (message) => { throw new ApiError({ status: 422, code: 'DISCUSSION_PROPOSAL_INVALID', message }); };
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value, max = 20000) => typeof value === 'string' && value.trim() && value.length <= max;
const defaults = (type, text) => ({ BR: { successIndicator: null }, SR: { role: null }, FR: {}, NFR: { category: 'Не указано', scope: null, verificationMethod: null }, TR: { completionCriterion: null }, CON: { obligation: text, scope: null } })[type];

export function validateDiscussionAddition(record, type, gapId) {
  if (!Object.hasOwn(fieldsByType, type) || !object(record) || !new RegExp(`^${type}-[0-9]{3,}$`).test(record.id) || !nonempty(record.text)) invalid('Invalid added requirement type, ID or text');
  const linkField = type === 'BR' ? 'relatedIds' : 'relatedTo';
  const allowed = new Set(['id', 'source', 'provenance', 'quality', linkField, ...fieldsByType[type]]);
  if (Object.keys(record).some((key) => !allowed.has(key)) || !Array.isArray(record[linkField]) || record[linkField].length !== 1 || record[linkField][0] !== gapId) invalid('Added requirement must link only to the selected GAP');
  if (record.provenance !== 'Предложено — требует подтверждения' || record.quality !== 'Требует уточнения') invalid('Added requirement cannot claim confirmed provenance or readiness');
  if (!object(record.source) || Object.keys(record.source).some((key) => !['artifactId', 'locator', 'quote'].includes(key)) || !nonempty(record.source.artifactId, 200) || record.source.locator !== `discussion:${gapId}` || record.source.quote !== null) invalid('Invalid added requirement source');
  for (const field of fieldsByType[type]) {
    if (!Object.hasOwn(record, field) || (record[field] !== null && !nonempty(record[field]))) invalid(`Invalid added requirement field ${field}`);
    if (['text', 'category', 'obligation'].includes(field) && !nonempty(record[field])) invalid(`Added requirement needs ${field}`);
  }
  return record;
}

export function normalizeDiscussionAdditions(raw = [], { registry, gapId, reservedIds = [] } = {}) {
  if (!Array.isArray(raw) || raw.length > 10) invalid('At most ten new requirements may be proposed');
  if (!raw.length) return [];
  if (!registry?.groups || !registry.analysis?.GAP?.some((gap) => gap.id === gapId)) invalid('New requirements need the full registry and selected GAP');
  const records = Object.values(registry.groups).filter(Array.isArray).flat();
  const ids = new Set([...records.map((record) => record.id), ...reservedIds]);
  const texts = new Set(records.map((record) => record.text.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
  return raw.map((item) => {
    if (!object(item) || Object.keys(item).some((key) => !['type', 'fields', 'rationale'].includes(key)) || !Object.hasOwn(fieldsByType, item.type) || !object(item.fields) || !nonempty(item.rationale, 5000)) invalid('New requirement needs type, fields and rationale, without a model-assigned ID');
    if (!nonempty(item.fields.text) || Object.entries(item.fields).some(([key, value]) => !fieldsByType[item.type].includes(key) || (value !== null && !nonempty(value)))) invalid('Invalid new requirement fields');
    const text = item.fields.text.trim();
    const fingerprint = text.replace(/\s+/g, ' ').toLocaleLowerCase();
    if (texts.has(fingerprint)) invalid('New requirement duplicates an existing or proposed requirement');
    texts.add(fingerprint);
    const usedNumbers = [...ids].filter((id) => id.startsWith(`${item.type}-`)).map((id) => Number(id.slice(item.type.length + 1))).filter(Number.isSafeInteger);
    const number = Math.max(0, ...usedNumbers) + 1;
    if (!Number.isSafeInteger(number)) invalid('Requirement ID range exhausted');
    const id = `${item.type}-${String(number).padStart(3, '0')}`;
    ids.add(id);
    const record = { id, ...defaults(item.type, text), ...Object.fromEntries(Object.entries(item.fields).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])),
      source: { artifactId: registry.materials?.primary?.artifactId, locator: `discussion:${gapId}`, quote: null },
      provenance: 'Предложено — требует подтверждения', quality: 'Требует уточнения', [item.type === 'BR' ? 'relatedIds' : 'relatedTo']: [gapId] };
    validateDiscussionAddition(record, item.type, gapId);
    const issues = deterministicSemanticIssues([{ key: id, type: item.type, record }]);
    if (issues.length) invalid(`Invalid new requirement meaning: ${issues.map((issue) => issue.reason).join('; ')}`);
    return { type: item.type, record, rationale: item.rationale.trim() };
  });
}
