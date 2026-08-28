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
  return values.length ? values.map((value) => `- ${cell(value)}`).join('\n') : 'Не обнаружено';
}

function renderSummary(registry) {
  const counts = Object.entries(registry.summary.counts)
    .map(([type, count]) => `${type}: ${count}`)
    .join(', ');
  return ['## Краткое резюме', '', `Реестр: ${counts}. Исход: ${registry.outcome}.`, '', list(registry.summary.conclusions)].join('\n');
}

function renderContext(registry) {
  return ['## 1. Контекст и связанные артефакты', '', table(
    ['ID', 'Вид', 'Формулировка', 'Источник', 'Происхождение', 'Качество'],
    registry.context.map((item) => [item.id, item.kind, item.text, source(item.source), item.provenance, item.quality]),
  )].join('\n');
}

function renderRequirementSection(type, title, records) {
  const headers = {
    BR: ['ID', 'Формулировка', 'Показатель успеха', 'Источник', 'Происхождение', 'Качество'],
    SR: ['ID', 'Роль', 'Формулировка', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    FR: ['ID', 'Формулировка', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    NFR: ['ID', 'Категория', 'Формулировка', 'Область действия', 'Проверка', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    TR: ['ID', 'Формулировка', 'Критерий завершения', 'Связано с', 'Источник', 'Происхождение', 'Качество'],
    CON: ['ID', 'Обязательство', 'Формулировка', 'Источник', 'Происхождение', 'Область', 'Качество'],
  }[type];
  const rows = records.map((item) => {
    if (type === 'BR') return [item.id, item.text, item.successIndicator, source(item.source), item.provenance, item.quality];
    if (type === 'SR') return [item.id, item.role, item.text, item.relatedTo.join(', '), source(item.source), item.provenance, item.quality];
    if (type === 'FR') return [item.id, item.text, item.relatedTo.join(', '), source(item.source), item.provenance, item.quality];
    if (type === 'NFR') return [item.id, item.category, item.text, item.scope, item.verificationMethod, item.relatedTo.join(', '), source(item.source), item.provenance, item.quality];
    if (type === 'TR') return [item.id, item.text, item.completionCriterion, item.relatedTo.join(', '), source(item.source), item.provenance, item.quality];
    return [item.id, item.obligation, item.text, source(item.source), item.provenance, item.scope, item.quality];
  });
  return [`## ${title}`, '', table(headers, rows)].join('\n');
}

function renderMaterials(registry) {
  const primary = registry.materials.primary ? [registry.materials.primary] : [];
  const baseline = registry.materials.baseline.artifacts;
  const references = registry.materials.references;
  const rows = [...primary, ...baseline, ...references].map((item) => [item.role, item.artifactId, item.name, item.status, item.sha256]);
  return ['## Артефакты и область анализа', '', `Статус baseline: ${registry.materials.baseline.status}. Частичный охват: ${registry.scope.partial ? 'да' : 'нет'}.`, '', table(['Роль', 'Artifact ID', 'Название', 'Статус', 'SHA-256'], rows), '', table(['Единица', 'Artifact ID', 'Статус', 'Раздел', 'Примечание'], registry.scope.units.map((unit) => [unit.id, unit.artifactId, unit.status, unit.section, unit.note]))].join('\n');
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

function renderTraceability(registry) {
  const links = registry.analysis.traceability;
  const lines = links.length ? links.map((link) => `- ${cell(link.from)} — ${cell(link.relation)} → ${cell(link.to)} (${cell(link.status)})`) : ['Не обнаружено'];
  return ['## 9. Трассировка', '', lines.join('\n')].join('\n');
}

function renderDelta(registry) {
  return ['## 8. Сравнение с существующим набором', '', table(
    ['ID в базовом наборе', 'Новый ID', 'Вид изменения', 'Комментарий', 'Источник'],
    registry.analysis.delta.map((item) => [item.baselineId, item.newId, item.kind, item.comment, source(item.source)]),
  )].join('\n');
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
    '# Декомпозиция требований по BABOK',
    '',
    `Версия контракта: ${value.schemaVersion}`,
    '',
    renderSummary(value),
    renderContext(value),
    ...REQUIREMENT_SECTIONS.map(([type, title]) => renderRequirementSection(type, title, value.groups[type])),
    renderMaterials(value),
    renderDelta(value),
    renderTraceability(value),
    renderAnalysis(value),
    renderQuestions(value),
  ].join('\n\n');
}
