## Why

Текущая декомпозиция ограничена тремя категориями `BT / FT / NFT` и теряет
происхождение, качество, пробелы, гипотезы и трассировку требований. В проекте
уже есть BABOK-oriented skill
`babok-requirements-v3-z`, который отделяет подтверждённое от предположений,
раскрывает атомарные требования и формирует вопросы для уточнения. Его нужно
сделать частью product workflow, сохранив структурированный результат,
редактирование и durable lineage приложения.

## What Changes

- Ввести application-интеграцию BABOK skill с versioned prompt bundle и
  отдельным структурированным output contract.
- Заменить результат декомпозиции `business / functional / nonfunctional` на
  расширенную модель `BR / SR / FR / NFR / TR / CON` с отдельными записями
  `CTX / GAP / HYP / TERM`, происхождением, качеством, источниками и связями.
- **BREAKING** Для новых decomposition jobs изменить содержимое result artifact;
  старые jobs и их артефакты должны остаться читаемыми.
- Добавить консолидацию результатов больших входных материалов, чтобы IDs,
  дубли, GAP и traceability рассчитывались на уровне всей задачи, а не
  независимого chunk.
- Разрешить передавать optional baseline и reference materials через artifacts.
- Перестроить requirements review во frontend под новые типы требований,
  пробелы, вопросы и трассировку, сохранив четыре этапа guided workflow.
- Расширить immutable requirements versions и decision lineage так, чтобы
  новые поля не терялись при ручном редактировании.
- Переносить конкретные рекомендации исследования в предложения к требованиям. Для аналитического вывода без предложения сохранять причину.
- Адаптировать requirements-linked AI research к новой модели требований или
  определить совместимую projection без потери исходного BABOK результата.
- Добавить bounded LLM execution для нового JSON-контракта: immutable output
  token budget с запасом, controlled recovery для contract violations и
  отсутствие повторного полного provider-вызова для детерминированной ошибки.
- Усилить диагностику model attempts и пользовательское сообщение об ошибке,
  чтобы причина отказа была видна без раскрытия защищённого raw prompt/output.

## Capabilities

### New Capabilities

- `babok-requirements-decomposition`: структурированная BABOK-декомпозиция
  бизнес-контекста, консолидация материалов, output contract, provenance,
  quality, GAP/HYP/TERM и traceability.

### Modified Capabilities

- `frontend-guided-workflow`: review и final stages должны поддерживать
  расширенный BABOK registry вместо только трёх фиксированных категорий и
  показывать вопросы, пробелы и связи без потери durable workflow behavior.

## Impact

- **Prompt/runtime:** loader для skill и references, новый prompt release,
  manifest/hash qualification, snapshot и rollback policy.
- **Backend:** output contract registry, semantic validation, hierarchical
  extraction/consolidation workflow, artifact inputs для baseline/references,
  result and requirements-version persistence.
- **API:** новые optional input materials и расширенная result/version model;
  canonical async job lifecycle остаётся прежним.
- **Frontend:** новые registry views, filtering/editing, traceability tree,
  GAP/questions presentation и backward-compatible rendering старых results.
- **Research:** mapping `relatedTo` и enhancements для `BR/SR/FR/NFR/CON`.
- **Tests and operations:** fixtures, contract tests, large-document tests,
  prompt qualification, bounded-output checks, controlled retry tests,
  canary rollout и retention старого prompt release.
