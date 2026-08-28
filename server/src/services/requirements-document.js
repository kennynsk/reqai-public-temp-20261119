import { safeCitationUrl } from '../domain/research-evidence.js';

const types = { BR: 'Бизнес-требования', SR: 'Требования заинтересованных сторон', FR: 'Функциональные требования', NFR: 'Нефункциональные требования', TR: 'Требования перехода', CON: 'Требования соответствия', business: 'Бизнес-требования', functional: 'Функциональные требования', nonfunctional: 'Нефункциональные требования' };
const fields = { successIndicator: 'Критерий успеха', role: 'Роль', category: 'Категория', scope: 'Область', verificationMethod: 'Метод проверки', completionCriterion: 'Критерий завершения', obligation: 'Обязательство', quality: 'Качество', relatedTo: 'Связанные требования', relatedIds: 'Связанные требования' };
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ru-RU', { timeZone: 'UTC' }) + ' UTC' : 'Дата не указана';
const cleanLocator = (value) => String(value || '').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '').replace(/(?:chunk|artifact|sha256):?\s*[a-f0-9-]*/gi, '').replace(/manual-review|manual-research-review/g, 'Ручная редакция').replace(/paragraph[: ]/gi, 'Абзац ').replace(/section[: ]/gi, 'Раздел ').replace(/page[: ]/gi, 'Страница ').trim();

export function requirementsDocument(version, title = 'Требования') {
  const registry = version.registry;
  const review = version.decisions?.review || {};
  const groups = registry?.groups || version.requirements;
  const blocks = [];
  const paragraph = (text) => { if (text != null && String(text).trim()) blocks.push({ kind: 'paragraph', text: String(text) }); };
  const heading = (level, text) => blocks.push({ kind: 'heading', level, text });
  const versionLabel = `Редакция от ${date(version.createdAt)}`;
  paragraph(versionLabel);
  paragraph('Сохранённый документ. Сохранение не означает согласование всех требований или подтверждение полноты.');
  if (registry?.scope.partial || registry?.outcome === 'PARTIAL') paragraph('Внимание: материалы обработаны частично. Проверьте покрытие исходной задачи.');
  if (registry?.outcome === 'INSUFFICIENT_CONTEXT') paragraph('Недостаточно исходного контекста для полной декомпозиции.');
  if (registry?.materials) {
    const unavailable = [registry.materials.primary, ...registry.materials.references, ...registry.materials.baseline.artifacts].filter((item) => item.status === 'UNAVAILABLE');
    for (const item of unavailable) paragraph(`Материал недоступен: ${item.name || 'Без названия'}.`);
  }
  const materialNames = new Map(registry ? [registry.materials.primary, ...registry.materials.references, ...registry.materials.baseline.artifacts].map((item) => [item.artifactId, item.name || 'Исходный материал']) : []);
  const source = (value) => {
    if (!value) return;
    paragraph(`Источник: ${materialNames.get(value.artifactId) || 'Исходный материал'}${cleanLocator(value.locator) ? ` · ${cleanLocator(value.locator)}` : ''}`);
    if (value.quote) paragraph(`Цитата: ${value.quote}`);
  };
  for (const [type, label] of Object.entries(types)) {
    if (!Array.isArray(groups[type])) continue;
    heading(1, `${label} · ${groups[type].length}`);
    if (!groups[type].length) paragraph('Требования этого типа не сформированы.');
    for (const record of groups[type]) {
      heading(2, record.id);
      paragraph(record.text);
      for (const [key, label] of Object.entries(fields)) if (record[key] != null && (!Array.isArray(record[key]) || record[key].length)) paragraph(`${label}: ${Array.isArray(record[key]) ? record[key].join(', ') : record[key]}`);
      if (record.fromResearch) paragraph('Добавлено или изменено после ручной проверки AI-предложения.');
      if (record.manuallyEdited) paragraph('Изменено вручную.');
      source(record.source);
    }
  }
  heading(1, 'Вопросы и решения');
  if (!registry?.analysis.GAP.length) paragraph('В реестре нет зарегистрированных GAP. Это не подтверждает отсутствие пропусков.');
  for (const gap of registry?.analysis.GAP || []) {
    const decision = review.gaps?.[gap.id];
    heading(2, `${gap.id} · ${decision?.state === 'closed' ? 'Закрыт' : 'Открыт'}`);
    paragraph(gap.text);
    if (gap.affectedIds.length) paragraph(`Затронуты: ${gap.affectedIds.join(', ')}`);
    if (gap.nextStep) paragraph(`Следующий шаг: ${gap.nextStep}`);
    for (const question of registry.analysis.questions.filter((item) => item.gapId === gap.id)) paragraph(`${({ P0: 'Критический', P1: 'Высокий', P2: 'Обычный' })[question.priority] || 'Приоритет не указан'} · ${question.addressee}: ${question.text}`);
    if (decision?.answer) paragraph(`Ответ: ${decision.answer}`);
    if (decision?.reason) paragraph(`Причина решения: ${decision.reason}`);
    if (decision?.recordedAt) paragraph(`Решение зафиксировано: ${date(decision.recordedAt)}`);
    source(gap.source);
  }
  const qualityIssues = Object.values(groups).flat().filter((item) => item.quality && item.quality !== 'Готово');
  if (qualityIssues.length) { heading(2, 'Требования, требующие проверки'); for (const item of qualityIssues) paragraph(`${item.id} · ${item.quality}: ${item.text}`); }
  if (review.acknowledgment) paragraph(review.acknowledgment.stale ? 'Прежнее подтверждение открытых вопросов устарело после изменений.' : `Пользователь подтвердил сохранение открытых вопросов: ${date(review.acknowledgment.recordedAt)}. Это не означает их закрытие.`);
  heading(1, 'Проверка полноты');
  paragraph(review.completeness?.checked && !review.completeness.stale ? `Выполнена ручная сверка доступного исходного текста: ${date(review.completeness.recordedAt)}.` : 'Полнота текущей редакции не подтверждена ручной сверкой.');
  if (review.completeness?.note) paragraph(review.completeness.note);
  for (const item of review.omissions || []) paragraph(`Отмеченный пропуск: ${item.text} · ${item.requirementIds.length ? `Добавлены требования: ${item.requirementIds.join(', ')}` : 'Остаётся открытым'}`);
  const proposals = Object.values(review.proposals || {});
  if (proposals.length) {
    heading(1, 'Решения по AI-предложениям');
    for (const item of proposals) {
      heading(2, `${item.targetId} · ${item.decision === 'accepted' ? 'Принято' : 'Отклонено'}`);
      paragraph(`Исходное предложение: ${item.originalText}`);
      paragraph(`Рассмотренная формулировка: ${item.after.text}`);
      paragraph(`Действие: ${item.operation === 'replace' ? 'Замена выбранного требования' : 'Добавление требования'}`);
      if (item.reversal === 'retain-manual') paragraph('Принятие отменено, запись оставлена как ручное требование.');
    }
  }
  const checks = Object.values(review.citationChecks || {});
  if (checks.length) {
    heading(1, 'Проверка источников исследования');
    for (const item of checks) {
      paragraph(`${item.source.title || 'Источник без названия'} · ${item.checked ? 'Проверено пользователем' : 'Не проверено'}`);
      const url = safeCitationUrl(item.source.url); if (url) paragraph(url);
      if (item.source.publishedAt) paragraph(`Дата, указанная моделью: ${item.source.publishedAt}`);
      paragraph(item.note);
    }
  }
  return { title, versionId: version.versionId, versionLabel, blocks };
}

