import { qualityIssuesToSemanticIssues } from '../src/domain/babok-semantics.js';
import { collectBabokQualityIssues } from '../src/services/babok-requirements-contract.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { applyBabokRepairPatch, applyInsightRepairPatch, repairRevision } from '../src/domain/babok-repair-patch.js';

function registry() {
  const value = createEmptyBabokRegistry();
  value.groups.FR = [{ id: 'FR-001', text: 'Фиксировать событие и отправлять уведомление.', relatedTo: [], source: { artifactId: 'primary' } }, { id: 'FR-002', text: 'Перечислять средства.', relatedTo: [], source: { artifactId: 'primary' } }];
  value.summary.counts.FR = 2;
  return value;
}

test('targeted split preserves all untouched records, source materials and scope', () => {
  const base = registry();
  const first = { ...base.groups.FR[0], text: 'Фиксировать событие.' };
  const second = { ...base.groups.FR[0], id: 'FR-003', text: 'Отправлять уведомление.' };
  const result = applyBabokRepairPatch(base, { baseRevision: repairRevision(base), upserts: [{ type: 'FR', id: first.id, record: first }, { type: 'FR', id: second.id, record: second }], removeIds: [] }, [{ key: 'FR-001', code: 'NON_ATOMIC' }]);
  assert.equal(result.groups.FR.length, 3);
  assert.deepEqual(result.groups.FR[1], base.groups.FR[1]);
  assert.deepEqual(result.materials, base.materials);
  assert.deepEqual(result.scope, base.scope);
  assert.equal(base.groups.FR.length, 2);
});

test('stale patches, removing an unflagged obligation and silently changing an id type fail closed', () => {
  const value = registry();
  for (const patch of [
    { baseRevision: 'old', upserts: [], removeIds: [] },
    { baseRevision: repairRevision(value), upserts: [], removeIds: ['FR-002'] },
    { baseRevision: repairRevision(value), upserts: [{ type: 'BR', id: 'FR-001', record: value.groups.FR[0] }], removeIds: [] },
    { baseRevision: repairRevision(value), upserts: [{ type: 'FR', record: {} }], removeIds: [] },
  ]) assert.throws(() => applyBabokRepairPatch(value, patch, [{ key: 'FR-001' }]), { type: 'BABOK_SEMANTIC_INVALID' });
});

test('research repair changes only the selected insight and rejects foreign ids', () => {
  const value = { insights: [{ id: 'one', enhancements: ['bad'] }, { id: 'two', enhancements: ['unchanged'] }] };
  const result = applyInsightRepairPatch(value, { baseRevision: repairRevision(value), insights: [{ id: 'one', enhancements: ['correct'] }] });
  assert.deepEqual(result.insights[1], value.insights[1]);
  assert.deepEqual(value.insights[0].enhancements, ['bad']);
  assert.throws(() => applyInsightRepairPatch(value, { baseRevision: repairRevision(value), insights: [{ id: 'foreign' }] }), { type: 'BABOK_SEMANTIC_INVALID' });
});

test('automatic splits record normalized provenance while preserving source quotes and text', () => {
  const base = registry();
  base.groups.FR[0].source = { artifactId: 'primary', locator: '§1', quote: base.groups.FR[0].text };
  base.groups.FR[0].provenance = 'Извлечено';
  const record = { ...base.groups.FR[0], text: 'Фиксировать событие.' };
  const result = applyBabokRepairPatch(base, { baseRevision: repairRevision(base), upserts: [{ type: 'FR', id: record.id, record }], removeIds: [] }, [{ key: record.id }]);
  assert.equal(result.groups.FR[0].provenance, 'Нормализовано');
  assert.equal(result.groups.FR[0].text, record.text);
  assert.deepEqual(result.groups.FR[0].source, base.groups.FR[0].source);
});

test('overflow questions become removable specific findings without permitting loss of GAPs or requirements', () => {
  const base = createEmptyBabokRegistry();
  base.analysis.GAP = [{ id: 'GAP-001', kind: 'Пробел', text: 'Не определён показатель.', affectedIds: [], nextStep: 'Согласовать показатель.', source: null }];
  base.summary.counts.GAP = 1;
  base.analysis.questions = Array.from({ length: 8 }, (_, index) => ({ id: `QUESTION-${String(index + 1).padStart(3, '0')}`, gapId: 'GAP-001', priority: index === 0 ? 'P2' : 'P0', addressee: 'Владелец', text: `Уточнить аспект ${index + 1}?` }));
  const issues = qualityIssuesToSemanticIssues(base, collectBabokQualityIssues(base));
  assert.deepEqual(issues.map((issue) => issue.key), ['QUESTION-001']);
  const result = applyBabokRepairPatch(base, { baseRevision: repairRevision(base), upserts: [], removeIds: ['QUESTION-001'] }, issues);
  assert.equal(result.analysis.questions.length, 7);
  assert.ok(result.analysis.questions.every((question) => question.priority === 'P0'));
  assert.deepEqual(result.analysis.GAP, base.analysis.GAP);
  assert.deepEqual(result.groups, base.groups);
  assert.deepEqual(collectBabokQualityIssues(result), []);
  assert.throws(() => applyBabokRepairPatch(base, { baseRevision: repairRevision(base), upserts: [], removeIds: ['GAP-001'] }, issues), /semantic validation/i);
});
