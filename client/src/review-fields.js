export const STRUCTURED_FIELDS = {
  BR: [['successIndicator', 'Критерий успеха']],
  SR: [['role', 'Роль']],
  FR: [],
  NFR: [['category', 'Категория', true], ['scope', 'Область'], ['verificationMethod', 'Метод проверки']],
  TR: [['completionCriterion', 'Критерий завершения']],
  CON: [['obligation', 'Обязательство', true], ['scope', 'Область']],
};
export const QUALITY_OPTIONS = ['Готово', 'Требует уточнения', 'Конфликтует', 'Не тестируемо'];

export function validateReviewContent(content) {
  const groups = content.groups || content;
  const ids = new Set([...Object.values(groups).filter(Array.isArray).flat(), ...(content.context || []), ...Object.values(content.analysis || {}).filter(Array.isArray).flat()].map((item) => item.id).filter(Boolean));
  for (const [type, records] of Object.entries(groups)) {
    if (!Array.isArray(records)) continue;
    for (const record of records) {
      if (!record.text?.trim()) return { id: record.id, type, field: 'text', message: 'Введите формулировку требования.' };
      for (const [field, label, required] of STRUCTURED_FIELDS[type] || []) {
        if (required && !record[field]?.trim()) return { id: record.id, type, field, message: `Заполните поле «${label}».` };
      }
      if ((record.relatedTo || record.relatedIds || []).some((id) => !ids.has(id))) return { id: record.id, type, field: 'relations', message: 'Удалите связь с отсутствующим требованием.' };
    }
  }
  return null;
}
