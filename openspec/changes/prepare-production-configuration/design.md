## Context

См. proposal.md. В репозитории уже есть Kubernetes base для frontend/API/workers и optional MCP. Это основание production overlay; локальный Compose остаётся dev entrypoint. Реальный cluster, IAM, hosts, certificates, storage endpoints и service accounts пока не заданы. Они будут обязательными deployment inputs, а не угаданными значениями.

Пользователь подтвердил fresh-start: существующие данные — development, в production они не переносятся. Это отменяет необходимость миграции старых diagnostic histories перед первым запуском, но не отменяет создание SQL-схем и защиту новых production-данных.

## Goals / Non-Goals

**Goals:** один reviewable production profile поверх существующих манифестов; hermetic offline validation; scoped credentials; отдельные доказательства target runtime qualification; первый запуск пустых stores.

**Non-Goals:** в этом change не менять product/API/MCP tool inventory, не устанавливать Kubernetes/IAM/брокеры, не выбирать облачного провайдера, не создавать контейнеры, не применять manifests, не публиковать images, не очищать текущий dev и не переносить его данные. Cleanup и MCP contract alignment выполняются отдельно.

## Decisions

1. **Сохранить существующий Kubernetes deployment путь.** Реализован `deploy/k8s/production/` overlay и публичный non-secret input example/contract, соответствующие существующим объектам. Использовать встроенный Kustomize либо эквивалентный имеющийся renderer без новой templating-платформы. Альтернатива — объявить текущий Compose production — отвергнута: он фиксирует dev auth/TLS/credentials и другую модель запуска. Base остаётся шаблоном, production readiness относится только к конкретному rendered release.
2. **Сначала render/check, затем явные внешние gates.** Отдельная offline-команда читает явный input file и rendered manifests, сверяет ожидаемые env keys с backend/gateway config contract и не вызывает kubectl apply, сеть или Docker. Никакой загрузки `.env.dev` и implicit process.env secret values. Отчёт содержит названия полей, boolean presence и коды; rendered secret values и секретные env не печатаются. Альтернатива — один скрипт validate-and-deploy — отвергнута из-за неявных инфраструктурных мутаций.
3. **Явный input contract.** Нужны release/image digests; namespace/site; replica/resource/topology values под целевую ёмкость; public host/ingress class/TLS Secret; DATABASE_URL Secret ref и verified TLS trust; Kafka brokers/SASL/trust; Temporal address/namespace/mTLS Secret; IAM issuer/audience/JWKS/tenant/user/roles mapping; LLM provider/model allowlist/quotas; активные и released prompt versions; opt-in MCP endpoint/hosts/readiness token ref; retention и owner-approved RPO/RTO. Использовать реальные существующие ключи, включая `DATABASE_SCHEMA`/`DATABASE_ARTIFACT_SCHEMA`; не добавлять параллельные неиспользуемые aliases. Не публиковать реальные values в Git.
4. **Role credential matrix.** Frontend получает только public runtime/build inputs; API — data access + IAM integration + discussion LLM; decomposition/research workers — data + LLM + Temporal trust; event-worker — data + webhook credentials; maintenance — data; MCP — backend/public endpoint policy и отдельный readiness token. Только API/workflow имеют LLM key. Secret refs проверяются с учётом полного состава Secret, а не только имени. ServiceAccount token не монтируется без нужды. Точное доверие/egress определяется существующей инфраструктурой, без навязывания CNI или secret manager.
5. **Fresh stores без import.** Профиль явно объявляет clean bootstrap. Оператор подтверждает отдельные production PostgreSQL database, Kafka storage/topics и Temporal namespace; preflight проверяет изоляцию и пустоту служебными counts/metadata без чтения artifact content. Все штатные SQL migrations 001…текущая применяются отдельным контролируемым migration identity к пустой БД. Runtime DB identities не должны быть superuser/BYPASSRLS. Init creates schemas/topics/namespace; это не перенос пользовательских данных. Dev volumes, backups, rows, outbox и workflow histories не подключаются и не удаляются.
6. **MCP opt-in.** Default: disabled/no public usable route/replicas zero. Enabled mode требует schema 3.0.0, HTTPS, approved hosts, same-audience forwarding и least-privilege readiness identity. Canary проходит official SDK client с exact tool/schema assertions и auth failures. Никаких дополнительных MCP upload/content/cancel операций.
7. **Иммутабельный release manifest.** Один документ фиксирует frontend/backend/gateway image digests, prompt bundle hashes/versions и совместимые config refs. Published prompt assets не переписываются. Секреты именуются/версионируются внешне; rollback совместимого release меняет coordinated app/config references, а не данные. После появления production-данных нельзя использовать fresh-start для их уничтожения или повторного bootstrap.
8. **Runtime qualification — отдельный результат.** В целевом окружении нужны реальный Nginx UID 101/read-only root + writable `/var/cache/nginx`/`/var/run`, probes, API/SPA routing, auth/role/tenant canaries, оба Temporal queues, Kafka outbox/event delivery, maintenance, synthetic GLM → review/save → research → final/export, restart/drain, backup/restore/rollback. Offline pass не меняет эти статусы на passed.

