const labels = { open: 'Открыт', answered: 'Дан ответ', closed: 'Закрыт', pending: 'Нужна проверка', incorporated: 'Ответ учтён', 'no-change': 'Изменение не требуется', resolved: 'Решён', dismissed: 'Снят с рассмотрения', accepted: 'Принято', rejected: 'Отклонено' };
function value(text) {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === 'string') return labels[parsed] || parsed;
    if (Array.isArray(parsed)) return `Записей: ${parsed.length}`;
    if (typeof parsed === 'boolean') return parsed ? 'Да' : 'Нет';
    if (parsed == null) return 'Не указано';
    return 'Изменено решение';
  } catch { return text || 'Нет'; }
}

export function presentReviewChanges(changes) {
  return changes.flatMap((change) => {
    if (change.operation !== 'Решение проверки') return [change];
    const gap = change.id.match(/^review\.gaps\.(GAP-[^.]+)\.(answer|reason|state|closureKind)$/);
    const check = change.id.match(/^review\.gapRequirements\.(GAP-[^.]+)\.([A-Z]+-[^.]+)\.(state|reason)$/);
    if (gap) return [{ ...change, id: gap[1], operation: ({ answer: 'Ответ', reason: 'Обоснование', state: 'Статус вопроса', closureKind: 'Результат закрытия' })[gap[2]], local: value(change.local), remote: value(change.remote) }];
    if (check) return [{ ...change, id: `${check[1]} · ${check[2]}`, operation: check[3] === 'state' ? 'Проверка требования' : 'Обоснование проверки', local: value(change.local), remote: value(change.remote) }];
    if (['acceptedEnhancementKeys', 'rejectedEnhancementKeys'].includes(change.id)) return [{ ...change, id: 'AI-исследование', operation: change.id === 'acceptedEnhancementKeys' ? 'Принятые предложения' : 'Отклонённые предложения', local: value(change.local), remote: value(change.remote) }];
    return [];
  });
}
