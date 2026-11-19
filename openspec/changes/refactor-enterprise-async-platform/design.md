## Context

См. `proposal.md` — Why. Сейчас React-клиент оркестрирует несколько синхронных `/api/*` вызовов, включая параллельные research-запросы и последовательные analyze/synthesis/improve шаги. Express-приложение одновременно содержит HTTP routes, LLM adapters, logging, env loading и раздачу `client/dist`; постоянного job state, очереди, аутентификации и deployment manifests нет.

Целевая среда — on-prem Kubernetes в двух активных ЦОД. PostgreSQL и Kafka уже предоставлены приложению как единые георезервированные кластеры. Self-hosted Temporal разворачивается с replicas в обоих ЦОД и отдельной PostgreSQL schema. IAM и NGAM являются доверенной границей идентификации. Статические настройки поступают через env.

## Goals / Non-Goals

**Goals:**

- Разделить frontend, API и фоновые workloads на независимо масштабируемые компоненты.
- Гарантировать завершение или явный терминальный исход принятой job независимо от браузера и рестартов pod.
- Перенести orchestration декомпозиции и research в durable workflows с checkpoints.
- Обслуживать оба ЦОД active-active, используя общие PostgreSQL, Kafka и Temporal state.
- Поддержать входы и результаты до 100 МБ без крупных control-plane messages.
- Сделать model fallback, partial success, retries, cancellation, security и operations наблюдаемыми и тестируемыми.
- Сохранить возможность заменить Temporal собственным движком без смены внешнего API и бизнес-модели job.

**Non-Goals:**

- Создание универсального workflow DSL в первой версии.
- Active-active или replication логика PostgreSQL/Kafka внутри приложения.
- Несколько LLM-провайдеров; первая версия использует одного провайдера с несколькими моделями.
- Cost budget enforcement; token usage собирается, но не блокирует выполнение.
- Несколько webhook destinations или пользовательские webhook URL.
- Несколько активных tenant в первом rollout, хотя schema и access checks tenant-aware.

## Decisions

### 1. Разделить execution plane на API и worker Deployments

Frontend собирается в static image и раздаётся Nginx. Backend image предоставляет разные entrypoints для stateless API, Temporal workers, outbox publisher, event delivery и maintenance. Ingress/NGAM сохраняет единый browser origin: `/api/*` направляется в API, остальные пути — во frontend.

API масштабируется по RPS/latency; worker pools — по Temporal backlog с обязательным ограничением concurrency модели. Это устраняет зависимость backend от `client/dist` и предотвращает head-of-line blocking между decomposition и research.

Альтернатива — один backend Deployment со всеми ролями — отклонена, поскольку связывает scaling, rollout и failure domains.

### 2. PostgreSQL является источником бизнес-истины, Temporal — execution state, Kafka — event transport

Основные таблицы/области данных:

- `jobs`, `job_steps`, `job_attempts`, `job_dependencies`;
- `artifacts`, `artifact_content`;
- `idempotency_keys`;
- `outbox_events`;
- `webhook_deliveries`;
- `audit_events`;
- `operational_state`.

Создание job и outbox event выполняется одной PostgreSQL-транзакцией. Dispatcher идемпотентно запускает Temporal workflow с `workflowId = jobId`. Reconciliation worker находит jobs, застрявшие между DB commit и workflow start.

Kafka получает события только из transactional outbox. Бизнес-статус никогда не восстанавливается исключительно из Kafka.

Альтернатива — использовать Kafka как очередь workflow и источник состояния — отклонена из-за необходимости самостоятельно реализовать durable timers, retries, leases и recovery уже в первой версии.

### 3. Изолировать Temporal интерфейсом WorkflowEngine

Application layer использует операции `start`, `cancel`, `retry`, `signal` и `getExecution`; Temporal adapter реализует их через SDK. Внешний REST API, PostgreSQL state machine и versioned events не содержат Temporal-specific identifiers как обязательный контракт.

