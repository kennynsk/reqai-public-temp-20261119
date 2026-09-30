import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { renderBabokReport } from '../src/services/babok-report-renderer.js';

test('BABOK report renderer is deterministic and keeps all required report sections', () => {
  const registry = createEmptyBabokRegistry();
  const first = renderBabokReport(registry);
  const second = renderBabokReport(structuredClone(registry));
  assert.equal(first, second);
  for (const heading of [
    '# Отчёт о декомпозиции требований (BABOK v3)',
    '## Краткое резюме',
    '## 1. Контекст и связанные артефакты',
    '## 2. Бизнес-требования',
    '## 7. Обязательные ограничения',
    '## 8. Сравнение с существующим набором',
    '## 9. Трассировка',
    '## 10. Пробелы, гипотезы и термины',
    '## 11. Вопросы для уточнения',
  ]) assert.match(first, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(first, /Сравнение невозможно: существующий набор требований не предоставлен/);
  assert.match(first, /Не обнаружено/);
  assert.doesNotMatch(first, /Версия контракта|Артефакты и область анализа|Artifact ID|Частичный охват/);
});

test('BABOK report renderer follows the skill report template and keeps execution metadata out of the reader report', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  const report = renderBabokReport(registry);

  assert.match(report, /# Отчёт о декомпозиции требований \(BABOK v3\)/);
  assert.match(report, /\| ID \| Обязательство \| Источник и реквизиты \| Область \| Качество \|/);
  assert.match(report, /Сравнение с существующим набором/);
  assert.match(report, /```text\nBR-001/);
  assert.match(report, /└── SR-001/);
  assert.doesNotMatch(report, /Артефакты и область анализа|Статус baseline|Artifact ID|SHA-256|Частичный охват/);
});

test('BABOK report renderer keeps a shared traceability child in one tree branch', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  registry.groups.BR.push({ ...structuredClone(registry.groups.BR[0]), id: 'BR-002', text: 'Сделать процесс прозрачным.', relatedIds: ['SR-001'] });
  registry.groups.SR[0].relatedTo = ['BR-001', 'BR-002'];
  registry.summary.counts.BR = 2;

  const trace = renderBabokReport(registry).match(/```text\n([\s\S]*?)\n```/)?.[1] || '';
  assert.equal((trace.match(/SR-001/g) || []).length, 1);
  assert.match(trace, /BR-001/);
  assert.match(trace, /BR-002/);
});

test('report preserves GAP annotations, confirmed conflicts and shared parent links', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  registry.groups.BR[0].quality = 'Требует уточнения';
  registry.analysis.traceability.push({ from: 'FR-001', to: 'NFR-001', relation: 'конфликтует', status: 'Подтверждено источником', source: null });
  const report = renderBabokReport(registry);
  assert.match(report, /Требует уточнения \(GAP-001\)/);
  assert.match(report, /\| FR-001 \| NFR-001 \| конфликтует \| Подтверждено источником \|/);
});

test('traceability uses the same assumed hierarchy as the table and keeps non-parent references separate', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  registry.analysis.traceability = [
    { from: 'BR-001', to: 'SR-001', relation: 'обосновывает', status: 'Предполагается', source: null },
    { from: 'SR-001', to: 'FR-001', relation: 'реализует', status: 'Подтверждено источником', source: null },
    { from: 'TR-001', to: 'FR-001', relation: 'обеспечивает', status: 'Предполагается', source: null },
  ];
  registry.groups.TR[0].relatedTo = ['FR-001'];
  registry.groups.FR.push({ ...structuredClone(registry.groups.FR[0]), id: 'FR-002', text: 'Новое требование.', relatedTo: ['FR-001'] });
  registry.summary.counts.FR = registry.groups.FR.length;
  const report = renderBabokReport(registry);
  const tree = report.match(/```text\n([\s\S]*?)\n```/)[1];
  assert.match(tree, /[├└]── SR-001[^\n]*обосновывает \(Предполагается\)/);
  assert.match(tree, /\nTR-001/);
  assert.match(tree, /\nFR-002/);
  assert.doesNotMatch(tree, /[├└]── (TR-001|FR-002)/);
  assert.match(report, /\| BR-001 \| SR-001 \| обосновывает \| Предполагается \|/);
  assert.match(report, /\| TR-001 \| FR-001 \| обеспечивает \| Предполагается \|/);
  assert.match(report, /\| FR-002 \| FR-001 \| Связано с \| Статус не указан \|/);
});
