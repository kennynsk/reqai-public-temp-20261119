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