Workflow definitions могут использовать Temporal SDK внутри adapter/module. Полная абстракция каждого SDK primitive сознательно не создаётся. Будущий custom engine сможет использовать PostgreSQL leases/fencing tokens и Kafka commands/events при сохранении job API.

### 4. Оркестрировать workflow на backend и checkpoint каждый дорогой этап

Decomposition:

```text
validate → normalize/chunk → decompose chunks → merge/validate → persist result
```

Research:

```text
validate → analyze categories → research categories (bounded parallel)
         → synthesize available results → improve requirements → persist result
```

Каждый LLM-этап пишет результат по уникальному `(job_id, step_id, input_hash)`. Повтор activity сначала проверяет checkpoint. Сбой во время незавершённого HTTP-вызова допускает повтор и дополнительную стоимость; exactly-once для внешнего LLM не обещается.

### 5. Использовать явную state machine и раздельные status/outcome

Execution status: `ACCEPTED`, `QUEUED`, `RUNNING`, `RETRY_WAIT`, `SUCCEEDED`, `FAILED`, `CANCEL_REQUESTED`, `CANCELLED`. Успешный результат имеет outcome `COMPLETE` или `PARTIAL`.

Research считается partial success при наличии хотя бы одной успешной категории. Decomposition считается partial success при наличии хотя бы одного непустого раздела. Synthesis получает только успешные ветви и явно перечисляет пропуски. Повтор неуспешных ветвей создаёт новую execution attempt с audit linkage.

### 6. Хранить крупные данные как artifacts и передавать ссылки

Upload/download endpoints работают streaming и применяют лимит 100 МБ и checksum. Для первой версии содержимое размещается в отдельной PostgreSQL schema/table, отделённой от metadata и обычных job queries. Kafka, Temporal, SSE и webhook несут только `artifactId` и небольшие metadata.

Перед LLM-вызовом вход нормализуется, оценивается по token budget, делится на chunks с overlap и проходит map/reduce-style synthesis. Chunk plan и промежуточные summaries checkpointed. Размер chunk и параллелизм конфигурируются per model.

Альтернатива — передавать 100 МБ JSON через job API/Temporal — отклонена из-за memory amplification, transport limits и model context limits. Объектное хранилище остаётся возможной будущей заменой artifact backend.

### 7. Применять model policy snapshot, retry classification и circuit breaker per model

При создании job сохраняются ordered model list, attempts, deadlines, timeouts и concurrency policy. Retry/fallback разрешены для timeout, network, `429`, `5xx`; `400`, `401`, `403`, content-policy и unknown errors non-retryable. Unknown error логируется как `ERROR` с redaction.

Circuit breaker и concurrency semaphore отдельны для каждой модели. Максимум — три модели и две попытки на модель. Deadline: decomposition 60 минут, full research 4 часа. Реальный provider quota остаётся внешним capacity constraint и валидируется до production rollout.

### 8. Доставлять прогресс через versioned events, но сверять через REST

Outbox publisher пишет Kafka events, а SSE отдаёт тот же канонический конверт с `eventId`, `schemaVersion`, `eventType`, `tenantId`, `jobId`, sequence, `occurredAt`, `source` и reference-only `data`. Lifecycle events содержат `status`; `linked-research.created` и `requirements.version-created` передают lineage/version identifiers без искусственного статуса. SSE instances получают события и фильтруют их по активным подпискам; на первой версии допустима независимая consumer group на instance. Клиент всегда делает REST reconciliation после reconnect.

Webhook consumer group доставляет только terminal events на один env-configured URL, подписывает HMAC-SHA256, хранит attempts в PostgreSQL и после исчерпания retries публикует DLQ. Payload содержит ссылку на результат, не artifact.

### 9. Применять IAM/NGAM identity и tenant context во всех слоях

Frontend использует корпоративный authorization flow; API валидирует token issuer/audience/signature/expiry и маппит claims на `user`, `tenant-admin`, `operator`, `auditor`, `system-admin`. `tenantId` никогда не принимается из body. При разрешённом отсутствии claim применяется `DEFAULT_TENANT_ID`.

