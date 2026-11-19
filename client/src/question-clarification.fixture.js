import { roomBookingRegistry } from './room-booking.fixture.js';

export function sharedQuestionFixture() {
  const registry = roomBookingRegistry();
  registry.groups.BR[0].successIndicator = '0 конфликтов бронирования за месяц';
  registry.groups.SR = [{ ...registry.groups.FR[0], id: 'SR-001', role: 'Сотрудник', text: 'Сотруднику нужно забронировать свободную комнату.' }];
  registry.groups.FR = Array.from({ length: 8 }, (_, i) => ({ ...registry.groups.FR[0], id: `FR-${String(i + 1).padStart(3, '0')}`, text: `Система проверяет условие бронирования ${i + 1}.` }));
  registry.analysis.TERM = [{ id: 'TERM-001', text: 'Конфликт — пересечение бронирований.' }];
  registry.analysis.GAP = [{ ...registry.analysis.GAP[0], affectedIds: ['BR-001', 'SR-001', ...registry.groups.FR.map((record) => record.id), 'TERM-001'] }];
  // The reverse direction repeats BR-001; it must not duplicate a check.
  registry.groups.BR[0].relatedIds = ['GAP-001'];
  registry.analysis.questions = [{ ...registry.analysis.questions[0] }, { ...registry.analysis.questions[0], id: 'QUESTION-002', text: 'Как обрабатывать недоступный канал?' }];
  return registry;
}
