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

### Requirement: Honest user-facing execution progress
REST job detail и SSE progress SHALL показывать текущую пользовательскую фазу выполнения, сообщение и прогресс по подтверждённым milestones; frontend MUST отделять этот execution progress от положения пользователя в многоэтапном бизнес-сценарии. Во время длительного этапа frontend MAY плавно интерполировать визуальный progress между последним подтверждённым milestone и безопасной верхней границей текущей фазы, если такая оценка явно является визуальным индикатором выполнения, монотонна, замедляется со временем, не достигает следующего milestone или terminal state самостоятельно и немедленно уступает авторитетному REST/SSE state.

#### Scenario: Long model call is running
- **WHEN** job находится внутри длительного LLM-вызова и новых milestones ещё нет
- **THEN** frontend показывает название текущей фазы, прошедшее время, смысловые сообщения о фокусе обработки, визуальную активность и плавную оценку между подтверждёнными границами, которая замедляется ниже следующего milestone и не изображается как фактически подтверждённая готовность

#### Scenario: Estimated progress waits for the model
- **WHEN** вычисленная визуальная оценка достигает верхней границы текущей фазы раньше реального ответа модели
- **THEN** она продолжает показывать активность, но не пересекает границу, не достигает 100% и не переводит пользовательский mini-timeline на следующий подтверждённый шаг

#### Scenario: Business journey and execution are shown together
- **WHEN** активная job отображается внутри четырёхэтапного пользовательского пути
- **THEN** business stepper показывает номер и названия этапов без конкурирующего числового процента, а `ActiveJobPanel` показывает отдельный execution indicator и mini-timeline подтверждённых фаз

#### Scenario: Progress event is missed
- **WHEN** клиент пропускает промежуточное SSE-событие и выполняет REST reconciliation
- **THEN** job detail возвращает актуальные `progress`, `currentStep` и безопасное пользовательское `message`, достаточные для восстановления progress UI

### Requirement: Background task experience and completion notice
Пользователь SHALL иметь возможность покинуть экран активной job без остановки выполнения, продолжать видеть компактный индикатор активной задачи в общем workspace и получить доступное внутри приложения уведомление о терминальном результате с действием открытия задачи.

#### Scenario: User collapses a running task
- **WHEN** пользователь выбирает продолжение в фоне или переходит в историю во время выполнения job
- **THEN** job продолжает выполняться, а workspace показывает её текущий статус и позволяет одним действием вернуться к detail view

#### Scenario: Background task completes
- **WHEN** свёрнутая или не открытая job достигает `SUCCEEDED`, `FAILED` или `CANCELLED` в активной browser-сессии
- **THEN** frontend показывает ненавязчивое уведомление с результатом и действием открытия соответствующей job

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

### Requirement: Concise progressive disclosure
Основной requirements journey SHALL показывать один главный заголовок, один текущий статус и не более одной постоянно видимой поясняющей строки для каждого смыслового блока; сведения о механике оценочного прогресса, происхождении данных и расширенных деталях research SHALL предоставляться через tooltip или раскрываемые элементы без потери доступности.

#### Scenario: Long-running task is visible
- **WHEN** decomposition или requirements research выполняется
- **THEN** frontend показывает название задачи, непосредственное динамическое сообщение без служебного префикса, elapsed time, типичную длительность, mini-timeline, progress и действия, а пояснение оценочного процента доступно по информационной подсказке

#### Scenario: Saved requirements are unchanged
- **WHEN** сохранённая проверенная или финальная версия не содержит несохранённых изменений
- **THEN** frontend показывает единственный компактный статус с временем сохранения и не показывает неактивную кнопку сохранения

#### Scenario: Research result is reviewed
- **WHEN** пользователь просматривает завершённое requirements research
- **THEN** исходная бизнес-задача и требования для AI доступны через один блок «Исходные данные», а связи, подробности и предложения карточки раскрываются по запросу