Все таблицы и events tenant-aware; PostgreSQL RLS используется как дополнительный барьер, причём tenant context устанавливается транзакционно при работе через pool. Production logs содержат metadata и correlation IDs, но не prompts/results/secrets.

### 10. Работать active-active на уровне приложения

Frontend, API, SSE и workers имеют replicas в обоих ЦОД и используют общие георезервированные PostgreSQL/Kafka и единый Temporal cluster. Job не закрепляется за ЦОД; сохраняются только `created_site`, `execution_site`, `completed_site` для аудита. При потере pod/ЦОД Temporal повторно выдаёт незавершённую activity worker другого ЦОД.

NGAM выполняет health-based routing. Плановое обслуживание использует `DRAIN`: новый трафик уходит в другой ЦОД, workers прекращают polling, незавершённые activities завершаются либо повторно назначаются.

### 11. Разделить static env configuration и runtime operational state

Все лимиты, timeouts, retention, model policies, concurrency и endpoints читаются из env, валидируются на старте и безопасно snapshot для job. Secrets поступают через Kubernetes Secret; сертификаты — через secret volume.

Режимы `NORMAL`, `ACCEPT_AND_QUEUE`, `DRAIN`, `REJECT_NEW`, `FAILOVER_IN_PROGRESS` хранятся в PostgreSQL, чтобы меняться без redeploy. Env задаёт default.

### 12. Измерять SLO отдельно от LLM latency

OpenTelemetry связывает ingress request, job, workflow, activity, provider attempt, Kafka event и webhook delivery. Prometheus-compatible metrics покрывают API latency, queue wait, active jobs, model concurrency, fallback, circuit state, stalled jobs, artifact throughput, retention и delivery.

Capacity baseline: 100 concurrent users, 30 jobs/min, 5 typical и 10 maximum research categories. Admission применяет per-user limits, soft/hard backlog и приоритет decomposition. Окончательные worker concurrency и backlog thresholds калибруются нагрузочными тестами и реальными RPM/TPM лимитами провайдера.

### 13. Связать декомпозицию, редакцию и research через immutable artifacts

Результат decomposition остаётся неизменяемым artifact исходной job. Пользовательская редакция бизнес-, функциональных и нефункциональных требований сериализуется в новый versioned requirements artifact. Research запускается только явным действием пользователя и получает этот сохранённый artifact как `inputArtifactId`; новая research job связывается с decomposition job через `parentJobId`.

Research возвращает исходную сохранённую версию, набор адресных предложений и proposed final version. Принятие или отклонение предложений выполняется в frontend, после чего выбранное состояние сохраняется как новый requirements artifact, не изменяя decomposition result или research input. Это сохраняет воспроизводимость каждой job и позволяет показать происхождение финального требования.

Связанный research из decomposition использует отдельный feature mode `REQUIREMENTS_INSIGHTS`, сохраняющий семантику исходного AI-Ресерчера: специализированный `buildInsightsPrompt` формирует 8–12 инсайтов по категориям `trends`, `patterns`, `risks`, `competitors` и `standards`, включая `applicability`, `source_types`, `relatedTo` и готовые `enhancements`. Этот режим выполняется как durable child research job, но frontend продолжает показывать workspace «Бизнес-требования»: running state, карточки инсайтов, фильтры, возврат к требованиям и применение улучшений находятся внутри одного пользовательского пути. Самостоятельный модуль «Исследование рынка» остаётся отдельным инструментом для generic research и не открывается автоматически.

Альтернатива — автоматически выполнять research внутри decomposition workflow — отклонена: она делает платный длительный этап неявным, не использует пользовательские правки и смешивает два независимо отменяемых бизнес-действия. Альтернатива — передавать редакцию только через React state — отклонена, поскольку состояние теряется после reload и не создаёт аудируемую версию входа.

### 14. Разделить progress бизнес-сценария и выполнение активной job

