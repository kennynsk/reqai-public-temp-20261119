## Why

Проверенный локальный ReqAI выполняет основной workflow, но Kubernetes-шаблоны содержат TBD и не задают проверяемую конфигурацию конкретной production-среды. Нужен воспроизводимый, закрытый по умолчанию профиль запуска с чистыми хранилищами: пользователь подтвердил, что текущая среда — dev и её данные не переносятся.

## What Changes

- Подготовить production overlay существующих Kubernetes-манифестов, каталог обязательных входов и безопасную offline/render-проверку без автоматического применения к кластеру.
- Явно настроить production runtime, IAM/JWT/tenant mapping, HTTPS ingress, доверенные TLS-соединения PostgreSQL/Kafka/Temporal, точные образы и credentials по ролям.
- Определить первый запуск с новыми пустыми хранилищами и выполнением штатных SQL schema migrations; не переносить dev volumes, rows, artifacts, Kafka/outbox или Temporal histories.
- Задать opt-in MCP schema 3.0.0, scoped readiness token и canary клиентской совместимости; до квалификации MCP остаётся выключенным.
- Описать внешние runtime gates, backup/restore и согласованный rollback после появления новых production-данных. Не заявлять готовность на основании одного YAML/render test.

## Capabilities

### New Capabilities

- `production-configuration`: параметризованный production-профиль, проверки конфигурации/секретов, fresh-start и критерии допуска к первому выпуску.

### Modified Capabilities

Нет. Два execution creation endpoints, четыре MCP-инструмента и read-only совместимость исторических результатов не меняются.

## Impact

Области реализации: `deploy/k8s/`, offline qualification scripts, production config tests, `README.md`, `docs/configuration.md`, operations runbook. Добавлены реальные Kustomize production/MCP overlays, offline validator, migration Job и operator SQL/checklist; infrastructure provisioning, реальные secrets, сборка/публикация images, apply/deploy и удаление dev-данных не выполняются. MCP contract cleanup и удаление мёртвого кода ведутся отдельно в уже реализуемом release change.
