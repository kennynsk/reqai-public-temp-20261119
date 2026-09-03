import { roomBookingRegistry } from './room-booking.fixture.js';

export const completeLegacyResearchFixture = {
  mode: 'REQUIREMENTS_INSIGHTS',
  baseRequirements: {
    business: [{ id: 'BT-001', text: 'Сократить время обработки заявки.', quality: 'Готово', relatedTo: [] }],
    functional: [{ id: 'FT-001', text: 'Система принимает заявку.', quality: 'Готово', relatedTo: ['BT-001'] }],
    nonfunctional: [],
  },
  insights: [{
    id: 'legacy-complete',
    category: 'patterns',
    title: 'Уточнить сценарий обработки заявки',
    summary: 'Добавить явное состояние обработки.',
    detail: 'Пользователь должен видеть, что заявка принята и передана оператору.',
    applicability: 87,
    source_types: ['case_study'],
    relatedTo: ['FT-001'],
    rationale: 'Снижает число повторных обращений.',
    citations: [{ title: 'Пример отраслевого решения', url: 'https://example.com/source' }],
    enhancements: [
      { targetType: 'functional', targetIds: ['FT-001'], text: 'Показывать статус заявки после отправки.' },
      { targetType: 'nonfunctional', targetIds: [], text: 'Сохранять статус заявки не менее 90 дней.' },
    ],
  }],
};

export const sparseLegacyResearchFixture = {
  mode: 'REQUIREMENTS_INSIGHTS',
  baseRequirements: { business: [{ id: 'BT-001', text: 'Старая формулировка.' }], functional: [], nonfunctional: [] },
  insights: [{ id: 'legacy-sparse', category: 'future-category', title: 'Исторический результат', summary: 'Короткое описание.', applicability: 42, enhancements: [] }],
};

export const completeBabokResearchFixture = {
  mode: 'REQUIREMENTS_INSIGHTS',
  baseRegistry: roomBookingRegistry(),
  insights: [{
    id: 'babok-complete',
    category: 'risks',
    title: 'Одновременное бронирование',
    summary: 'Нужно явно описать конфликтующие запросы.',
    detail: 'Система должна атомарно отклонять второй запрос на тот же интервал.',
    applicability: 94,
    source_types: ['open_standard', 'case_study'],
    relatedTo: ['BR-001', 'FR-001'],
    rationale: 'Защищает от двойного бронирования.',
    citations: [{ title: 'Стандарт управления ресурсами', publishedAt: '2026-01-01' }],
    enhancements: [
      { targetType: 'FR', targetIds: ['FR-001'], text: 'Отклонять конкурирующий запрос с объяснением причины.' },
      { targetType: 'NFR', targetIds: ['FR-001'], text: 'Проверять конфликт бронирования атомарно.' },
    ],
  }],
};

export const sparseBabokResearchFixture = {
  mode: 'REQUIREMENTS_INSIGHTS',
  baseRegistry: { context: [], groups: {}, analysis: {} },
  insights: [{ id: 'babok-sparse', category: 'historical-category', title: 'Исторический BABOK-результат', summary: 'Короткое описание.', enhancements: [] }],
};

export const missingTargetResearchFixture = {
  ...completeBabokResearchFixture,
  insights: [{
    ...completeBabokResearchFixture.insights[0],
    id: 'babok-missing-target',
    relatedTo: ['BR-999'],
    enhancements: [{ targetType: 'FR', targetIds: ['FR-999'], text: 'Сохранить неизвестную связь для проверки.' }],
  }],
};