Четырёхэтапный stepper `контекст → требования → AI-исследование → финальная версия` показывает положение пользователя в продуктовой работе и не используется как процент готовности текущего LLM-вызова. Чтобы не конкурировать с execution indicator, stepper показывает `Этап N из 4` и состояние шагов без отдельного значения `25/50/75/100%`. Активная job получает отдельный `ActiveJobPanel` с текущей пользовательской фазой, прошедшим временем, визуальным execution progress и mini-timeline `подготовка → AI-анализ → сборка → сохранение`.

Исходная бизнес-задача остаётся доступной на всех последующих этапах requirements journey. Для decomposition используется её собственный input artifact, а для связанного research frontend разрешает `parentJobId` до родительской decomposition job и загружает её input artifact. Контекст показывается в компактном раскрываемом блоке над текущим результатом, поэтому просмотр не сбрасывает решения по инсайтам и не уводит пользователя из workflow.

Информационная иерархия requirements journey использует progressive disclosure. Повторяющиеся eyebrow, subtitle, success badge и disabled save controls не показываются, если тот же смысл уже выражен stepper, заголовком или единым статусом сохранения. Loading-карточка выводит непосредственное действие (`Формируем бизнес-требования…`) без префикса «Сейчас в фокусе»; формулировка «Процент — ориентировочная оценка. Переходы между этапами подтверждаются сервером» доступна через tooltip. В завершённом research бизнес-контекст и версия требований объединяются под «Исходные данные». Заголовок и summary карточки всегда показываются полностью, поскольку несут основной смысл; только связи, detail, источники и enhancements раскрываются пользователем.

Checkpoint wrapper при старте и успешном завершении дорогого этапа обновляет durable job projection (`current_step`, `message`, `progress`) и пишет versioned progress event в transactional outbox. Обновление progress не является lifecycle transition и не должно повторно переводить `RUNNING → RUNNING`; repository предоставляет отдельную идемпотентную операцию обновления projection. REST остаётся источником истины, а SSE ускоряет обновление клиента.

Workflow-specific mapping переводит технические step IDs в небольшой стабильный набор пользовательских фаз: проверка входа, подготовка контекста, работа AI, сборка результата и сохранение. Durable percentage меняется только на границах подтверждённых milestones. UI отдельно вычисляет монотонный visual progress между durable anchor и фазовой границей: кривая быстро движется в начале, затем асимптотически замедляется и никогда не достигает следующего milestone без REST/SSE-события. Для `model` decomposition visual progress ограничен значением ниже `90%`, для `model` requirements insights — также ниже `90%`; `assembly` и terminal state всегда подтверждаются backend. Перезагрузка страницы восстанавливает оценку из `startedAt`, текущей фазы и authoritative progress, поэтому полоса не откатывается.

Внутри `model` UI циклически, с интервалом 12–18 секунд, показывает безопасные workflow-specific сообщения о текущем фокусе обработки. Для decomposition это анализ целей и ограничений, выделение ролей и сценариев, формирование бизнес-, функциональных и нефункциональных требований и подготовка структуры. Для requirements insights это сопоставление с практиками, архитектурные паттерны, риски, стандарты, рекомендации и связь с исходными требованиями. Такие сообщения не отмечаются как завершённые checkpoints и не попадают в durable API/event projection.

Mini-timeline отражает только подтверждённую фазу: предыдущие шаги имеют completed state, текущий — animated active state, последующие — pending. Незаполненная часть execution bar содержит непрерывный shimmer, активный шаг мягко пульсирует, а подпись объясняет, что индикатор плавно оценивает выполнение по типичной длительности и подтверждает этапы по серверному состоянию. Countdown и обещание точного времени завершения не используются.

После действия «Продолжить в фоне» detail view закрывается без cancellation. Workspace сохраняет подписку или периодическую REST reconciliation для известных активных jobs, показывает компактный глобальный индикатор и terminal toast с действием открытия результата. История остаётся durable fallback после reload или закрытия браузера; browser push notifications в текущем change не требуются.

