import { collectBabokQualityIssues, validateBabokRegistry } from './babok-requirements-contract.js';

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
    registry.context.map((item) => [item.id, item.kind, item.text, source(item.source, registry)]),
  )].join('\n');
}

function gapIdsFor(registry, record) {
  return registry.analysis.GAP.filter((gap) => gap.affectedIds.includes(record.id)
    || [...(record.relatedIds || []), ...(record.relatedTo || [])].includes(gap.id)).map((gap) => gap.id);
}

function renderRequirementSection(type, title, records, registry) {
  const headers = {
    BR: ['ID', 'Формулировка', 'Показатель успеха', 'Источник', 'Происхождение', 'Качество'],
    SR: ['ID', 'Роль', 'Формулировка', 'Связано с БТ', 'Источник', 'Происхождение', 'Качество'],
    FR: ['ID', 'Формулировка', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    NFR: ['ID', 'Категория', 'Формулировка', 'Область действия', 'Источник', 'Происхождение', 'Качество'],
    TR: ['ID', 'Формулировка', 'Критерий завершения', 'Связано с', 'Источник', 'Качество'],
    CON: ['ID', 'Обязательство', 'Источник и реквизиты', 'Область', 'Качество'],
  }[type];
  const rows = records.map((item) => {
    const gaps = gapIdsFor(registry, item);
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
  const hierarchy = (from, to) => (from.startsWith('BR-') && to.startsWith('SR-'))
    || (from.startsWith('SR-') && /^(SR|FR|NFR)-/.test(to))
    || (from.startsWith('FR-') && to.startsWith('NFR-'));
  for (const link of registry.analysis.traceability) {
    if (link.status === 'Подтверждено источником' && hierarchy(link.from, link.to) && children.has(link.from) && byId.has(link.to)
      && !/конфликт|завис|замен|исключ/i.test(link.relation)) children.get(link.from).push(link.to);
    if (link.status === 'Предполагается') {
      // CON.relatedTo points in the reverse direction from a tree edge.
      if (children.has(link.from)) children.set(link.from, children.get(link.from).filter((id) => id !== link.to));
      if (children.has(link.to)) children.set(link.to, children.get(link.to).filter((id) => id !== link.from));
    }
  }
  const lines = [];
  const treeEdges = new Set();
  const renderedIds = new Set();
  const renderNode = (id, prefix = '', branch = '', tail = true, ancestors = new Set()) => {
    if (ancestors.has(id) || renderedIds.has(id) || !byId.has(id)) return;
    renderedIds.add(id);
    const record = byId.get(id);
    const gaps = gapIdsFor(registry, record);
    const partialCoverage = /^(BR|SR)-/.test(id) && registry.analysis.GAP.some((gap) => gaps.includes(gap.id) && /scope|полнот|состав/i.test(`${gap.kind || ''} ${gap.text}`));
    const gapLabel = partialCoverage ? 'покрытие частичное' : record.quality === 'Требует уточнения' ? 'требует уточнения' : 'связанные пробелы';
    const coverage = gaps.length ? ` — ${gapLabel} (${gaps.join(', ')})` : '';
    const constraint = id.startsWith('CON-') ? ' — ограничивает' : '';
    lines.push(`${prefix}${branch}${shortLabel(record)}${constraint}${coverage}`);
    const next = [...new Set(children.get(id) || [])];
    const childPrefix = `${prefix}${branch ? (tail ? '    ' : '│   ') : ''}`;
    next.forEach((child, index) => {
      if (!renderedIds.has(child) && !ancestors.has(child)) treeEdges.add(`${id}|${child}`);
      renderNode(child, childPrefix, index === next.length - 1 ? '└── ' : '├── ', index === next.length - 1, new Set([...ancestors, id]));
    });
  };
  const roots = registry.groups.BR.length ? registry.groups.BR.map((item) => item.id) : records.filter((record) => !(record.relatedTo || []).length).map((item) => item.id);
  roots.forEach((id) => renderNode(id));
  for (const record of records) if (!renderedIds.has(record.id)) renderNode(record.id);
  if (!registry.groups.NFR.length) {
    const gaps = registry.analysis.GAP.filter((gap) => /NFR|НФТ|нефункцион|производител|безопасност|доступност|восстановлен/i.test(`${gap.kind || ''} ${gap.text}`));
    lines.push(`NFR: не обнаружено${gaps.length ? ` (${gaps.map((gap) => gap.id).join(', ')})` : ''}`);
  }
  const supplemental = registry.analysis.traceability.filter((link) => link.status === 'Предполагается'
    || !treeEdges.has(`${link.from}|${link.to}`) || /конфликт|завис|замен|исключ/i.test(link.relation));
  // Multi-parent relations not shown in the tree must remain visible.
  for (const [parent, ids] of children) for (const child of new Set(ids)) {
    if (!treeEdges.has(`${parent}|${child}`) && !supplemental.some((link) => link.from === parent && link.to === child)) {
      supplemental.push({ from: parent, to: child, relation: 'Связано с', status: 'Подтверждено источником' });
    }
  }
  return [
    '## 9. Трассировка',
    '',
    lines.length ? `\`\`\`text\n${lines.join('\n')}\n\`\`\`` : 'Не обнаружено',
    ...(supplemental.length ? ['', table(['От', 'К', 'Тип связи', 'Статус'], supplemental.map((link) => [link.from, link.to, link.relation, link.status]))] : ['', 'Дополнительные связи не обнаружены.']),
  ].join('\n');
}

function renderAnalysis(registry) {
  const { GAP, HYP, TERM } = registry.analysis;
  const records = [
    ...GAP.map((item) => [item.id, 'GAP', item.text, item.affectedIds.join(', '), item.nextStep, source(item.source, registry)]),
    ...HYP.map((item) => [item.id, 'HYP', item.text, item.affectedIds.join(', '), item.nextStep, source(item.source, registry)]),
    ...TERM.map((item) => [item.id, 'TERM', `${item.term}: ${item.meaning || 'значение не определено'}`, item.affectedIds.join(', '), item.nextStep, source(item.source, registry)]),
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
    ...(() => { const issues = collectBabokQualityIssues(value, { final: true }); return issues.length ? ['**Замечания к качеству — проверьте перед согласованием:**\n\n' + issues.map((issue) => `- ${issue.reason}`).join('\n')] : []; })(),
    renderContext(value),
    ...REQUIREMENT_SECTIONS.map(([type, title]) => renderRequirementSection(type, title, value.groups[type], value)),
    renderDelta(value),
    renderTraceability(value),
    renderAnalysis(value),
    renderQuestions(value),
  ].join('\n\n');
}
