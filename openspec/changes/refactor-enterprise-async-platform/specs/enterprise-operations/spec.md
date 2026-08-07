## Purpose

Определяет production-эксплуатацию active-active приложения, его измеримые SLO, управление нагрузкой, обслуживание и восстановление.

## ADDED Requirements

### Requirement: Active-active application across data centers
Frontend, API, SSE и worker-компоненты SHALL одновременно работать в двух ЦОД поверх единых георезервированных PostgreSQL и Kafka; Temporal server replicas и workers SHALL быть доступны в обоих ЦОД.

#### Scenario: One data center becomes unavailable
- **WHEN** один ЦОД теряет application pods
- **THEN** NGAM направляет трафик в доступный ЦОД, workers продолжают принятые workflows через общий durable state и job не требует привязки к исходному ЦОД

### Requirement: Availability and recovery objectives
Production-система SHALL иметь availability objective 99,5%, RPO не более 5 минут и RTO не более 30 минут при соблюдении соответствующих гарантий платформенных зависимостей.

#### Scenario: Disaster recovery exercise
- **WHEN** проводится контролируемая потеря одного ЦОД
- **THEN** доступ восстанавливается в пределах RTO, подтверждённые данные соответствуют RPO, а незавершённые jobs проходят reconciliation

### Requirement: Service and processing SLO
Система SHALL измерять API p95 не более 500 мс без LLM, постановку job p95 не более 2 секунд, начало decomposition p95 не более 30 секунд, начало research p95 не более 2 минут и восстановление activity не более 2 минут.

#### Scenario: SLO is evaluated
- **WHEN** оператор открывает production dashboard за выбранное окно
- **THEN** dashboard показывает соблюдение каждого SLO отдельно от latency внешнего LLM

### Requirement: Capacity and admission control
Система SHALL поддерживать 100 одновременно работающих пользователей и принимать до 30 jobs в минуту, ограничивать research максимум десятью категориями и применять configured per-user, soft backlog и hard backlog limits.

#### Scenario: Hard backlog limit is reached
- **WHEN** очередь достигает configured hard limit
- **THEN** API отклоняет новые jobs с `429` или `503`, не удаляя ранее подтверждённые jobs

#### Scenario: Decomposition competes with research
- **WHEN** decomposition и research ожидают ограниченной worker или LLM capacity
- **THEN** decomposition получает более высокий configured priority

### Requirement: Health, readiness and graceful drain
Каждый компонент SHALL предоставлять отдельные liveness/readiness сигналы и SHALL поддерживать graceful drain без принятия новой работы.

#### Scenario: Data center enters planned maintenance
- **WHEN** оператор переводит компоненты ЦОД в `DRAIN`
- **THEN** NGAM прекращает новый трафик, workers перестают брать новые activities, а работа продолжается в другом ЦОД

### Requirement: Runtime maintenance control
Статические параметры SHALL поступать через env, а оперативный режим `NORMAL`, `ACCEPT_AND_QUEUE`, `DRAIN`, `REJECT_NEW` или `FAILOVER_IN_PROGRESS` SHALL храниться в PostgreSQL и изменяться авторизованным оператором.

#### Scenario: Accept and queue mode is enabled
- **WHEN** operator включает `ACCEPT_AND_QUEUE`
- **THEN** API продолжает устойчиво принимать jobs, но workers не начинают новые workflow steps до снятия режима

### Requirement: Retention enforcement
Система SHALL применять конфигурируемые сроки хранения: final results 180 дней, checkpoints и intermediate results 30 дней, raw LLM responses и full prompts 14 дней, technical logs 30 дней и audit 365 дней по умолчанию.

#### Scenario: Cleanup processes a retention batch
- **WHEN** maintenance worker запускает очередную очистку
- **THEN** он удаляет не более configured batch size, не создаёт длительных блокировок и публикует метрики результата

### Requirement: End-to-end observability
Система SHALL предоставлять correlation IDs, OpenTelemetry traces, структурированные безопасные логи, метрики и alerts для API, queues, workflows, model attempts, fallback, backlog, replication dependencies, webhook и retention.

#### Scenario: Job becomes stalled
- **WHEN** job не изменяет состояние дольше configured threshold
- **THEN** система создаёт alert с job ID, этапом, длительностью и безопасным reason context