Альтернатива — линейно анимировать процент до 90% по таймеру — отклонена: она создаёт ложную скорость и снова зависает на верхней границе. Выбрана ограниченная ease-out интерполяция, которая явно остаётся visual estimate и не управляет состоянием job. Альтернатива — читать защищённую Debug trace в обычный UI — отклонена, чтобы не связывать пользовательский контракт с внутренними step names и диагностическими правами.

## Risks / Trade-offs

- [Temporal cluster через два ЦОД зависит от latency и гарантий persistence] → Провести infrastructure validation и failure drills; SLO приложения считать достижимым только при совместимых SLO зависимостей.
- [Activity может повторить уже оплаченный LLM-вызов после падения] → Checkpoints, provider request IDs, input hashes, bounded attempts и явный audit/token usage.
- [100 МБ в PostgreSQL увеличивают backup, vacuum и query costs] → Отдельная schema, streaming, отсутствие content в обычных queries, batch retention; сохранить возможность object storage backend.
- [30 jobs/min могут породить сотни model calls/min] → Per-model semaphore, backpressure, priority queues, admission control и provider quota validation.
- [SSE instance читает широкую ленту событий] → REST остаётся источником истины; после измерения нагрузки заменить на специализированный subscription routing при необходимости.
- [Partial result может быть принят за полный] → Раздельные status/outcome, заметная UI-маркировка, список пропусков в API/SSE/webhook.
- [Env change не влияет на текущую job] → Показывать configuration snapshot и применять новые настройки только к новым jobs; emergency cancellation остаётся runtime operation.
- [Пользователь может запустить research по несохранённой или устаревшей редакции] → Разрешать запуск только после успешного создания versioned requirements artifact и показывать идентификатор/время версии в workspace.
- [Logical tenant isolation зависит от корректного query context] → Централизованный authorization layer, RLS, negative isolation tests и audit.
- [Отсутствие cost budget допускает повышенный расход] → Жёсткие attempts/deadlines/categories/concurrency limits и обязательный token usage monitoring.
- [Замена Temporal всё равно потребует значительной реализации] → Стабилизировать API/state/events и WorkflowEngine boundary, не обещая переносимость внутренних workflow definitions.
- [Visual progress может быть принят за точную готовность модели] → Использовать ease-out только внутри подтверждённых фаз, не пересекать следующий milestone, не показывать countdown, подписывать оценочный характер и сохранять mini-timeline фактических этапов.
- [Фоновая job завершится после потери SSE] → Выполнять REST reconciliation для известных активных jobs и сохранять историю как источник восстановления после новой сессии.

## Migration Plan

1. Создать API v1 contract, database migrations, auth/tenant context и observability foundation без отключения legacy endpoints.
2. Разделить frontend и backend images; развернуть новые API и worker роли параллельно текущему production path.
3. Добавить artifacts, job state, outbox/Kafka и Temporal cluster/namespace; проверить idempotency и reconciliation.
4. Перенести decomposition workflow на async job API и включить новый UI за feature flag.
5. Перенести research orchestration, partial success, model fallback и cancellation; сохранить legacy flow для rollback.
6. Включить SSE/history, затем минимальный webhook и operational tooling.
7. Выполнить load, soak, pod-kill, dependency outage, rolling update и multi-DC failure tests; подтвердить SLO/RPO/RTO.
8. Перевести production traffic на `/api/v1`, наблюдать canary, затем удалить backend static serving и после согласованного периода отключить legacy synchronous endpoints.

Rollback выполняется возвратом frontend feature flag и ingress route на legacy flow до начала необратимого удаления. Database migrations сначала только additive; destructive cleanup выполняется отдельным change после стабильного rollout.

## Open Questions

- Фактические RPM, TPM, context/output limits и параллельность каждой LLM-модели должны быть получены у платформы провайдера до настройки production concurrency.
- Конкретные IAM/NGAM issuer, audience, claim names и service-account flow уточняются при интеграции без изменения общей модели доступа.
- Допустимый меж-ЦОД RTT и операционный SLO self-hosted Temporal подтверждаются инфраструктурным нагрузочным и failure-тестом.
