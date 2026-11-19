import { parseModelJson } from '../domain/model-json.js';
import { BABOK_REQUIREMENT_TYPES, BABOK_TRACEABILITY_STATUSES } from './babok-requirements-contract.js';
import { isBabokTextDraft } from './babok-text-draft.js';

const rows = (value) => Array.isArray(value) ? value : [];
const text = (value) => typeof value === 'string' && value.trim() || null;
const related = (record) => rows(record.relatedIds || record.relatedTo);
const recordKey = (type, formulation) => JSON.stringify([type, formulation]);
const traceRecords = (registry) => [...Object.values(registry.groups).flat(), ...registry.analysis.GAP];
const pairKey = ({ from, to }) => JSON.stringify([from, to]);
const structuredFields = {
  BR: ['successIndicator'], SR: ['role'], FR: [],
  NFR: ['category', 'scope', 'verificationMethod'], TR: ['completionCriterion'], CON: ['obligation', 'scope'],
};

function citationsFor({ materials, scope }) {
  const evidenceIds = new Set([materials.primary, ...materials.baseline.artifacts, ...materials.references, ...scope.units]
    .map((material) => material?.artifactId));
  return (source) => text(source?.artifactId) && evidenceIds.has(source.artifactId) && text(source.locator)
    ? { artifactId: source.artifactId, locator: source.locator.trim(), quote: text(source.quote) }
    : null;
}

function restoreTraceability(saved, original) {
  const currentRecords = traceRecords(saved);
  const byId = new Map(currentRecords.map((record) => [record.id, record]));
  const byText = new Map(currentRecords.map((record) => [recordKey(record.id.split('-')[0], record.text), record]));
  const originalById = new Map(traceRecords(original).map((record) => [record.id, record]));
  const resolve = (record) => byText.get(recordKey(record.id.split('-')[0], record.text)) || byId.get(record.id);
  const links = new Set(saved.analysis.traceability.map(pairKey));
  const references = (left, right) => related(left).includes(right.id) || related(right).includes(left.id)
    || left.affectedIds?.includes(right.id) || right.affectedIds?.includes(left.id);
  const citation = citationsFor(saved);
  const restored = [];
  for (const link of original.analysis.traceability) {
    const previousFrom = originalById.get(link.from);
    const previousTo = originalById.get(link.to);
    const from = resolve(previousFrom);
    const to = resolve(previousTo);
    if (!from || !to || from.id === to.id) continue;
    // A retained reference identifies endpoints even after text edits. For typed-only
    // edges, require the original formulations to avoid guessing from reused IDs.
    const exactMatch = from.text === previousFrom.text && to.text === previousTo.text;
    if (!references(from, to) && (!exactMatch || references(previousFrom, previousTo))) continue;
    const restoredLink = { ...link, from: from.id, to: to.id, source: citation(link.source) };
    if (!links.has(pairKey(restoredLink))) restored.push(restoredLink);
  }
  return restored.length ? { ...saved, analysis: { ...saved.analysis, traceability: [...saved.analysis.traceability, ...restored] } } : saved;
}

