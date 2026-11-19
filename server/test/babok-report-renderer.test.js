import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { buildBabokTraceability, renderBabokReport } from '../src/services/babok-report-renderer.js';

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

test('current decisions distinguish the historical gap from a closed question and remove open-gap trace annotations', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  const gapId = registry.analysis.GAP[0].id;
  const review = { gaps: { [gapId]: { state: 'closed', answer: 'Утверждает владелец продукта', reason: 'Все требования проверены' } } };
  const report = renderBabokReport(registry, { review });
  assert.match(report, /Закрыт \| Утверждает владелец продукта/);
  assert.match(report, /Вопрос закрыт/);
  assert.match(report, /Исходный анализ/);
  const tree = report.match(/```text\n([\s\S]*?)\n```/)[1];
  assert.ok(!tree.includes(gapId));
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


test('hierarchy excludes peer links and untyped references without losing records or links', () => {
  const registry = createEmptyBabokRegistry();
  registry.groups.BR = [{ id: 'BR-001', text: 'Цель', relatedIds: ['SR-003'] }];
  registry.groups.SR = [
    { id: 'SR-001', text: 'Первая потребность' },
    { id: 'SR-002', text: 'Вторая потребность', relatedTo: ['SR-001'] },
    { id: 'SR-003', text: 'Третья потребность', relatedTo: ['SR-001'] },
  ];
  registry.groups.FR = [{ id: 'FR-001', text: 'Функция', relatedTo: ['SR-003'] }];
  registry.groups.NFR = [{ id: 'NFR-001', text: 'Качество' }];
  registry.analysis.traceability = [
    { from: 'BR-001', to: 'SR-001', relation: 'обосновывает', status: 'Предполагается' },
    { from: 'SR-001', to: 'SR-002', relation: 'уточняет', status: 'Подтверждено источником' },
    { from: 'SR-002', to: 'FR-001', relation: 'реализует', status: 'Подтверждено источником' },
    { from: 'SR-002', to: 'NFR-001', relation: 'уточняет', status: 'Предполагается' },
  ];
  const { forest, supplemental, links } = buildBabokTraceability(registry);
  assert.deepEqual(forest.map((node) => node.record.id), ['BR-001', 'SR-002', 'SR-003']);
  assert.deepEqual(forest[0].children.map((node) => node.record.id), ['SR-001']);
  assert.deepEqual(forest[0].children[0].children, []);
  assert.deepEqual(forest[1].children.map((node) => node.record.id), ['FR-001', 'NFR-001']);
  for (const link of links.filter((link) => link.relation === 'Связано с' || link.to === 'SR-002')) {
    assert.ok(supplemental.includes(link));
  }
});


test('question rows show the next step directly instead of an ambiguous cross-reference', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  const question = registry.analysis.questions[0];
  const gap = registry.analysis.GAP.find((item) => item.id === question.gapId);
  gap.nextStep = 'Согласовать правила отзыва подготовленных операций.';
  const questions = renderBabokReport(registry).split('## 11. Вопросы для уточнения')[1];
  assert.match(questions, /Согласовать правила отзыва подготовленных операций/);
  assert.doesNotMatch(questions, /См. решение/);
});

test('explicit business-to-NFR edges appear in the tree with a skipped-level explanation', () => {
  const registry = JSON.parse(readFileSync(new URL('./fixtures/babok-requirements-v1.complete.json', import.meta.url), 'utf8'));
  registry.analysis.traceability = [{ from: 'BR-001', to: 'NFR-001', relation: 'обосновывает', status: 'Подтверждено источником', source: null }];
  const { forest } = buildBabokTraceability(registry);
  const business = forest.find((node) => node.record.id === 'BR-001');
  const nfr = business.children.find((node) => node.record.id === 'NFR-001');
  assert.ok(nfr);
  assert.match(nfr.hierarchyNote, /без промежуточного SR/);
  assert.equal(forest.some((node) => node.record.id === 'NFR-001'), false);
  const tree = renderBabokReport(registry).match(/```text\n([\s\S]*?)\n```/)[1];
  assert.match(tree, /[├└]── NFR-001[^\n]*без промежуточного SR/);
  registry.analysis.traceability = [];
  registry.groups.NFR[0].relatedTo = ['BR-001'];
  assert.equal(buildBabokTraceability(registry).forest.find((node) => node.record.id === 'BR-001').children.some((node) => node.record.id === 'NFR-001'), false);
});

test('summary explicitly separates historical model conclusions from current question state', () => {
  const registry = createEmptyBabokRegistry();
  registry.summary.text = 'Исходный анализ';
  registry.summary.conclusions = ['Показатель успеха не определён'];
  const report = renderBabokReport(registry);
  assert.match(report, /Исходное резюме декомпозиции/);
  assert.match(report, /не являются текущим статусом/);
  assert.match(report, /Вопросы в текущей редакции: 0 открыто, 0 закрыто/);
});
