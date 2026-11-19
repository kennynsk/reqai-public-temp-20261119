## Purpose

Определяет надёжное, ограниченное и аудируемое выполнение LLM-этапов с fallback между приоритетными моделями одного провайдера.

## ADDED Requirements

### Requirement: Snapshotted model priority
Каждая job SHALL сохранять упорядоченный список разрешённых моделей и параметры выполнения на момент создания, чтобы последующие изменения env не меняли уже запущенный workflow.

#### Scenario: Model priority changes during execution
- **WHEN** оператор изменяет порядок моделей после создания job
- **THEN** текущая job продолжает использовать сохранённый configuration snapshot, а новый порядок применяется только к новым jobs

### Requirement: Classified retry and fallback
Система SHALL повторять или переключать модель для timeout, network error, `429` и `5xx`, и SHALL считать `400`, `401`, `403` и content-policy ошибки non-retryable.

#### Scenario: Primary model times out
- **WHEN** максимальная модель исчерпывает configured attempts из-за timeout
- **THEN** этап переключается на следующую модель по приоритету и сохраняет причину fallback

#### Scenario: Unknown provider error is returned
- **WHEN** провайдер возвращает неклассифицированную ошибку
- **THEN** система логирует её с уровнем `ERROR`, не выполняет автоматический fallback по этой ошибке и завершает этап согласно partial-result policy

### Requirement: Bounded attempts and deadlines
Один этап SHALL использовать не более трёх моделей и двух попыток на модель; декомпозиция SHALL иметь configured deadline по умолчанию 60 минут, а полный research — 4 часа.

#### Scenario: Workflow deadline expires
- **WHEN** следующий retry выходит за snapshot deadline job
- **THEN** новые попытки не запускаются, а job завершается как `FAILED` или `SUCCEEDED/PARTIAL` в зависимости от сохранённых результатов

### Requirement: Per-model circuit breaker
Система SHALL поддерживать отдельное состояние circuit breaker для каждой модели единственного провайдера.

#### Scenario: A model repeatedly fails
- **WHEN** модель достигает configured failure threshold внутри configured window
- **THEN** circuit открывается только для этой модели, следующие подходящие этапы пропускают её до half-open проверки

### Requirement: Provider-aware concurrency control
Система SHALL ограничивать параллельные вызовы каждой модели согласно env и применять backpressure вместо неограниченного масштабирования workers.

#### Scenario: Model concurrency is exhausted
- **WHEN** число активных вызовов модели достигает её configured limit
- **THEN** новые activities ожидают доступной ёмкости и не превышают лимит провайдера

### Requirement: Transparent execution metadata
Результат SHALL показывать requested model, фактически завершившую каждый этап модель, fallback history, безопасные reason codes, количество попыток, execution site и доступный token usage.

#### Scenario: Result uses multiple models
- **WHEN** разные этапы workflow завершились на разных моделях
- **THEN** пользователь видит metadata по каждому этапу и общий признак применения fallback без раскрытия credentials или внутренних stack traces

