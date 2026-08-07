## Purpose

Определяет стабильный REST-контракт управления jobs и надёжные способы получения статуса и результатов через историю, SSE и webhook.

## ADDED Requirements

### Requirement: Versioned job REST API
Система SHALL предоставлять `/api/v1` endpoints для создания, чтения, перечисления, отмены, повторного запуска и получения результата jobs.

#### Scenario: Client retrieves completed result
- **WHEN** авторизованный владелец запрашивает результат завершённой job
- **THEN** API возвращает статус, outcome, summary, model execution metadata и ссылку на крупный artifact при его наличии

### Requirement: Recoverable job history
Пользователь SHALL видеть историю доступных ему jobs после reload или повторного входа, включая активные, завершённые, частичные, отменённые и ошибочные jobs.

#### Scenario: User signs in from another browser
- **WHEN** пользователь открывает историю задач в новой сессии
- **THEN** frontend восстанавливает список и состояние jobs из REST API, а не из локального React state

### Requirement: SSE progress with REST reconciliation
Система SHALL предоставлять авторизованный SSE-поток прогресса; SSE MUST быть ускорением доставки, а REST SHALL оставаться источником истины.

#### Scenario: SSE connection reconnects
- **WHEN** SSE-соединение разрывается и клиент переподключается с `Last-Event-ID`
- **THEN** клиент получает доступные последующие события и выполняет REST-запрос актуального статуса job

#### Scenario: SSE event is missed
- **WHEN** событие не доставлено по SSE
- **THEN** выполнение job не затрагивается, а корректный статус восстанавливается через REST

### Requirement: Minimal optional webhook
При включённом webhook система SHALL отправлять terminal job events на один административно настроенный URL, подписывать payload HMAC-SHA256 и повторять неуспешную доставку.

#### Scenario: Webhook succeeds
- **WHEN** job достигает терминального состояния и endpoint отвечает `2xx`
- **THEN** delivery фиксируется как `DELIVERED` и содержит `eventId`, `jobId`, status, outcome и ссылку на REST result без полного крупного payload

#### Scenario: Webhook retries are exhausted
- **WHEN** endpoint не подтверждает событие за configured maximum attempts
- **THEN** delivery фиксируется как `FAILED`, событие публикуется в DLQ и system-admin может инициировать повтор

### Requirement: Versioned and idempotent events
Kafka-, SSE- и webhook-события SHALL содержать уникальный `eventId`, `schemaVersion`, `tenantId`, `jobId`, timestamp и последовательность job events.

#### Scenario: Consumer receives a duplicate
- **WHEN** downstream consumer повторно получает тот же `eventId`
- **THEN** событие может быть безопасно дедуплицировано без повторного бизнес-эффекта

### Requirement: Linked sequential job journey
Job API SHALL принимать доверенную ссылку на родительскую job и сохранённую requirements version при создании research job и SHALL возвращать эту lineage в detail, history и result representations.

#### Scenario: Client opens a linked research result
- **WHEN** пользователь открывает research job, созданную из проверенной декомпозиции
- **THEN** API возвращает `parentJobId`, идентификатор входной requirements version и доступную ссылку на исходную decomposition job
