# ReqAI: Kubernetes production-конфигурация

Это реальные Kustomize-манифесты приложения. Они не устанавливают кластер, PostgreSQL, Kafka, Temporal, IAM или ingress controller. Текущий Docker Compose `reqai` не затрагивается. Dev-данные, volumes, Kafka events и Temporal histories не переносятся.

В репозитории намеренно оставлены `replace-*`, нулевые digest, квоты и RPO/RTO: их нельзя принять за значения реальной среды. Рендер YAML работает, проверка выпуска с ними завершается ошибкой. Ни одна приведённая ниже команда не выполняет apply/deploy.

## Файлы

| Путь от `deploy/k8s/` | Содержание |
|---|---|
| `base/` | Общие исходные workloads; прежние platform/workers/MCP YAML перенесены сюда без потери настроек. Не применять напрямую: это шаблоны с TBD. |
| `production/kustomization.yaml` | Основной профиль, namespace, три image digest, генерация ConfigMap |
| `production/runtime.env` | Только несекретные параметры API/workers |
| `production/workloads.patch.yaml` | Доступ к отдельным Secret keys, securityContext, drain, временный каталог workflow workers |
| `production/ingress.patch.yaml` | HTTPS, host, ingress class, `/api` → API, `/` → frontend |
| `production/network-policy.yaml` | Вход только от ingress namespace и MCP; worker HTTP не публикуется |
| `production/nginx.conf` | SPA fallback и health; API обслуживается Ingress, Docker DNS не используется |
| `production/migration-job.yaml` | Штатные SQL migrations, отдельная DB identity, **suspend: true**, без автоматических retries |
| `production-mcp/` | Opt-in MCP: две реплики, HTTPS `/mcp`, schema 3.0.0 |

Базовый профиль держит MCP в нуле реплик и не содержит MCP Ingress. Service/SA/NetworkPolicy и ConfigMap зарезервированы для последующего включения. Все три образа, включая неактивный gateway, фиксируются в согласованном release. При переходе с MCP-enabled на disabled оператор отдельно удаляет прежний MCP Ingress: обычный apply отсутствующие объекты не удаляет; автоматического prune в проекте нет.

## Обязательные параметры

Подготовьте рабочую копию конфигурации для конкретной среды в закрытом deployment-репозитории. Секреты не добавляйте в YAML/env/Git. Non-secret endpoints тоже могут быть внутренними: публикуйте только согласованную конфигурацию.

1. В `kustomization.yaml`: namespace и **registry/repository@sha256** для frontend/backend/MCP. Backend один и тот же у API, всех workers и migration Job. Digest должны относиться к образам, собранным из проверенного состояния; frontend — с `VITE_ASYNC_PLATFORM_ENABLED=true`. Приватный registry при необходимости требует `imagePullSecrets` на pod/SA, подготовленный вне Git.
2. В `runtime.env`: site, обслуживаемый tenant, IAM issuer/audience/JWKS/claims/role mapping, production Kafka endpoints и topics, Temporal address/namespace/server name, workflow build ID, allowlist моделей и согласованные квоты, RPO/RTO. Квоты в этом шаблоне нулевые и требуют подтверждения владельцем ZAI-аккаунта. Retention — начальные значения приложения; согласуйте их с политикой владельца данных.
3. В `ingress.patch.yaml`: реальный HTTPS host, class и TLS Secret. Профиль наследует **NGINX-specific annotations** существующего проекта, не устанавливает controller. Используйте поддерживаемый вашей платформой controller; для другого controller замените annotations, timeout/body-size/SSE и HTTPS policy эквивалентами и адаптируйте проверку. Это не рекомендация устанавливать ingress-nginx.
4. В `network-policy.yaml` и `workloads.patch.yaml`: namespace ingress controller; DNS egress MCP по умолчанию адресует `kube-system` (для NodeLocal DNS/другой DNS-топологии согласовать отдельное правило). Для действия NetworkPolicy нужен CNI с их поддержкой. Egress остальных ролей управляется политиками платформы; этот профиль не заявляет полную egress-изоляцию.
5. Проверьте replicas/resources/PDB/topology: унаследованное распределение по `topology.kubernetes.io/zone` — `DoNotSchedule`. На single-zone кластере измените topology/replicas/PDB согласованно. Pool max умножается на число API/workers; проверьте лимиты PG и суммарную LLM concurrency. Шаблон не является результатом нагрузочного sizing.
6. Если нужен MCP, дополнительно заполните `production-mcp/ingress.yaml`, patch endpoint/allowed hosts в `production-mcp/kustomization.yaml` и `MCP_BUILD_VERSION` в основном workloads patch. Namespace двух overlays должен совпадать.

