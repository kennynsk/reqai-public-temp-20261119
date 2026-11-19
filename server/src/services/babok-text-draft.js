// A lossless fallback for a model answer that cannot be opened as a registry.
export const BABOK_TEXT_DRAFT_SCHEMA = 'babok-text-draft.v1';
export function isBabokTextDraft(value) {
  return value?.schemaVersion === BABOK_TEXT_DRAFT_SCHEMA && value.mode === 'DECOMPOSITION'
    && Array.isArray(value.responses) && value.responses.length > 0
    && value.responses.every((text) => typeof text === 'string' && text.trim());
}
export function createBabokTextDraft(responses, details = null) {
  const texts = [...new Set(responses.filter((text) => typeof text === 'string' && text.trim()))];
  if (!texts.length) throw Object.assign(new Error('Model returned no text'), { type: 'NO_USABLE_OUTPUT' });
  return { schemaVersion: BABOK_TEXT_DRAFT_SCHEMA, mode: 'DECOMPOSITION', outcome: 'PARTIAL', format: 'TEXT_DRAFT', responses: texts, details };
}
export function renderBabokTextDraft(value) {
  if (!isBabokTextDraft(value)) throw new Error('Invalid text draft');
  return ['# Аналитический черновик', 'Ответ модели сохранён. Автоматическая проверка структуры не пройдена; содержимое требует проверки.', ...value.responses.map((text, index) => `## Ответ ${index + 1}\n\n${text}`)].join('\n\n');
}

const labels = { summary: 'Резюме', text: 'Формулировка', groups: 'Требования', context: 'Контекст', analysis: 'Анализ', BR: 'Бизнес-требования', SR: 'Требования заинтересованных сторон', FR: 'Функциональные требования', NFR: 'Нефункциональные требования', TR: 'Переходные требования', CON: 'Обязательные ограничения', GAP: 'Пробелы', HYP: 'Гипотезы', TERM: 'Термины', quality: 'Качество', provenance: 'Происхождение', role: 'Роль', source: 'Источник', quote: 'Цитата', relatedTo: 'Связи', relatedIds: 'Связанные записи', affectedIds: 'Затронутые требования', questions: 'Вопросы', conclusions: 'Выводы', delta: 'Сравнение с baseline', traceability: 'Прослеживаемость', nextStep: 'Следующий шаг', scope: 'Область действия', verificationMethod: 'Способ проверки', completionCriterion: 'Критерий завершения' };
export function presentBabokTextResponse(text) {
  let value;
  try { value = JSON.parse((text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text).trim()); } catch { return text; }
  const render = (item, depth = 0) => {
    if (item === null) return 'Не указано';
    if (typeof item !== 'object') return String(item);
    if (Array.isArray(item)) return item.length ? item.map((entry) => render(entry, depth)).join('\n\n---\n\n') : 'Нет записей';
    return Object.entries(item).map(([key, entry]) => {
      const label = labels[key] || key;
      return typeof entry === 'object' && entry !== null
        ? `${'#'.repeat(Math.min(6, depth + 3))} ${label}\n\n${render(entry, depth + 1)}`
        : `**${label}:** ${render(entry, depth + 1)}`;
    }).join('\n\n');
  };
  return render(value);
}
