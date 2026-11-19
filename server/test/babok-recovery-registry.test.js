import assert from 'node:assert/strict';
import test from 'node:test';
import { projectBabokRecovery } from '../src/services/babok-recovery-registry.js';
import { buildBabokTraceability } from '../src/services/babok-report-renderer.js';
import { createEmptyBabokRegistry, validateBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { createBabokTextDraft } from '../src/services/babok-text-draft.js';

const source = { artifactId: 'primary', locator: '§2', quote: 'Сократить время ожидания' };
const edge = (from, to, relation, status = 'Подтверждено источником') => ({ from, to, relation, status, source });

function recoveredResult() {
  const manualRegistry = createEmptyBabokRegistry({ outcome: 'PARTIAL' });
  manualRegistry.materials.primary = { artifactId: 'primary', role: 'primary', name: null, sha256: null, status: 'AVAILABLE' };
  manualRegistry.scope.partial = true;
  const first = {
    groups: {
      BR: [{ id: 'BR-008', text: 'Сократить время ожидания', relatedIds: ['SR-008'] }],
      SR: [{ id: 'SR-008', text: 'Клиенту нужно видеть очередь' }],
      FR: [{ id: 'FR-008', text: 'Показывать позицию в очереди', relatedTo: ['SR-008'] }],
      NFR: [
        { id: 'NFR-008', text: 'Обновлять позицию за секунду', relatedTo: ['SR-008'] },
        { id: 'NFR-009', text: 'Доступность 99,9%' },
      ],
    },
    analysis: { traceability: [
      edge('BR-008', 'SR-008', 'обосновывает'),
      edge('SR-008', 'FR-008', 'реализует'),
      edge('SR-008', 'FR-008', 'реализует'),
      edge('SR-008', 'NFR-008', 'уточняет', 'Предполагается'),
      edge('BR-008', 'NFR-009', 'обосновывает'),
      edge('FR-008', 'NFR-008', 'зависит от', 'Предполагается'),
      edge('SR-008', 'FR-999', 'реализует'),
    ] },
  };
  const second = {
    groups: {
      SR: [{ id: 'SR-008', text: 'Оператору нужно управлять очередью' }],
      FR: [{ id: 'FR-999', text: 'Переносить заявку в конец очереди', relatedTo: ['SR-008'] }],
    },
    analysis: { traceability: [edge('SR-008', 'FR-999', 'реализует')] },
  };
  return { manualRegistry, recovery: { draft: createBabokTextDraft([JSON.stringify(first), JSON.stringify(second)]) } };
}

test('recovered BR, SR, FR and NFR build the original hierarchy with section-local IDs', () => {
  const { registry } = projectBabokRecovery(recoveredResult());
  validateBabokRegistry(registry);
  assert.deepEqual(registry.analysis.traceability, [
    edge('BR-001', 'SR-001', 'обосновывает'),
    edge('SR-001', 'FR-001', 'реализует'),
    edge('SR-001', 'NFR-001', 'уточняет', 'Предполагается'),
    edge('BR-001', 'NFR-002', 'обосновывает'),
    edge('FR-001', 'NFR-001', 'зависит от', 'Предполагается'),
    edge('SR-002', 'FR-002', 'реализует'),
  ]);
  const subtree = (node) => [node.record.id, node.children.map(subtree)];
  const { forest, outsideTree } = buildBabokTraceability(registry);
  assert.deepEqual(forest.map(subtree), [
    ['BR-001', [['SR-001', [['FR-001', []], ['NFR-001', []]]], ['NFR-002', []]]],
    ['SR-002', [['FR-002', []]]],
  ]);
  assert.deepEqual(outsideTree, [edge('FR-001', 'NFR-001', 'зависит от', 'Предполагается')]);
});

test('restores typed links in a saved draft while preserving edits, removals and existing link decisions', () => {
  const result = recoveredResult();
  const { registry: saved } = projectBabokRecovery(result);
  saved.analysis.traceability = [edge('BR-001', 'NFR-002', 'уточняет', 'Предполагается')];
  saved.groups.SR[0].text = 'Клиенту требуется видеть очередь';
  saved.groups.NFR[0].relatedTo = [];
  saved.groups.FR.pop();
  saved.summary.counts.FR = 1;

  const { registry } = projectBabokRecovery(result, saved, { recoveryImported: true });
  validateBabokRegistry(registry);
  assert.deepEqual(registry.groups, saved.groups);
  assert.equal(registry.analysis.traceability.length, 4);
  assert.ok(registry.analysis.traceability.some((link) => link.from === 'SR-001' && link.to === 'FR-001'));
  assert.ok(!registry.analysis.traceability.some((link) => link.from === 'SR-001' && link.to === 'NFR-001'));
  assert.ok(!registry.analysis.traceability.some((link) => link.to === 'FR-002'));
  assert.deepEqual(registry.analysis.traceability.filter((link) => link.to === 'NFR-002'), saved.analysis.traceability);

  const reopened = projectBabokRecovery(result, saved, { recoveryImported: true, recoveryTraceabilityImported: true });
  assert.equal(reopened.registry, saved);
});