### Внешние Secrets в том же namespace

Названия — контракт профиля; при переименовании согласованно обновите references и policy validator. Приложение получает только явно указанные keys, даже если в Secret есть другие данные. Проверка не считывает Kubernetes Secrets.

| Secret | Keys | Потребители |
|---|---|---|
| `reqai-runtime-database` | `url` | API и четыре workers |
| `reqai-migration-database` | `url` | Только migration Job; отдельная migration DB role |
| `reqai-zai` | `api-key` | API discussions, decomposition/research workers |
| `reqai-kafka` | `username`, `password` | Только event worker |
| `reqai-temporal-client` | `tls.crt`, `tls.key` | API, workflow workers, event worker |
| `reqai-trust` | `postgres-ca.crt`, `node-ca.pem`, `temporal-ca.crt` | Read-only CA volumes; `node-ca.pem` — доверенные CA для Kafka/HTTPS; Temporal получает свой CA напрямую в SDK |
| `reqai-web-tls` | `tls.crt`, `tls.key` | Ingress приложения |
| `reqai-mcp-readiness` | `bearer-token` | Только включённый gateway; JWT ограниченной readiness identity, совместимый с API IAM |
| `reqai-mcp-tls` | `tls.crt`, `tls.key` | Только MCP Ingress |

`DATABASE_URL` должен задавать именно production database; не добавляйте `sslmode`, `sslcert`, `sslkey`, `sslrootcert` в query: pg connection-string parser может переопределить отдельные TLS options. Используются `DATABASE_SSL_MODE=verify-full` и смонтированный CA. Runtime role — `NOSUPERUSER NOBYPASSRLS`, не владелец схем/таблиц и не член migration/owner/privileged roles. Tenant RLS остаётся включённым и forced. API/worker ServiceAccounts не получают Kubernetes API token или RBAC bindings. Ротация env credentials, readiness JWT, CA и mTLS требует контролируемого rolling restart соответствующих pods: ConfigMap hash не отслеживает содержимое внешних Secrets, а TLS-клиенты читают сертификаты при старте.

Webhook в профиле выключен. При включении нужны отдельные event-only Secret key, HTTPS URL и allowlist, затем обновление policy test; IAM client secret backend для обычной проверки JWT не требуется. Frontend/MCP не получают LLM/DB/Temporal credentials.

### Как пользователь входит

В приложении нет самостоятельной страницы OIDC login/refresh/logout. Backend проверяет **Bearer JWT**, а браузерный host может передать пользовательский токен через существующий `auth-session` API. До открытия доступа владелец IAM должен подключить корпоративный auth host/edge, который выполняет вход/выход и передаёт актуальный пользовательский Bearer в API (например, через auth response header у утверждённого gateway). Одних `AUTH_ENABLED=true` и HTTPS для полного пользовательского входа недостаточно. Не встраивайте общий bearer/client secret в SPA и не отключайте backend JWT validation.

Конкретные auth-proxy URL/annotations зависят от платформы и здесь не придуманы. Эта интеграция и проверка истечения токена/выхода — **обязательный внешний gate**, пока её нет продукт нельзя объявлять доступным реальным пользователям.

## Offline render и проверка

Нужны Node 22, `npm ci` с dev dependencies и `kubectl` с встроенным Kustomize. Проверено kubectl 1.36.1 / Kustomize 5.8.1. Команды не читают kubeconfig/`.env.dev`, не обращаются к сервисам и не создают контейнеры.

```bash
# Только посмотреть синтаксически отрендеренный шаблон (это ещё не policy pass):
kubectl kustomize deploy/k8s/production > /tmp/reqai-production.yaml

# Проверить заполненную конфигурацию:
npm run qualify:kubernetes -- production
# Или выбранный MCP профиль:
npm run qualify:kubernetes -- production-mcp

# После успешной проверки записать в НОВЫЙ каталог файлы конкретного release:
npm run qualify:kubernetes -- production --out-dir /tmp/reqai-release-001

# Изолированные positive/negative fixtures, включая оба Kustomize overlays:
node --test scripts/qualification/kubernetes.test.mjs scripts/qualification/release-deployment.test.mjs
```