export function projectBabokRecovery(result, base = result.manualRegistry, decisions = {}, reservedIds = []) {
  const draft = result.recovery?.draft;
  if (!isBabokTextDraft(draft)) return { registry: base, hasUnclassified: false };

  const imported = decisions.recoveryImported === true || decisions.skippedResearch === true;
  const restoreLinks = imported && !decisions.skippedResearch && !decisions.recoveryTraceabilityImported;
  if (restoreLinks) {
    const { registry, hasUnclassified } = projectBabokRecovery(result);
    return { registry: restoreTraceability(base, registry), hasUnclassified };
  }
  const registry = imported ? base : structuredClone(base);
  const records = Object.values(registry.groups).flat();
  const existingIds = new Set(records.map(({ id }) => id));
  const byText = new Map(BABOK_REQUIREMENT_TYPES.flatMap((type) =>
    registry.groups[type].map((record) => [recordKey(type, record.text), record.id])));
  const lastNumber = new Map();
  for (const id of [...existingIds, ...reservedIds, ...[...registry.analysis.GAP, ...registry.analysis.questions].map((record) => record.id)]) {
    const [type, number] = id.split('-');
    lastNumber.set(type, Math.max(lastNumber.get(type) || 0, Number(number) || 0));
  }
  function nextId(type) {
    const next = (lastNumber.get(type) || 0) + 1;
    lastNumber.set(type, next);
    return `${type}-${String(next).padStart(3, '0')}`;
  }

  const materials = registry.materials;
  const citation = citationsFor(registry);
  const knownLinks = new Set(registry.analysis.traceability.map((link) => JSON.stringify(link)));

  const legacyKeys = new Map();
  let hasUnclassified = false;
  for (const response of draft.responses) {
    let section;
    try { section = parseModelJson(response); } catch { /* The original response remains available. */ }
    if (!section?.groups || Object.entries(section.groups).some(([type, items]) => !BABOK_REQUIREMENT_TYPES.includes(type) || !Array.isArray(items))) hasUnclassified = true;
    if (imported) continue;

    // Match the old queue's positions, including its untyped entries.
    if (section === undefined && !/^\s*(?:[[{]|```)/u.test(response)) {
      for (const paragraph of response.split(/\n\s*\n/u).map(text).filter(Boolean)) {
        const key = recordKey('', paragraph);
        if (!legacyKeys.has(key)) legacyKeys.set(key, legacyKeys.size);
      }
    }

    const sectionIds = new Map();
    const targetsByLink = new Map();
    const additions = [];
    for (const type of BABOK_REQUIREMENT_TYPES) {
      for (const entry of rows(section?.groups?.[type])) {
        const formulation = text(entry?.text);
        if (!formulation) { hasUnclassified = true; continue; }
        const key = recordKey(type, formulation);
        if (!legacyKeys.has(key)) legacyKeys.set(key, legacyKeys.size);
        const accepted = decisions.recoveryAdded?.[legacyKeys.get(key)];
        let id = existingIds.has(accepted) ? accepted : byText.get(key);
        if (!id) {
          id = nextId(type);
          const record = {
            id, text: formulation,
            source: citation(entry.source) || { artifactId: materials.primary.artifactId, locator: 'recovered-draft', quote: null },
            provenance: 'Предложено — требует подтверждения',
            quality: ['Конфликтует', 'Не тестируемо'].includes(entry.quality) ? entry.quality : 'Требует уточнения',
            [type === 'BR' ? 'relatedIds' : 'relatedTo']: [],
            ...Object.fromEntries(structuredFields[type].map((field) => [field, text(entry[field])])),
          };
          if (type === 'NFR') record.category ||= 'Не указано';
          if (type === 'CON') record.obligation ||= formulation;
          registry.groups[type].push(record);
          byText.set(key, id);
          additions.push({ entry, record, type });
        }
        // An ambiguous ID cannot support links to either occurrence.
        if (text(entry.id)) sectionIds.set(entry.id, sectionIds.has(entry.id) ? null : id);
        for (const link of related(entry)) {
          if (!targetsByLink.has(link)) targetsByLink.set(link, new Set());
          targetsByLink.get(link).add(id);
        }
      }
    }

    for (const gap of rows(section?.analysis?.GAP)) {
      const questions = rows(section.analysis.questions).filter((question) => gap?.id && question?.gapId === gap.id && text(question.text));
      const formulation = text(gap?.text) || text(questions[0]?.text);
      if (!formulation) continue;
      const affectedIds = new Set([...rows(gap.affectedIds).map((id) => sectionIds.get(id)).filter(Boolean), ...(targetsByLink.get(gap.id) || [])]);
      if (!affectedIds.size) continue;

      const id = nextId('GAP');
      registry.analysis.GAP.push({ id, text: formulation, affectedIds: [...affectedIds], nextStep: text(gap.nextStep), source: citation(gap.source) });
      if (text(gap.id)) sectionIds.set(gap.id, id);
      for (const question of questions) {
        registry.analysis.questions.push({
          id: nextId('QUESTION'), gapId: id, text: question.text.trim(),
          priority: ['P0', 'P1', 'P2'].includes(question.priority) ? question.priority : 'P2',
          addressee: text(question.addressee) || 'Не указан',
        });
      }
    }
    for (const { entry, record, type } of additions) {
      record[type === 'BR' ? 'relatedIds' : 'relatedTo'] = [...new Set(related(entry).map((id) => sectionIds.get(id)).filter((id) => id && id !== record.id))];
    }
    for (const link of rows(section?.analysis?.traceability)) {
      const from = sectionIds.get(link?.from);
      const to = sectionIds.get(link?.to);
      const relation = text(link?.relation);
      if (!from || !to || from === to || !relation || !BABOK_TRACEABILITY_STATUSES.includes(link.status)) continue;
      const edge = { from, to, relation, status: link.status, source: citation(link.source) };
      const key = JSON.stringify(edge);
      if (knownLinks.has(key)) continue;
      knownLinks.add(key);
      registry.analysis.traceability.push(edge);
    }
  }
  if (imported) return { registry: base, hasUnclassified };
  for (const type of BABOK_REQUIREMENT_TYPES) registry.summary.counts[type] = registry.groups[type].length;
  registry.summary.counts.GAP = registry.analysis.GAP.length;
  return { registry, hasUnclassified };
}
