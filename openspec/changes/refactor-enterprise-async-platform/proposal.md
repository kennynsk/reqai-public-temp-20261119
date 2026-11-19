## Why

Текущая реализация связывает frontend и backend в одном production-процессе и выполняет долгие цепочки декомпозиции и исследования через синхронные запросы, оркестрируемые браузером. Для эксплуатации как on-prem enterprise-решения систему необходимо сделать независимо масштабируемой, устойчивой к уходу пользователя, рестартам pod и отказу ЦОД, сохраняя принятые задачи и их результаты.

## What Changes

- **BREAKING**: production frontend и backend становятся независимыми сервисами и разворачиваются отдельными Kubernetes Deployment; backend прекращает раздавать собранный frontend.
- **BREAKING**: долгие операции декомпозиции и research переводятся с синхронных REST-ответов на асинхронную job-модель с `202 Accepted`, устойчивым статусом, checkpoints и сохранённым результатом.
- Оркестрация многоэтапных LLM-процессов переносится из React-клиента в backend workflows на self-hosted Temporal с абстракцией `WorkflowEngine`, допускающей будущую замену на собственный движок поверх PostgreSQL и Kafka.
- Вводятся единый PostgreSQL как источник бизнес-состояния и единый Kafka для версионированных lifecycle-, audit- и delivery-событий; оба предоставляются существующей георезервированной платформой.
- Добавляются история задач, восстановление UI после повторного входа, SSE с REST reconciliation и минимальный опциональный webhook с подписью, повторными доставками и DLQ.
- Добавляются модельный fallback в рамках одного LLM-провайдера, retries, per-model circuit breaker, deadlines, concurrency limits, backpressure и явная трассировка фактически использованных моделей.
- Добавляются полные и частичные успешные результаты, повтор отдельных неуспешных этапов, cooperative cancellation и неизменяемые версии входных данных.
- Пользовательский путь становится последовательным: бизнес-контекст декомпозируется в редактируемую версию требований, после её сохранения пользователь опционально запускает связанный AI-Ресерч прямо внутри workspace «Бизнес-требования», просматривает исходные категорийные инсайты, принимает или отклоняет предложенные улучшения и сохраняет новую финальную версию требований без перехода в самостоятельный legacy-модуль исследования рынка.
- Добавляются потоковая загрузка и обработка входов/результатов до 100 МБ через PostgreSQL artifacts, chunking и иерархический synthesis; крупные payload не передаются через Temporal, Kafka, SSE или webhook.
- Добавляются интеграция IAM/NGAM, роли, audit и логическая tenant-изоляция; первая версия использует один `DEFAULT_TENANT_ID`.
- Добавляются active-active application deployments в двух ЦОД поверх единых георезервированных PostgreSQL/Kafka, HA Temporal, maintenance/drain, retention, observability, graceful shutdown и проверяемые RPO/RTO.
- Все статические лимиты и политики конфигурируются через env; оперативный maintenance state хранится в PostgreSQL.

## Capabilities

### New Capabilities

- `independent-service-deployment`: Независимая сборка, публикация, маршрутизация и масштабирование frontend, API и worker-компонентов в Kubernetes.
- `durable-job-processing`: Устойчивая асинхронная job-модель, Temporal workflows, checkpoints, восстановление после сбоев, отмена и частичное завершение.
- `job-api-and-notifications`: Версионированный REST API задач, история, SSE reconciliation и опциональная webhook-доставка.
- `llm-execution-resilience`: Приоритет моделей, классифицированные retries/fallback, per-model circuit breaker, deadlines, concurrency и audit попыток.
- `large-artifact-processing`: Потоковое хранение и обработка входов и результатов до 100 МБ без передачи крупных payload через управляющие каналы.
- `enterprise-access-and-tenancy`: Интеграция IAM/NGAM, RBAC, audit и логическая tenant-изоляция с одним tenant по умолчанию.
- `enterprise-operations`: Active-active приложение в двух ЦОД, health/readiness, maintenance, retention, observability, SLO, RPO/RTO и backpressure.

### Modified Capabilities

Отсутствуют: в проекте пока нет main specs, все поведенческие контракты вводятся как новые capabilities.

## Impact

- Frontend: единый API client, job-oriented UI, история, восстановление состояния, SSE, потоковая работа с artifacts и последовательный workspace «контекст → декомпозиция → редакция → опциональный research → финальная версия».
- Backend: декомпозиция монолитного `server/index.js` на API, workflow activities, provider adapters, event delivery и maintenance workers.
- API: новые `/api/v1/jobs`, artifacts, events, cancel/retry и result endpoints; существующие синхронные `/api/*` подлежат миграции и последующему отключению.
- Infrastructure: два container image, Kubernetes Deployments/Services/Ingress, self-hosted Temporal, существующие PostgreSQL/Kafka, IAM/NGAM и secret/certificate mounts.
- Data: миграции для jobs, steps, artifacts, attempts, outbox, audit, webhook deliveries, retention и tenant-aware access; сохранённые версии требований и parent/child linkage между decomposition и research jobs.
- Operations: dashboards, alerts, tracing, capacity/load tests, failure drills и multi-DC rollout/rollback procedures.