С незаполненным репозиторным шаблоном `qualify:kubernetes` **должен завершиться с кодом 1**. Диагностика содержит только имена полей и коды. В существующий output directory скрипт не пишет. При успехе создаются `bootstrap.yaml`, `workloads.yaml`, `release.json` с image digests, активными/released prompt hashes и SHA-256 полного render. Сохраните рядом approved input revision и версии внешних Secrets/сертификатов, без их значений. ConfigMap content hashes меняют pod references при изменении конфигурации.

Это локальная policy-проверка, а не полный Kubernetes schema/admission test, проверка наличия Secret или доступности endpoint. `runtimeVerified` всегда false. Не применяйте шаблон напрямую: admission/security/controller policies и точные образы проверяются отдельно в целевом кластере.

## Первый запуск с чистыми stores — порядок для оператора

Все перечисленные далее действия с инфраструктурой выполняются **только в отдельной авторизованной deployment-задаче**. Сейчас ничего не применено и migrations не запускались.

1. Зафиксировать cluster/context/namespace, DB identity/database, Kafka cluster+topics+ACL, Temporal namespace+retention+certs. Сверить с инвентарём dev и подтвердить, что stores изолированы и не содержат импортированных jobs/artifacts/events/histories. Инициализация Kafka topics и Temporal namespace — штатными инструментами их владельцев, вне application manifests. Не подключать dev PVC/backup и не очищать текущий `reqai`.
2. Подготовить внешние Secrets/CA и выполнить read-only SQL preflight `bootstrap-preflight.sql` на **целевой** DB под migration identity. Он проверяет отсутствие объектов в app/artifact schemas и отсутствие runtime SUPERUSER/BYPASSRLS/owner membership. Отдельно проверить grants/public schema/database privileges и фактический verified TLS обоих DB credentials. Preflight не доказывает, что удалённый адрес принадлежит production: это проверяет владелец inventory.
3. Из проверенного release сначала использовать `bootstrap.yaml`: namespace, SA, ConfigMaps, приостановленный Job. Дать оператору явное разрешение снять suspend только с `reqai-schema-migration`, дождаться успешного завершения. Job запускает **все штатные SQL schema migrations** из exact backend image; старые dev данные он не импортирует. После первой записи production-данных fresh preflight применять нельзя; последующие migrations/failed partial bootstrap требуют отдельной оценки и нового versioned Job name.
4. Под migration owner выдать runtime role минимальные grants из `runtime-grants.sql` (переменные psql задаёт оператор). Не давать runtime owner membership/DDL и не использовать migration credential для API/workers. Выполнить read-only `runtime-preflight.sql` под реальным runtime credential: он проверяет отсутствие owner/superuser/BYPASSRLS, FORCE RLS на tenant tables, append-only права audit и отсутствие доступа к `schema_migrations`. Для последующих additive migrations повторно проверить grants новых таблиц.
5. Только после миграций/grants использовать `workloads.yaml`. На том же digest проверить non-root/read-only запуск, Nginx cache/PID, startup/readiness/liveness, direct SPA links, API routes, SSE и ограничения загрузки. Снять public access gate только после IAM/cross-tenant canaries и полного synthetic decomposition → review/save → linked research → final/export с повторным входом/refresh/restart. Проверить две Temporal queues, outbox/Kafka, maintenance/drain и optional MCP SDK canary.
6. Перед открытием доступа записать backup owner/schedule/retention и согласованные RPO/RTO, проверить restore на synthetic данных. Откат — согласованный совместимый frontend/backend/workers/MCP/prompt release, ConfigMap refs и внешние Secret revisions. Не откатывать схему/данные вслепую и не использовать fresh-start как reset после запуска. Backup, restore, IAM и runtime evidence не считаются выполненными после offline pass.

Kubernetes-механизмы: [Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/), [suspended Job](https://kubernetes.io/docs/concepts/workloads/controllers/job/#suspending-a-job), [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/). Подтверждение поддержки конкретным target cluster остаётся внешней проверкой.
