// A projection-only client must not erase the six-type registry behind it.
export function overlayLegacyReview(base, requirements) {
  const registry = structuredClone(base);
  const removed = new Set();
  for (const [group, type] of Object.entries({ business: 'BR', functional: 'FR', nonfunctional: 'NFR' })) {
    const incoming = new Set(requirements[group].map((item) => item.id));
    const originals = new Map(registry.groups[type].map((item) => [item.id, item]));
    for (const id of originals.keys()) if (!incoming.has(id)) removed.add(id);
    registry.groups[type] = requirements[group].map((item) => {
      const original = originals.get(item.id);
      if (original) return { ...original, text: item.text, ...(original.text !== item.text ? { manuallyEdited: true } : {}), ...(item.researchEnhancementKey ? { fromResearch: item.fromResearch, researchEnhancementKey: item.researchEnhancementKey } : {}) };
      return { ...item, source: { artifactId: registry.materials.primary.artifactId, locator: 'manual-review', quote: null }, provenance: 'Предложено — требует подтверждения', quality: 'Требует уточнения',
        ...(type === 'BR' ? { successIndicator: null, relatedIds: [] } : { relatedTo: [] }),
        ...(type === 'NFR' ? { category: 'Не указано', scope: null, verificationMethod: null } : {}),
      };
    });
    registry.summary.counts[type] = registry.groups[type].length;
  }
  for (const record of [...Object.values(registry.groups).flat(), ...registry.context, ...['GAP', 'HYP', 'TERM'].flatMap((type) => registry.analysis[type])]) {
    for (const key of ['relatedIds', 'relatedTo', 'affectedIds']) if (Array.isArray(record[key])) record[key] = record[key].filter((id) => !removed.has(id));
  }
  registry.analysis.traceability = registry.analysis.traceability.filter((link) => !removed.has(link.from) && !removed.has(link.to));
  registry.analysis.delta = registry.analysis.delta.filter((item) => !removed.has(item.newId));
  registry.summary.counts.DELTA = registry.analysis.delta.length;
  return registry;
}