const html = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const md = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/([\\`*_[\]{}()#+.!|~-])/g, '\\$1');
export function documentMarkdown(document) { return [`# ${md(document.title)}`, ...document.blocks.map((block) => `${block.kind === 'heading' ? '#'.repeat(block.level + 1) + ' ' : ''}${md(block.text)}`)].join('\n\n') + '\n'; }
export function documentHtml(document) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${html(document.title)}</title><style>
  @page{size:Letter;margin:25.4mm}*{box-sizing:border-box}body{max-width:170mm;margin:2rem auto;padding:0 1rem;font:11pt/1.25 Calibri,Arial,sans-serif;color:#172033}h1{font-size:23pt;margin:0 0 16pt}h2{font-size:16pt;margin:18pt 0 10pt;color:#2e74b5}h3{font-size:13pt;margin:14pt 0 7pt;color:#2e74b5}h1,h2,h3{break-after:avoid;overflow-wrap:anywhere}p{margin:0 0 6pt;white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}header{border-bottom:1px solid #d1d5db;margin-bottom:18pt} @media print{body{max-width:none;margin:0;padding:0}header{border:0}p{overflow:visible}a{color:inherit;text-decoration:none}}
  </style></head><body><header><h1>${html(document.title)}</h1></header>${document.blocks.map((block) => block.kind === 'heading' ? `<h${block.level + 1}>${html(block.text)}</h${block.level + 1}>` : `<p>${html(block.text)}</p>`).join('\n')}</body></html>`;
}
