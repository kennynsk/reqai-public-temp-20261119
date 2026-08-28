// Synthetic regression material; deliberately omits the requested reopening action.
export const roomBookingBrief = 'Сотрудник бронирует переговорную. Система запрещает пересечения. Администратор закрывает комнату на обслуживание и открывает её после работ. Бронирование — не более чем на 14 дней вперёд. Канал уведомлений, часовой пояс, хранение, доступ администратора, скорость, доступность и целевые показатели не определены.';

export function roomBookingRegistry() {
  const source = { artifactId: '00000000-0000-4000-8000-000000000001', locator: 'paragraph:1', quote: roomBookingBrief };
  const common = (id, text) => ({ id, text, source, provenance: 'Извлечено', quality: 'Готово' });
  const gaps = ['Канал уведомлений', 'Часовой пояс', 'Срок хранения', 'Доступ администратора', 'Скорость', 'Доступность', 'Целевые показатели'];
  return {
    schemaVersion: 'babok-requirements.v1', mode: 'DECOMPOSITION', outcome: 'COMPLETE',
    summary: { text: 'Бронирование переговорных', counts: { BR: 1, SR: 0, FR: 2, NFR: 0, TR: 0, CON: 0, CTX: 0, GAP: 7, HYP: 0, TERM: 0, DELTA: 0 }, conclusions: [] },
    context: [],
    groups: {
      BR: [{ ...common('BR-001', 'Сократить конфликты бронирования.'), successIndicator: null, relatedIds: [] }],
      SR: [], FR: [{ ...common('FR-001', 'Система запрещает пересекающиеся бронирования.'), relatedTo: ['BR-001'] }, { ...common('FR-002', 'Администратор закрывает комнату на обслуживание.'), relatedTo: ['BR-001'] }], NFR: [], TR: [], CON: [],
    },
    analysis: {
      GAP: gaps.map((text, i) => ({ id: `GAP-00${i + 1}`, text, kind: 'Уточнение', affectedIds: ['BR-001'], nextStep: 'Уточнить у владельца', source })),
      HYP: [], TERM: [], traceability: [], delta: [],
      questions: gaps.map((text, i) => ({ id: `QUESTION-00${i + 1}`, gapId: `GAP-00${i + 1}`, text: `Как определить: ${text}?`, priority: 'P1', addressee: 'Владелец процесса' })),
    },
    materials: { primary: { artifactId: source.artifactId, role: 'primary', name: 'Бриф переговорных', sha256: null, status: 'AVAILABLE' }, baseline: { status: 'NOT_PROVIDED', artifacts: [] }, references: [] },
    scope: { partial: false, units: [{ id: '00000000-0000-4000-8000-000000000002', artifactId: source.artifactId, status: 'COMPLETE', section: 'all', note: null }] },
  };
}

export const roomBookingInsight = { id: 'room-insight', category: 'patterns', title: 'Уведомления в каналах协作', summary: 'Проверить конкурентные запросы.', detail: 'Уточнить конфликт бронирования.', applicability: 85, source_types: ['case_study'], relatedTo: ['FR-001'], enhancements: [{ targetType: 'FR', targetIds: ['FR-001'], text: 'Предложить уточнить поведение при одновременном бронировании.' }] };
