import { roomBookingRegistry } from './room-booking.fixture.js';

export function compactReviewFixture() {
  const registry = roomBookingRegistry();
  const business = structuredClone(registry.groups.BR[0]);
  const functional = structuredClone(registry.groups.FR[0]);
  registry.groups = { BR: [business], SR: [
    { ...functional, id: 'SR-001', text: 'Сотрудник выбирает свободную комнату.' },
    { ...functional, id: 'SR-002', text: 'Администратор управляет доступностью комнат.' },
  ], FR: [], NFR: [], TR: [], CON: [] };
  registry.analysis.GAP = registry.analysis.GAP.slice(0, 5);
  registry.analysis.questions = registry.analysis.questions.slice(0, 5);
  return registry;
}

export function reviewStateFixture(overrides = {}) {
  return { saved: true, dirty: false, busy: false, childId: 'research',
    child: { jobId: 'research', parentJobId: 'source', inputArtifactId: 'v1', status: 'SUCCEEDED' },
    versionId: 'v1', ...overrides };
}
