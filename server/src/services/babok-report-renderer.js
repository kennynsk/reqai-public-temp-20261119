import { collectBabokQualityIssues, validateBabokRegistry } from './babok-requirements-contract.js';
import { gapStatus, remainingQuestions } from './gap-review-state.js';

const REQUIREMENT_SECTIONS = Object.freeze([
  ['BR', '2. Бизнес-требования'],
  ['SR', '3. Требования заинтересованных сторон'],
  ['FR', '4. Функциональные требования'],
  ['NFR', '5. Нефункциональные требования'],
  ['TR', '6. Переходные требования'],
  ['CON', '7. Обязательные ограничения'],
]);

function cell(value) {
  if (value == null || value === '') return '—';
  return String(value).replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

function source(citation, registry) {
  if (!citation) return '—';
  const materials = registry?.materials;
  const descriptor = [materials?.primary, ...(materials?.baseline.artifacts || []), ...(materials?.references || [])]
    .find((item) => item?.artifactId === citation.artifactId);
  const defaultName = descriptor?.role === 'baseline' ? 'Базовый набор' : descriptor?.role === 'reference' ? 'Справочный материал' : 'Исходный документ';
  const name = descriptor?.name && !/^(Inline business context|Primary source|Reference material|Baseline source)$/i.test(descriptor.name) ? descriptor.name : defaultName;
  const location = citation.locator ? `${name}, ${citation.locator}` : name;
  return citation.quote ? `${location}: «${citation.quote}»` : location;
}

function table(headers, rows) {
  if (!rows.length) return 'Не обнаружено';
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function list(values) {
  return values.map((value) => `- ${cell(value)}`).join('\n');
}

function renderSummary(registry, review) {
  const counts = ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON', 'GAP']
    .map((type) => `${type}: ${registry.summary.counts[type]}`)
    .join(', ');
  const parts = [`${counts}.`];
  const closed = registry.analysis.GAP.filter((gap) => review.gaps?.[gap.id]?.state === 'closed').length;
  parts.push(`Вопросы в текущей редакции: ${registry.analysis.GAP.length - closed} открыто, ${closed} закрыто.`);
  if (registry.summary.text || registry.summary.conclusions.length) parts.push('### Исходное резюме декомпозиции\n\nИсторический снимок до ручных правок и ответов. Выводы ниже не являются текущим статусом требований.');
  if (registry.summary.text) parts.push(registry.summary.text);
  if (registry.summary.conclusions.length) parts.push(list(registry.summary.conclusions));
  return ['## Краткое резюме', '', parts.join('\n\n')].join('\n');
}

function renderContext(registry) {
  return ['## 1. Контекст и связанные артефакты', '', table(
    ['ID', 'Вид', 'Формулировка', 'Источник'],
    registry.context.map((item) => [item.id, item.kind, item.text, source(item.source, registry)]),
  )].join('\n');
}

function gapIdsFor(registry, record, review = {}) {
  return registry.analysis.GAP.filter((gap) => gap.affectedIds.includes(record.id)
    || [...(record.relatedIds || []), ...(record.relatedTo || [])].includes(gap.id)).filter((gap) => review.gaps?.[gap.id]?.state !== 'closed').map((gap) => gap.id);
}

function renderRequirementSection(type, title, records, registry, review) {
  const headers = {
    BR: ['ID', 'Формулировка', 'Показатель успеха', 'Источник', 'Происхождение', 'Качество'],
    SR: ['ID', 'Роль', 'Формулировка', 'Связано с БТ', 'Источник', 'Происхождение', 'Качество'],
    FR: ['ID', 'Формулировка', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    NFR: ['ID', 'Категория', 'Формулировка', 'Область действия', 'Источник', 'Происхождение', 'Качество'],
    TR: ['ID', 'Формулировка', 'Критерий завершения', 'Связано с', 'Источник', 'Качество'],
    CON: ['ID', 'Обязательство', 'Источник и реквизиты', 'Область', 'Качество'],
  }[type];
  const rows = records.map((item) => {
    const gaps = gapIdsFor(registry, item, review);
    const quality = item.quality === 'Требует уточнения' && gaps.length ? `${item.quality} (${gaps.join(', ')})` : item.quality;
    if (type === 'BR') return [item.id, item.text, item.successIndicator, source(item.source, registry), item.provenance, quality];
    if (type === 'SR') return [item.id, item.role, item.text, item.relatedTo.join(', '), source(item.source, registry), item.provenance, quality];
    if (type === 'FR') return [item.id, item.text, item.relatedTo.join(', '), source(item.source, registry), item.provenance, quality];
    if (type === 'NFR') return [item.id, item.category, `${item.text}${item.verificationMethod ? ` Проверка: ${item.verificationMethod}` : ''}`, item.scope, source(item.source, registry), item.provenance, quality];
    if (type === 'TR') return [item.id, item.text, item.completionCriterion, item.relatedTo.join(', '), source(item.source, registry), quality];
    return [item.id, item.obligation, `${source(item.source, registry)}; ${item.text}`, item.scope, quality];
  });
  return [`## ${title}`, '', table(headers, rows)].join('\n');
}

function renderDelta(registry) {
  if (registry.materials.baseline.status !== 'AVAILABLE') {
    return ['## 8. Сравнение с существующим набором', '', registry.materials.baseline.status === 'UNAVAILABLE' ? 'Сравнение невозможно: существующий набор требований недоступен.' : 'Сравнение невозможно: существующий набор требований не предоставлен.'].join('\n');
  }
  return ['## 8. Сравнение с существующим набором', '', table(
    ['ID в базовом наборе', 'Новый ID', 'Вид изменения', 'Комментарий'],
    registry.analysis.delta.filter((item) => item.kind !== 'дубликат').map((item) => [item.baselineId, item.newId, item.kind, item.comment]),
  )].join('\n');
}

function shortLabel(record) {
  const text = cell(record.text);
  const label = text.length > 96 ? `${text.slice(0, 95)}…` : text;
  return `${record.id} ${label}`;
}

export function buildBabokTraceability(registry) {
  const records = [
    ...registry.groups.BR,
    ...registry.groups.SR,
    ...registry.groups.FR,
    ...registry.groups.NFR,
    ...registry.groups.TR,
    ...registry.groups.CON,
  ];
  const byId = new Map(records.map((record) => [record.id, record]));
  const children = new Map(records.map((record) => [record.id, []]));
  const hierarchy = (from, to) => (from.startsWith('BR-') && /^(SR|NFR)-/.test(to))
    || (from.startsWith('SR-') && /^(FR|NFR)-/.test(to));
  const crossRelation = (relation) => /конфликт|завис|замен|исключ|огранич|обеспеч/i.test(relation || '');
  const links = [...registry.analysis.traceability];
  // relatedTo is a generic relationship, not necessarily a parent pointer.
  // Preserve untyped references without inventing evidence or hierarchy.
  for (const record of records) {
    const pairs = record.id.startsWith('BR-')
      ? (record.relatedIds || []).map((id) => [record.id, id])
      : (record.relatedTo || []).map((id) => hierarchy(id, record.id) ? [id, record.id] : [record.id, id]);
    for (const [from, to] of pairs) {
      if (!byId.has(from) || !byId.has(to) || links.some((link) =>
        (link.from === from && link.to === to) || (link.from === to && link.to === from))) continue;
      links.push({ from, to, relation: 'Связано с', status: 'Статус не указан' });
    }
  }
  const treeLinks = new Map();
  for (const link of links) {
    if (!hierarchy(link.from, link.to) || !/^(обосновыва|реализу|уточня)/i.test(link.relation || '') || crossRelation(link.relation)
      || !children.has(link.from) || !byId.has(link.to)) continue;
    children.get(link.from).push(link.to);
    treeLinks.set(`${link.from}|${link.to}`, link);
  }
  const renderedIds = new Set();
  const treeEdges = new Map();
  const visit = (id, incoming = null) => {
    if (renderedIds.has(id) || !byId.has(id)) return null;
    renderedIds.add(id);
    const nodes = [];
    for (const child of new Set(children.get(id) || [])) {
      const node = visit(child, treeLinks.get(`${id}|${child}`));
      if (node) { treeEdges.set(`${id}|${child}`, node.incoming); nodes.push(node); }
    }
    const hierarchyNote = incoming?.from.startsWith('BR-') && id.startsWith('NFR-')
      ? 'Общее NFR: прямая связь с бизнес-целью, без промежуточного SR' : null;
    return { record: byId.get(id), incoming, children: nodes, hierarchyNote };
  };
  const forest = [];
  for (const record of [...registry.groups.BR, ...records]) {
    const node = visit(record.id);
    if (node) forest.push(node);
  }
  const supplemental = links.filter((link) => link.status !== 'Подтверждено источником'
    || !treeEdges.has(`${link.from}|${link.to}`) || crossRelation(link.relation));
  const outsideTree = links.filter((link) => {
    const displayed = treeEdges.get(`${link.from}|${link.to}`);
    return !displayed || displayed.relation !== link.relation || displayed.status !== link.status;
  });
  return { forest, supplemental, links, outsideTree };
}

function renderTraceability(registry, review) {
  const { forest, supplemental } = buildBabokTraceability(registry);
  const lines = [];
  const renderNode = (node, prefix = '', branch = '', tail = true) => {
    const { record, incoming } = node;
    const id = record.id;
    const gaps = gapIdsFor(registry, record, review);
    const partialCoverage = /^(BR|SR)-/.test(id) && registry.analysis.GAP.some((gap) => gaps.includes(gap.id) && /scope|полнот|состав/i.test(`${gap.kind || ''} ${gap.text}`));
    const gapLabel = partialCoverage ? 'покрытие частичное' : record.quality === 'Требует уточнения' ? 'требует уточнения' : 'связанные пробелы';
    const coverage = gaps.length ? ` — ${gapLabel} (${gaps.join(', ')})` : '';
    const edgeLabel = incoming ? ` — ${incoming.relation}${incoming.status !== 'Подтверждено источником' ? ` (${incoming.status})` : ''}` : '';
    const placement = id.startsWith('CON-') ? ' — ограничение' : id.startsWith('TR-') ? ' — требование перехода' : '';
    lines.push(`${prefix}${branch}${shortLabel(record)}${edgeLabel}${node.hierarchyNote ? ` — ${node.hierarchyNote}` : ''}${placement}${coverage}`);
    const childPrefix = `${prefix}${branch ? (tail ? '    ' : '│   ') : ''}`;
    node.children.forEach((child, index) => renderNode(child, childPrefix,
      index === node.children.length - 1 ? '└── ' : '├── ', index === node.children.length - 1));
  };
  forest.forEach((node) => renderNode(node));
  if (!registry.groups.NFR.length) {
    const gaps = registry.analysis.GAP.filter((gap) => /NFR|НФТ|нефункцион|производител|безопасност|доступност|восстановлен/i.test(`${gap.kind || ''} ${gap.text}`));
    lines.push(`NFR: не обнаружено${gaps.length ? ` (${gaps.map((gap) => gap.id).join(', ')})` : ''}`);
  }
  return [
    '## 9. Трассировка',
    '',
    'Дерево показывает основную иерархию BR → SR → FR/NFR. Предположительные связи помечены. Ограничения, переходные требования и связи вне дерева приведены отдельно. Строки без отступа — отдельные корни, а не дочерние требования предыдущей строки.',
    '',
    lines.length ? `\`\`\`text\n${lines.join('\n')}\n\`\`\`` : 'Не обнаружено',
    ...(supplemental.length ? ['', table(['От', 'К', 'Тип связи', 'Статус'], supplemental.map((link) => [link.from, link.to, link.relation, link.status]))] : ['', 'Дополнительные связи не обнаружены.']),
  ].join('\n');
}

function renderAnalysis(registry, review) {
  const { GAP, HYP, TERM } = registry.analysis;
  const records = [
    ...GAP.map((item) => [item.id, 'GAP', item.text, item.affectedIds.join(', '), gapStatus(review, item.id), review.gaps?.[item.id]?.answer, review.gaps?.[item.id]?.reason || item.nextStep, source(item.source, registry)]),
    ...HYP.map((item) => [item.id, 'HYP', item.text, item.affectedIds.join(', '), 'Гипотеза', '', item.nextStep, source(item.source, registry)]),
    ...TERM.map((item) => [item.id, 'TERM', `${item.term}: ${item.meaning || 'значение не определено'}`, item.affectedIds.join(', '), 'Термин', '', item.nextStep, source(item.source, registry)]),
  ];
  return ['## 10. Пробелы, гипотезы и термины', '', 'Суть пробела сохранена из исходного анализа. Статус, ответ и решение отражают текущую редакцию.', '', table(['ID', 'Вид', 'Исходный анализ', 'Затронутые ID', 'Статус', 'Ответ', 'Решение / следующий шаг', 'Источник'], records)].join('\n');
}

function renderQuestions(registry, review) {
  return ['## 11. Вопросы для уточнения', '', table(
    ['Приоритет / GAP', 'Адресат', 'Исходный вопрос', 'Статус', 'Ответ', 'Осталось выяснить'],
    registry.analysis.questions.map((item) => [`${item.priority} / ${item.gapId}`, item.addressee, item.text, gapStatus(review, item.gapId), review.gaps?.[item.gapId]?.answer, review.gaps?.[item.gapId]?.state === 'closed' ? 'Вопрос закрыт' : remainingQuestions(review, item.gapId).join(' ') || registry.analysis.GAP.find((gap) => gap.id === item.gapId)?.nextStep || 'Получить ответ на исходный вопрос']),
  )].join('\n');
}

export function renderBabokReport(registry, { review = {} } = {}) {
  const value = validateBabokRegistry(registry);
  return [
    '# Отчёт о декомпозиции требований (BABOK v3)',
    renderSummary(value, review),
    ...(() => { const issues = collectBabokQualityIssues(value, { final: true }); return issues.length ? ['**Замечания к качеству — проверьте перед согласованием:**\n\n' + issues.map((issue) => `- ${issue.reason}`).join('\n')] : []; })(),
    renderContext(value),
    ...REQUIREMENT_SECTIONS.map(([type, title]) => renderRequirementSection(type, title, value.groups[type], value, review)),
    renderDelta(value),
    renderTraceability(value, review),
    renderAnalysis(value, review),
    renderQuestions(value, review),
  ].join('\n\n');
}