## Risks / Trade-offs

- Входные данные окружения ещё не предоставлены → контракт описывает обязательные поля; renderer отказывает при missing/placeholders вместо выдумывания production values.
- Внешний ingress/IAM может проверять identity иначе, чем backend → подтвердить единый issuer/audience/claims на реальных ограниченных тестовых identities.
- Манифест синтаксически валиден, но точный image не запускается с read-only root → обязательный runtime gate с тем же digest/securityContext.
- Случайно подключён dev volume/backup → explicit isolation inventory, read-only bootstrap preflight, отсутствие автоматических cleanup/import операций.
- Fresh-start ошибочно повторён после появления данных → отдельный first-launch approval/state marker в release checklist; повторная установка не делает destructive reset.
- Хранилища и IAM управляются вне репозитория → owner предоставляет refs/trust/ACL и подписывает runtime evidence; приложение не создаёт альтернативную инфраструктуру.

## Migration Plan

1. Подготовить и offline-проверить production overlay на синтетических non-secret fixtures.
2. Получить обязательные inputs/ref values от владельца целевой среды; сформировать reviewable release без раскрытия credentials.
3. В отдельно авторизованной deployment-задаче подтвердить fresh-store isolation, provision/init и выполнить schema migrations. Не останавливать и не очищать текущий reqai.
4. Запустить exact images и внешние gates на synthetic tenant/test identities, включая optional MCP только если он выбран.
5. Открывать пользовательский доступ только после полного gate evidence и проверенного restore/rollback. При неуспехе не импортировать dev data; откатить coordinated release refs в рамках отдельного разрешённого deployment.

## Open Questions

Это значения параметров и владение внешней средой; они не меняют выбранный подход и не нужны для написания/тестирования renderer на fixtures: cluster/namespace/ingress host, image registry/digests, endpoints/trust и Secret refs, IAM claim mapping/test identities, capacity/quotas, retention/RPO/RTO, enabled/disabled MCP. Реальный запуск остаётся заблокированным до их предоставления и проверки.

## Implementation notes

Реальные entry points — `deploy/k8s/production/` и соседний `deploy/k8s/production-mcp/`. Общие manifests перенесены в `deploy/k8s/base/`: sibling layout нужен для штатных Kustomize load restrictions; отключение ограничений и remote plugins не используется. `kubectl kustomize` выполняет offline render, `scripts/qualification/kubernetes.mjs` — static policy и экспорт reviewable bootstrap/workload/release файлов. Runtime ConfigMaps имеют content hashes; Secrets импортируются по отдельным keys. Migration Job suspend=true и исключается из workload phase. Read-only PG preflight и отдельный grant template предназначены исключительно для будущей авторизованной целевой среды. Добавлен поддерживаемый `TEMPORAL_TLS_CA_CERT_PATH` → SDK `serverRootCACertificate`, поскольку Node extra CA не настраивает trust Rust Temporal worker автоматически.

Готовность browser IAM-входа требует существующего корпоративного auth host/edge, который выдаёт и передаёт пользовательский Bearer; у SPA нет собственного OIDC login. Конкретные URL/annotations этой внешней интеграции не изобретаются. Она включена в обязательные runtime gates, а не объявлена выполненной по наличию IAM env.
