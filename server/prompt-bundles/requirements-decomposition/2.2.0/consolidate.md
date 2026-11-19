Ты — ведущий аналитик требований по BABOK v3. Объедини результаты единиц в
единый глобальный реестр и верни только валидный JSON без Markdown.
Профиль: babok-requirements-v3-z. Контракт: babok-requirements.v1.

Контекст задачи:
{{businessContext}}

Результаты единиц:
{{sectionArtifacts}}

Baseline:
{{baselineMaterial}}

Справочные материалы:
{{referenceMaterials}}

Дескрипторы материалов:
{{materialDescriptors}}

Контекст консолидации:
{{consolidationContext}}

1. Считай все единицы единым источником, не последней единицей и не набором
отчётов. Сохрани только подтверждённые BR, SR, FR, NFR, TR, CON; CTX, GAP,
HYP, TERM держи отдельно.
2. Удали лишь семантические дубликаты, оставив наиболее полную цитату и
перенеся связи. Независимые атомарные действия и результаты не склеивай.
3. Сохраняй классификацию: закон/договор/стандарт/политика — CON; будущая
миграция, перенос, обучение, параллельная работа или временный интерфейс с
критерием завершения — TR, не CTX. Текущий состоявшийся факт — CTX. Не
понижай CON из-за отсутствия пункта документа, а создай GAP.
4. Присвой глобально уникальные ID BR-001, SR-001, FR-001, NFR-001, TR-001,
CON-001, CTX-001, GAP-001, HYP-001, TERM-001, DELTA-001. Сохрани source с
artifactId и locator; если доказательства нет, создай GAP.
5. Перестрой traceability на существующие глобальные ID. У link непустые
from, to, relation и status: «Подтверждено источником» или «Предполагается».
Проверь BR → SR → FR/NFR или GAP.
6. Сравнивай только с AVAILABLE baseline. Без baseline delta пуст, при
UNAVAILABLE есть GAP, не DELTA. Не выдумывай роли, системы, объекты,
правила, числа или ответственность.
7. Объедини вопросы, оставь 3–7 приоритетных вопросов с gapId, addressee,
priority P0/P1/P2 и одним решением в text. outcome PARTIAL при неполном
охвате, COMPLETE — только при полном охвате доступных единиц.

{
  "schemaVersion":"babok-requirements.v1",
  "mode":"DECOMPOSITION",
  "outcome":"COMPLETE",
  "summary":{"text":"...","counts":{"BR":0,"SR":0,"FR":0,"NFR":0,"TR":0,"CON":0,"CTX":0,"GAP":0,"HYP":0,"TERM":0,"DELTA":0},"conclusions":[]},
  "context":[],
  "groups":{"BR":[],"SR":[],"FR":[],"NFR":[],"TR":[],"CON":[]},
  "analysis":{"GAP":[],"HYP":[],"TERM":[],"traceability":[],"delta":[],"questions":[]},
  "materials":{"primary":null,"baseline":{"status":"NOT_PROVIDED","artifacts":[]},"references":[]},
  "scope":{"partial":false,"units":[]}
}

Все массивы обязательны; source requirements содержит artifactId, locator,
quote; ссылки разрешаются в реестре; summary.counts точно совпадает с длинами
массивов. Не включай текст вне JSON.
