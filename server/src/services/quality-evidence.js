// Both generation and persistence check exact citations, before semantic review.
export function validateQualityEvidence(item, context) {
  const records = new Map(context.records.map((record) => [record.id, record]));
  const known = new Set([...records.keys(), ...context.gaps.map((gap) => gap.id)]);
  const refs = item.reason.match(/\b(?:BR|SR|FR|NFR|TR|CON|GAP)-[A-Za-z0-9-]+\b/g) || [];
  if (refs.some((id) => !known.has(id))) throw new Error(`${item.id}: основание ссылается на несуществующую запись.`);
  if (!Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 10) throw new Error(`${item.id}: нужны точные свидетельства из текущего реестра.`);
  for (const citation of item.evidence) {
    const record = records.get(citation?.recordId);
    if (!record || typeof citation.field !== 'string' || !Object.hasOwn(record, citation.field) || typeof record[citation.field] !== 'string' || typeof citation.quote !== 'string' || !citation.quote.trim() || citation.quote.length > 1000 || !record[citation.field].includes(citation.quote) || ['quality', 'type', 'id', 'provenance'].includes(citation.field)) throw new Error(`${item.id}: свидетельство должно точно цитировать содержательное поле существующего требования.`);
  }
  if (!item.evidence.some((citation) => citation.recordId === item.id)) throw new Error(`${item.id}: нет свидетельства из оцениваемого требования.`);
  const evidence = item.evidence.map(({ recordId, field, quote }) => ({ recordId, field, quote }));
  // Presence is deterministic; the independent critic still verifies whether
  // this real record supports the claim. Never synthesize a missing record.
  for (const id of new Set(refs)) if (records.has(id) && !evidence.some((citation) => citation.recordId === id)) {
    const text = records.get(id).text;
    if (typeof text !== 'string' || !text.trim()) throw new Error(`${item.id}: у указанного требования нет поля text для свидетельства.`);
    evidence.push({ recordId: id, field: 'text', quote: text.slice(0, 1000) });
  }
  return evidence;
}
