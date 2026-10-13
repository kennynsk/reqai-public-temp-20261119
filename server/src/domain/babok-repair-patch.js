import { canonicalSha256 } from '../prompts/prompt-utils.js';
import { semanticViolation } from './babok-semantics.js';

const GROUPS = ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON'];
const ANALYSIS = ['GAP', 'HYP', 'TERM', 'DELTA', 'QUESTION'];
const collection = (value, type) => GROUPS.includes(type) ? value.groups[type] : type === 'CTX' ? value.context : value.analysis[({ DELTA: 'delta', QUESTION: 'questions' })[type] || type];
export const repairRevision = (value) => canonicalSha256(value).slice(0, 16);
const fail = (reason) => { throw semanticViolation([{ key: '$patch', code: 'SEMANTIC_PATCH_INVALID', reason, repair: 'Вернуть адресный patch заданного формата для текущей редакции.' }]); };

export function applyBabokRepairPatch(value, patch, issues) {
  if (patch?.baseRevision !== repairRevision(value) || !Array.isArray(patch.upserts) || !Array.isArray(patch.removeIds)) fail('Patch must bind the exact base revision and declare upserts/removeIds');
  const next = structuredClone(value);
  const flagged = new Set(issues.map((issue) => issue.key));
  const all = [...Object.values(next.groups).flat(), ...next.context, ...['GAP', 'HYP', 'TERM', 'delta', 'questions'].flatMap((type) => next.analysis[type])];
  const known = new Set(all.map((record) => record.id));
  const removed = new Set(patch.removeIds);
  for (const id of removed) if (!known.has(id) || !flagged.has(id)) fail('Only an existing record explicitly rejected by the audit may be removed');
  for (const type of [...GROUPS, 'CTX', ...ANALYSIS]) {
    const records = collection(next, type);
    records.splice(0, records.length, ...records.filter((record) => !removed.has(record.id)));
  }
  const seen = new Set();
  for (const entry of patch.upserts) {
    if (![...GROUPS, 'CTX', ...ANALYSIS].includes(entry?.type) || typeof entry.id !== 'string' || !entry.record || entry.record.id !== entry.id || !entry.id.startsWith(`${entry.type}-`) || seen.has(entry.id)) fail('Every upsert needs a unique typed id and the complete record with that id');
    seen.add(entry.id);
    const records = collection(next, entry.type);
    const index = records.findIndex((record) => record.id === entry.id);
    if (known.has(entry.id) && index < 0 && !removed.has(entry.id)) fail('A record cannot change its type or identity silently');
    const record = structuredClone(entry.record);
    // A split or rewritten extracted statement is a normalization, not a
    // verbatim extraction. Correct execution metadata without changing text.
    if (GROUPS.includes(entry.type) && record.provenance === 'Извлечено' && (index < 0 || records[index].text !== record.text) && record.text?.trim() !== record.source?.quote?.trim()) record.provenance = 'Нормализовано';
    if (index < 0) records.push(record); else records[index] = record;
  }
  for (const record of [...Object.values(next.groups).flat(), ...next.context, ...['GAP', 'HYP', 'TERM'].flatMap((type) => next.analysis[type])]) {
    for (const field of ['relatedIds', 'relatedTo', 'affectedIds']) if (record[field]) record[field] = record[field].filter((id) => !removed.has(id));
  }
  next.analysis.traceability = next.analysis.traceability.filter((link) => !removed.has(link.from) && !removed.has(link.to));
  if (patch.traceability !== undefined) {
    if (!Array.isArray(patch.traceability)) fail('traceability must be an array');
    next.analysis.traceability = structuredClone(patch.traceability);
  }
  next.analysis.questions = next.analysis.questions.filter((item) => !removed.has(item.gapId));
  next.analysis.delta = next.analysis.delta.filter((item) => !removed.has(item.newId));
  for (const type of GROUPS) next.summary.counts[type] = next.groups[type].length;
  for (const type of ['GAP', 'HYP', 'TERM']) next.summary.counts[type] = next.analysis[type].length;
  next.summary.counts.CTX = next.context.length; next.summary.counts.DELTA = next.analysis.delta.length;
  return next;
}

export function applyInsightRepairPatch(value, patch) {
  if (patch?.baseRevision !== repairRevision(value) || !Array.isArray(patch.insights) || !patch.insights.length) fail('Insight repair must bind the exact revision and contain corrected insights');
  const next = structuredClone(value);
  const seen = new Set();
  for (const insight of patch.insights) {
    const index = next.insights.findIndex((item) => item.id === insight?.id);
    if (index < 0 || seen.has(insight.id)) fail('Repair may replace only existing, unique insight ids');
    seen.add(insight.id); next.insights[index] = structuredClone(insight);
  }
  return next;
}
