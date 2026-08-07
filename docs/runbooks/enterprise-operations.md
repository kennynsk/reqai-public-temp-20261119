# ReqAI enterprise runbooks

Все команды выполняются через утверждённые on-prem Kubernetes/Temporal/PostgreSQL инструменты. Перед изменением зафиксировать incident ID, actor, ЦОД и текущую версию operational state.

## Maintenance и drain
1. `PUT /api/v1/admin/operations/mode` с `DRAIN` и expectedVersion. Убедиться, что readiness снята и NGAM прекратил новый трафик.
2. Проверить отсутствие новых activity starts и дождаться configured grace. Второй ЦОД должен оставаться `NORMAL`.
3. После работ вернуть `NORMAL`; проверить API p95, backlog и stalled jobs.

## Model outage / circuit
Проверить circuit и fallback по моделям из `ZAI_MODELS`, reason codes и provider quota. Не увеличивать concurrency сверх подтверждённых TBD RPM/TPM. При полном outage включить `ACCEPT_AND_QUEUE`; после восстановления вернуть `NORMAL` и наблюдать backlog.

## Backlog
При soft limit decomposition сохраняет приоритет, research получает `429`. При hard limit новые jobs отклоняются без удаления принятых. Масштабировать только соответствующий worker pool и учитывать per-model distributed leases.

## Workflow retry/reset
Обычный retry создаёт связанную новую job. Temporal reset разрешён только system-admin: сначала audit, затем reset на подтверждённый workflow-task event. После операции сверить PostgreSQL job и Temporal execution.

## Webhook DLQ
Проверить allowlisted destination, TLS, signature и response codes. После устранения причины system-admin вызывает redelivery; payload не должен содержать artifact content.

## Dependency outage
PostgreSQL: API readiness false, не принимать jobs. Kafka: бизнес-состояние остаётся в PostgreSQL/outbox. Temporal: jobs остаются ACCEPTED/QUEUED, reconciler повторит start. Никогда не восстанавливать business state только из Kafka.

## Rollback
Вернуть frontend `VITE_ASYNC_PLATFORM_ENABLED=false` и NGAM route на legacy API. Миграции additive и не откатываются destructive SQL. Отключение legacy допускается только после compatibility window и sign-off.
