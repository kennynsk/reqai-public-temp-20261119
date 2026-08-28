import { validateBabokRegistry } from './babok-requirements-contract.js';

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

function source(citation) {
  if (!citation) return '—';
  const location = citation.locator ? `${citation.artifactId}, ${citation.locator}` : citation.artifactId;
  return citation.quote ? `${cell(location)}: «${cell(citation.quote)}»` : cell(location);
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

function renderSummary(registry) {
  const counts = ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON', 'GAP']
    .map((type) => `${type}: ${registry.summary.counts[type]}`)
    .join(', ');
  const parts = [`${counts}.`];
  if (registry.summary.text) parts.push(registry.summary.text);
  if (registry.summary.conclusions.length) parts.push(list(registry.summary.conclusions));
  return ['## Краткое резюме', '', parts.join('\n\n')].join('\n');
}

function renderContext(registry) {
  return ['## 1. Контекст и связанные артефакты', '', table(
    ['ID', 'Вид', 'Формулировка', 'Источник'],
    registry.context.map((item) => [item.id, item.kind, item.text, source(item.source)]),
  )].join('\n');
}

function renderRequirementSection(type, title, records) {
  const headers = {
    BR: ['ID', 'Формулировка', 'Показатель успеха', 'Источник', 'Происхождение', 'Качество'],
    SR: ['ID', 'Роль', 'Формулировка', 'Связано с БТ', 'Источник', 'Происхождение', 'Качество'],
    FR: ['ID', 'Формулировка', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    NFR: ['ID', 'Категория', 'Формулировка', 'Область действия', 'Источник', 'Происхождение', 'Качество'],
    TR: ['ID', 'Формулировка', 'Критерий завершения', 'Связано с', 'Источник', 'Качество'],
    CON: ['ID', 'Обязательство', 'Источник и реквизиты', 'Область', 'Качество'],
  }[type];
  const rows = records.map((item) => {
    if (type === 'BR') return [item.id, item.text, item.successIndicator, source(item.source), item.provenance, item.quality];
    if (type === 'SR') return [item.id, item.role, item.text, item.relatedTo.join(', '), source(item.source), item.provenance, item.quality];
    if (type === 'FR') return [item.id, item.text, item.relatedTo.join(', '), source(item.source), item.provenance, item.quality];
    if (type === 'NFR') return [item.id, item.category, item.text, item.scope, source(item.source), item.provenance, item.quality];
    if (type === 'TR') return [item.id, item.text, item.completionCriterion, item.relatedTo.join(', '), source(item.source), item.quality];
    return [item.id, item.obligation, `${source(item.source)}; ${item.text}`, item.scope, item.quality];
  });
  return [`## ${title}`, '', table(headers, rows)].join('\n');
}

function renderDelta(registry) {
  if (registry.materials.baseline.status !== 'AVAILABLE') {
    return ['## 8. Сравнение с существующим набором', '', 'Сравнение невозможно: существующий набор требований не предоставлен.'].join('\n');
  }
  return ['## 8. Сравнение с существующим набором', '', table(
    ['ID в базовом наборе', 'Новый ID', 'Вид изменения', 'Комментарий'],
    registry.analysis.delta.map((item) => [item.baselineId, item.newId, item.kind, item.comment]),
  )].join('\n');
}

function shortLabel(record) {
  const text = cell(record.text);
  const label = text.length > 96 ? `${text.slice(0, 95)}…` : text;
  return `${record.id} ${label}`;
}

function renderTraceability(registry) {
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
  for (const record of records) {
    if (record.id.startsWith('BR-')) {
      for (const child of record.relatedIds || []) if (children.has(child)) children.get(record.id).push(child);
      continue;
    }
    for (const parent of record.relatedTo || []) if (children.has(parent)) children.get(parent).push(record.id);
  }
  const lines = [];
  const renderedIds = new Set();
  const renderNode = (id, prefix = '', branch = '', tail = true, ancestors = new Set()) => {
    if (ancestors.has(id) || renderedIds.has(id) || !byId.has(id)) return;
    renderedIds.add(id);
    lines.push(`${prefix}${branch}${shortLabel(byId.get(id))}`);
    const next = [...new Set(children.get(id) || [])];
    const childPrefix = `${prefix}${branch ? (tail ? '    ' : '│   ') : ''}`;
    next.forEach((child, index) => renderNode(child, childPrefix, index === next.length - 1 ? '└── ' : '├── ', index === next.length - 1, new Set([...ancestors, id])));
  };
  const roots = registry.groups.BR.length ? registry.groups.BR.map((item) => item.id) : records.filter((record) => !(record.relatedTo || []).length).map((item) => item.id);
  roots.forEach((id) => renderNode(id));
  for (const record of records) if (!renderedIds.has(record.id)) renderNode(record.id);
  const supplemental = registry.analysis.traceability.filter((link) => link.status === 'Предполагается');
  return [
    '## 9. Трассировка',
    '',
    lines.length ? `\`\`\`text\n${lines.join('\n')}\n\`\`\`` : 'Не обнаружено',
    ...(supplemental.length ? ['', table(['От', 'К', 'Тип связи', 'Статус'], supplemental.map((link) => [link.from, link.to, link.relation, link.status]))] : []),
  ].join('\n');
}

function renderAnalysis(registry) {
  const { GAP, HYP, TERM } = registry.analysis;
  const records = [
    ...GAP.map((item) => [item.id, 'GAP', item.text, item.affectedIds.join(', '), item.nextStep, source(item.source)]),
    ...HYP.map((item) => [item.id, 'HYP', item.text, item.affectedIds.join(', '), item.nextStep, source(item.source)]),
    ...TERM.map((item) => [item.id, 'TERM', `${item.term}: ${item.meaning || 'значение не определено'}`, item.affectedIds.join(', '), item.nextStep, source(item.source)]),
  ];
  return ['## 10. Пробелы, гипотезы и термины', '', table(['ID', 'Вид', 'Суть', 'Затронутые ID', 'Следующий шаг', 'Источник'], records)].join('\n');
}

function renderQuestions(registry) {
  return ['## 11. Вопросы для уточнения', '', table(
    ['Приоритет / GAP', 'Адресат', 'Вопрос'],
    registry.analysis.questions.map((item) => [`${item.priority} / ${item.gapId}`, item.addressee, item.text]),
  )].join('\n');
}

export function renderBabokReport(registry) {
  const value = validateBabokRegistry(registry);
  return [
    '# Отчёт о декомпозиции требований (BABOK v3)',
    renderSummary(value),
    renderContext(value),
    ...REQUIREMENT_SECTIONS.map(([type, title]) => renderRequirementSection(type, title, value.groups[type])),
    renderDelta(value),
    renderTraceability(value),
    renderAnalysis(value),
    renderQuestions(value),
  ].join('\n\n');
}
