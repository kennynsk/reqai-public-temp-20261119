# Перенос функций исходного приложения

Исходные пользовательские сценарии перенесены на асинхронный `/api/v1/jobs` без браузерной оркестрации. Вход хранится как artifact, параметры исполнения фиксируются в `configuration_snapshot`, а итог каждого режима сохраняется как JSON result artifact.

| Исходный сценарий | Durable mode | Backend execution |
| --- | --- | --- |
| Декомпозиция и ручная проверка требований | `DECOMPOSITION` | chunked decomposition → merge → редактирование и сохранение версии пользователем |
| AI-исследование сохранённой версии | `REQUIREMENTS_INSIGHTS` | один специализированный insights prompt → карточки улучшений → выбор пользователем → финальная версия |
| Обычное исследование | `STANDARD_RESEARCH` | категории → trends/competitors/practices → synthesis → improve |
| Сравнение моделей и температуры | `MODEL_COMPARE` | два варианта с отдельными model/temperature snapshots |
| Агентное сравнение | `AGENT_COMPARE` | standard и agent analysis/research/improve в одной job |
| Агентное исследование | `AGENT_RESEARCH` | agent categories → bounded research → synthesis → improve |
| Тестирование промптов | `PROMPT_TEST` | system/user prompt из защищённого input artifact → persisted result |

Во всех режимах модель выбирается только из настроенного списка одного провайдера. Указанная пользователем модель становится первой в приоритете; при разрешённой ошибке применяется общий fallback и в результате показывается фактически использованная модель.

Prompt test передаёт текст system/user prompt внутри input artifact, а не в REST, Kafka или Temporal metadata. Это сохраняет reference-only control plane и единые retention/access rules.

## Текущая информационная архитектура

Асинхронный frontend открывает основной четырёхэтапный workspace «Подготовка требований»: «Контекст» → «Требования» → необязательное «AI-исследование» → «Финальная версия». Самостоятельные `STANDARD_RESEARCH`, `MODEL_COMPARE`, `AGENT_COMPARE`, `AGENT_RESEARCH` и `PROMPT_TEST` находятся в меню «Дополнительные инструменты» и не смешиваются с linked requirements research. Durable-статус, история, task permalink и metadata моделей загружаются с backend по `jobId`; браузер не оркестрирует LLM-цепочки.
