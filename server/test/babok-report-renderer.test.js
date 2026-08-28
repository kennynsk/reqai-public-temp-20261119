import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyBabokRegistry } from '../src/services/babok-requirements-contract.js';
import { renderBabokReport } from '../src/services/babok-report-renderer.js';

test('BABOK report renderer is deterministic and keeps all required report sections', () => {
  const registry = createEmptyBabokRegistry();
  const first = renderBabokReport(registry);
  const second = renderBabokReport(structuredClone(registry));
  assert.equal(first, second);
  for (const heading of [
    '# Декомпозиция требований по BABOK',
    '## Краткое резюме',
    '## 1. Контекст и связанные артефакты',
    '## 2. Бизнес-требования',
    '## 7. Обязательные ограничения',
    '## 8. Сравнение с существующим набором',
    '## 9. Трассировка',
    '## 10. Пробелы, гипотезы и термины',
    '## 11. Вопросы для уточнения',
  ]) assert.match(first, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(first, /Сравнение с существующим набором/);
  assert.match(first, /Не обнаружено/);
});
