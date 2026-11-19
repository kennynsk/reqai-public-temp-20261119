import { describe, expect, test } from 'vitest';
import { validateReviewContent } from './review-fields.js';

describe('validateReviewContent', () => {
  test('returns the first missing requirement text', () => {
    expect(validateReviewContent({ BR: [{ id: 'BR-1', text: '   ' }] })).toEqual({
      id: 'BR-1',
      type: 'BR',
      field: 'text',
      message: 'Введите формулировку требования.',
    });
  });

  test('validates required structured fields for NFR and CON', () => {
    expect(validateReviewContent({
      NFR: [{ id: 'NFR-1', text: 'Шифровать данные', scope: 'API', verificationMethod: 'Проверка' }],
    })).toEqual({ id: 'NFR-1', type: 'NFR', field: 'category', message: 'Заполните поле «Категория».' });

    expect(validateReviewContent({
      CON: [{ id: 'CON-1', text: 'Соблюдать закон', scope: 'ЕС' }],
    })).toEqual({ id: 'CON-1', type: 'CON', field: 'obligation', message: 'Заполните поле «Обязательство».' });
  });

  test('accepts valid records, ignores non-array properties, and checks relations against all sources', () => {
    const content = {
      groups: {
        BR: [{ id: 'BR-1', text: 'Измеримый результат', successIndicator: '99%' }],
        SR: [{ id: 'SR-1', text: 'Роль', role: 'Администратор', relatedIds: ['CTX-1', 'GAP-1'] }],
        FR: [{ id: 'FR-1', text: 'Функция', relatedTo: ['BR-1'] }],
        NFR: [{ id: 'NFR-1', text: 'Качество', category: 'Безопасность', scope: 'API', verificationMethod: 'Аудит' }],
        TR: [{ id: 'TR-1', text: 'Завершение', completionCriterion: 'Все тесты зелёные' }],
        CON: [{ id: 'CON-1', text: 'Ограничение', obligation: 'Соблюдать', scope: 'ЕС' }],
        ignored: { id: 'not-a-record' },
      },
      context: [{ id: 'CTX-1', text: 'Контекст' }],
      analysis: { GAP: [{ id: 'GAP-1', text: 'Вопрос' }] },
    };

    expect(validateReviewContent(content)).toBeNull();
  });

  test('reports a relation that points to a missing record', () => {
    expect(validateReviewContent({ FR: [{ id: 'FR-1', text: 'Функция', relatedIds: ['MISSING'] }] })).toEqual({
      id: 'FR-1',
      type: 'FR',
      field: 'relations',
      message: 'Удалите связь с отсутствующим требованием.',
    });
  });
});
