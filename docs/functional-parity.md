# Перенос функций исходного приложения

Исходные пользовательские сценарии перенесены на асинхронный `/api/v1/jobs` без браузерной оркестрации. Вход хранится как artifact, параметры исполнения фиксируются в `configuration_snapshot`, а итог каждого режима сохраняется как JSON result artifact.

| Исходный сценарий | Durable mode | Backend execution |
| --- | --- | --- |
| Декомпозиция и ручная проверка требований | `DECOMPOSITION` | chunked decomposition → merge → редактирование и сохранение версии пользователем |
| Обычное исследование | `STANDARD_RESEARCH` | категории → trends/competitors/practices → synthesis → improve |
| Сравнение моделей и температуры | `MODEL_COMPARE` | два варианта с отдельными model/temperature snapshots |
| Агентное сравнение | `AGENT_COMPARE` | standard и agent analysis/research/improve в одной job |
| Агентное исследование | `AGENT_RESEARCH` | agent categories → bounded research → synthesis → improve |
| Тестирование промптов | `PROMPT_TEST` | system/user prompt из защищённого input artifact → persisted result |

Во всех режимах модель выбирается только из настроенного списка одного провайдера. Указанная пользователем модель становится первой в приоритете; при разрешённой ошибке применяется общий fallback и в результате показывается фактически использованная модель.

Prompt test передаёт текст system/user prompt внутри input artifact, а не в REST, Kafka или Temporal metadata. Это сохраняет reference-only control plane и единые retention/access rules.

## Визуальный паритет

Асинхронный frontend сохраняет дизайн исходного приложения: белую верхнюю навигацию ReqAI с разделами «Бизнес-требования» и «Исследование рынка», исходную бизнес-форму с шагом декомпозиции, пять внутренних research-вкладок, типографику, цветовую схему и карточное представление результатов. Durable-статус, история и metadata моделей встроены в те же визуальные паттерны и не возвращают orchestration в браузер.
