// Completeness is separate from the quality assigned to existing records.
import { currentGapClarification } from './gap-review-state.js';
export function decompositionCoverage(content, decisions = {}) {
  const review = decisions.review || {};
  const records = Object.entries(content.groups || {}).flatMap(([type, items]) => items.map((record) => ({ type, ...record })));
  const byId = new Map(records.map((record) => [record.id, record]));
  const links = new Set();
  for (const record of records) for (const id of [...(record.relatedTo || []), ...(record.relatedIds || [])]) if (byId.has(id)) { links.add(`${record.id}:${id}`); links.add(`${id}:${record.id}`); }
  for (const link of content.analysis?.traceability || []) if (byId.has(link.from) && byId.has(link.to) && !/конфликт|замен|завис|conflict|replac|depend/iu.test(link.relation || '')) { links.add(`${link.from}:${link.to}`); links.add(`${link.to}:${link.from}`); }
  const related = (record, types) => records.some((other) => types.includes(other.type) && links.has(`${record.id}:${other.id}`));
  const breaks = [];
  for (const record of records) {
    if (record.type === 'BR' && !related(record, ['SR', 'FR', 'NFR', 'TR'])) breaks.push({ id: record.id, reason: 'Нет декомпозиции в SR/FR/NFR или обеспечивающего переход TR.' });
    if (record.type === 'SR') {
      if (!related(record, ['BR'])) breaks.push({ id: record.id, reason: 'Не указано бизнес-основание.' });
      if (!related(record, ['FR', 'NFR'])) breaks.push({ id: record.id, reason: 'Нет покрытия FR/NFR.' });
    }
    if (['FR', 'NFR'].includes(record.type) && !related(record, ['SR', 'BR'])) breaks.push({ id: record.id, reason: 'Не указана родительская потребность или бизнес-основание.' });
    if (record.type === 'CON' && !related(record, ['BR', 'SR', 'FR', 'NFR', 'TR']) && !record.scope?.trim()) breaks.push({ id: record.id, reason: 'Не указаны область действия и ограничиваемые элементы.' });
  }
  const openGaps = (content.analysis?.GAP || []).filter((gap) => review.gaps?.[gap.id]?.state !== 'closed' || review.gaps?.[gap.id]?.stale).map(({ id, text }) => ({ id, text }));
  const omissions = (review.omissions || []).filter((item) => !item.requirementIds?.length);
  const pendingRequirements = openGaps.flatMap((gap) => (currentGapClarification(review, gap.id)?.remainingQuestions || []).filter((text) => /(?:добавить|выделить|создать).{0,40}требован/iu.test(text)).map((text) => ({ gapId: gap.id, text })));
  const unconfirmedLinks = (content.analysis?.traceability || []).filter((link) => byId.has(link.from) && byId.has(link.to) && link.status === 'Предполагается');
  const partialSource = content.scope?.partial === true || content.outcome === 'PARTIAL';
  return { ready: records.filter((record) => record.quality === 'Готово').length, total: records.length, openGaps, breaks, omissions, pendingRequirements, unconfirmedLinks, partialSource, incomplete: Boolean(openGaps.length || breaks.length || omissions.length || pendingRequirements.length || partialSource) };
}
