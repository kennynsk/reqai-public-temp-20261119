## 1. Production inputs and rendering

- [x] 1.1 Добавить non-secret input contract/example и production overlay поверх существующего Kubernetes base с обязательными images/digests, namespace/site, endpoints, prompt versions и opt-in MCP.
- [x] 1.2 Реализовать hermetic offline render/check без dotenv dev fallback, сетевых обращений, Docker и kubectl apply; выводить только безопасные field names/codes.
- [x] 1.3 Добавить проверки missing/placeholders/unknown env keys, development settings, mutable images и несогласованных release inputs на synthetic fixtures; проверить воспроизводимость render.

## 2. Identity, transport and credentials

- [x] 2.1 Подготовить explicit production AUTH/IAM issuer/audience/JWKS/claims/role mapping и ingress host/TLS/routes без реальных значений в Git.
- [x] 2.2 Описать и проверить verified TLS trust для PostgreSQL/Kafka/Temporal и scoped Secret refs для каждой роли; запретить LLM keys вне API/workflow.
- [x] 2.3 Подготовить disabled/enabled MCP profiles с schema 3.0.0, approved hosts, same-audience forwarding и отдельным readiness token; добавить offline negative fixtures.
- [x] 2.4 Проверить service accounts, network exposure, resource/topology inputs, probes и Nginx writable runtime paths в rendered manifests.

## 3. Fresh first launch and operations

- [x] 3.1 Описать isolated empty production database/broker storage/Temporal namespace inventory и read-only preflight; исключить dev volume/backup/event/history import и destructive cleanup.
- [x] 3.2 Подготовить контролируемый schema-migration/init путь для пустых stores, включая проверку runtime DB roles/RLS; не выполнять его против текущего dev.
- [x] 3.3 Подготовить release manifest и checklist для prompt hashes, coordinated rollback, новых production backup/retention, owner-approved RPO/RTO и provider quotas.
- [x] 3.4 Согласовать README, configuration catalog и operations runbook: production overlay вместо локального Compose, отсутствие переноса dev diagnostics, отдельный статус offline/runtime evidence.

## 4. Offline qualification

- [x] 4.1 Прогнать production input/render/policy tests, existing manifest tests, legacy-surface qualification и strict OpenSpec validation; зафиксировать конкретные результаты и непроверенные внешние gates.

## 5. External gates in a separately authorized target environment

- [ ] 5.1 Получить обязательные target input values/Secret refs и подтверждение владельца окружения; проверить fresh-store isolation без чтения содержимого и без изменений dev.
- [ ] 5.2 После отдельной авторизации deployment проверить exact image startup/securityContext/probes/ingress и real IAM/roles/tenant isolation canaries.
- [ ] 5.3 На synthetic tenant выполнить GLM → review/save → research → final/export, reload/restart/drain, Kafka/Temporal delivery и optional MCP client canary.
- [ ] 5.4 Проверить restore и coordinated rollback на новых synthetic production данных; только после всех gates подтвердить готовность к открытию доступа.
