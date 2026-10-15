// Both generation and persistence check exact citations, before semantic review.
export function validateQualityEvidence(item, context) {
  const records = new Map(context.records.map((record) => [record.id, record]));
  const known = new Set([...records.keys(), ...context.gaps.map((gap) => gap.id)]);
  const refs = item.reason.match(/\b(?:BR|SR|FR|NFR|TR|CON|GAP)-[A-Za-z0-9-]+\b/g) || [];
  if (refs.some((id) => !known.has(id))) throw new Error(`${item.id}: основание ссылается на несуществующую запись.`);
  if (!Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > 10) throw new Error(`${item.id}: нужны точные свидетельства из текущего реестра.`);
  for (const [index, citation] of item.evidence.entries()) {
    const record = records.get(citation?.recordId);
    if (!record || typeof citation.field !== 'string' || !Object.hasOwn(record, citation.field) || typeof record[citation.field] !== 'string' || typeof citation.quote !== 'string' || !citation.quote.trim() || citation.quote.length > 1000 || !record[citation.field].includes(citation.quote) || ['quality', 'type', 'id', 'provenance'].includes(citation.field)) {
      const bounded = (value, limit) => JSON.stringify(typeof value === 'string' ? value.slice(0, limit) : value == null ? null : '[не строка]');
      const field = citation?.field;
      const source = record && typeof field === 'string' && Object.hasOwn(record, field) ? record[field] : undefined;
      const usable = typeof source === 'string' && source.trim() && !['quality', 'type', 'id', 'provenance'].includes(field);
      const sourceHint = usable
        ? `Начало исходного поля (до 600 символов): ${bounded(source, 600)}.`
        : `Поле отсутствует, пусто, не является строкой или не допускается для цитирования. Его значение: ${typeof source === 'string' || source == null ? bounded(source, 120) : '[не строка]'}. ${typeof record?.text === 'string' ? `Существующее поле text (до 600 символов): ${bounded(record.text, 600)}.` : 'Выберите существующий recordId и строковое поле из контекста.'}`;
      throw new Error(`${item.id}: evidence[${index}] recordId=${bounded(citation?.recordId, 80)}, field=${bounded(field, 80)}, quote=${bounded(citation?.quote, 160)}: свидетельство должно точно цитировать содержательное поле существующего требования (1–1000 символов, без перефразирования). ${sourceHint} Отсутствие значения опишите в reason; не цитируйте null или выдуманный текст. Исправьте evidence самостоятельно по данным контекста.`);
    }
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
