# ReqAI enterprise runbooks

Все команды выполняются через утверждённые on-prem Kubernetes/Temporal/PostgreSQL инструменты. Перед изменением зафиксировать incident ID, actor, ЦОД и текущую версию operational state.

## Maintenance и drain
1. `PUT /api/v1/admin/operations/mode` с `DRAIN` и expectedVersion. Убедиться, что readiness снята и NGAM прекратил новый трафик.
2. Проверить отсутствие новых activity starts и дождаться configured grace. Второй ЦОД должен оставаться `NORMAL`.
3. После работ вернуть `NORMAL`; проверить API p95, backlog и stalled jobs.

При удалении execution mode сначала развернуть admission block, сохраняя совместимые workers, и выполнить `npm run qualify:legacy-drain` для каждой затрагиваемой базы/tenant scope. Удалять worker/activity/prompt support можно только при `qualified: true` и `activeCount: 0`.

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
Обычный rollback возвращает предыдущие frontend/API/worker images и соответствующий им полный ConfigMap/Secret set; смешивать старый worker с новым сокращённым prompt/config catalog нельзя. Миграции additive и не откатываются destructive SQL. Исторические rows и artifacts не переписываются, поэтому возврат image/config восстанавливает старый execution contract без восстановления базы из backup. Перед rollback проверить, что новые jobs не используют несовместимый schema/prompt version.

## MCP gateway: canary, incident и rollback

Gateway публикуется отдельно и по умолчанию имеет `replicas: 0`, `MCP_ENABLED=false`. Перед canary выставить подтверждённые HTTPS host/backend URL и same-audience IAM, затем прогнать MCP protocol, auth/tenant, idempotency и failure qualification. Ограничить ingress allowlist первыми клиентами и следить за `reqai_mcp_tool_calls_total`, auth rejections, backend errors, latency и readiness.

При incident снять ingress route или вернуть `MCP_ENABLED=false`/`replicas: 0`. Не останавливать API и workers: уже принятые REST jobs продолжаются, а их `jobId` остаются валидны. Проверить отсутствие токенов/requirements в логах, отозвать скомпрометированные JWT в IAM и только после устранения причины снова провести canary. Gateway не хранит job state, поэтому отдельное восстановление данных не требуется.

## Подготовка выпуска после аудита 2026-10-15

Kubernetes production overlays и порядок bootstrap находятся в [deploy/k8s/production/README.md](../../deploy/k8s/production/README.md). Шаблоны намеренно не проходят release policy без значений целевой среды. Подготовьте образы, namespace, IAM/JWKS/audience/роли, HTTPS ingress, DNS, TLS Kafka/Temporal, секреты, резервное копирование и проверенный откат. Значения хранятся вне Git. Выполните canary авторизации и tenant isolation в целевой среде до открытия доступа.

Secret `reqai-data-secrets` содержит только доступ к данным, `reqai-llm-secrets` подключается только к API и workflow workers, `reqai-api-secrets` — только к API, `reqai-webhook-secrets` — только к event worker. При переходе сначала создайте отдельные Secrets, затем обновите workloads; удалять старый общий Secret можно только после проверки отсутствия потребителей.

Frontend Nginx работает от UID 101 с read-only root и writable emptyDir для `/var/cache/nginx` и `/var/run`. В Kubernetes `/api` маршрутизируется ingress прямо в reqai-api: не используйте Docker DNS resolver frontend как Kubernetes API proxy. Проверка манифеста не заменяет реальный запуск Nginx и проверку ingress в кластере.

Миграций данных в этом исправлении нет. Откат к предыдущей версии приложения требует сохранения совместимости immutable-версий требований и новых prompt releases 2.16.0/2.17.0; не редактируйте исторические prompt bundles. Изменение MCP schema 3.0.0 требует обновления клиентов до включения gateway.

Privacy-исправления ограничивают новые Temporal activity results и события переименования ссылками/статусами. До исправления histories и Kafka/outbox могли содержать source-derived title/search_summary или объяснения проверки. Старые записи не переписаны и не удалены. Для уже существующей среды ограничьте операторский доступ к Temporal UI/history и Kafka и примените согласованную retention-политику; API чтение старого base trace теперь маскирует свободный текст.

## Первый production-запуск без переноса dev-данных

Для текущего первого выпуска согласован fresh-start: существующие PostgreSQL rows/artifacts, Kafka/outbox и Temporal histories принадлежат dev и в production не переносятся. Нужны отдельные пустые production stores/namespaces, проверка их изоляции и штатные schema migrations/init. Подключение dev volumes/backups и автоматическая очистка текущего reqai не входят в запуск. Удаление или миграция старых dev diagnostics не блокируют такой изолированный старт. Требования к защите, retention, backup/restore и rollback новых production-данных сохраняются. Подготовлены реальные Kustomize overlays, offline policy validator и suspended SQL migration Job. Конкретные target inputs, интеграция пользовательского IAM-входа, runtime/restore/rollback evidence ещё требуют проверки в отдельно авторизованной среде; см. [конфигурацию и порядок запуска](../../deploy/k8s/production/README.md).
