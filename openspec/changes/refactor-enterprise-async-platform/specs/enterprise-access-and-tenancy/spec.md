## Purpose

Определяет корпоративную аутентификацию, авторизацию, аудит и логическую изоляцию данных пользователей и tenant.

## ADDED Requirements

### Requirement: IAM and NGAM authentication
Frontend SHALL использовать корпоративный authorization flow, а backend SHALL валидировать issuer, audience, signature и expiry токенов IAM/NGAM перед доступом к защищённым endpoints.

#### Scenario: Valid corporate token is presented
- **WHEN** запрос содержит действительный токен с требуемыми claims
- **THEN** backend формирует доверенный user, role и tenant context без принятия этих идентификаторов из request body

#### Scenario: Invalid token is presented
- **WHEN** токен отсутствует, просрочен или не проходит валидацию
- **THEN** backend отклоняет защищённый запрос без раскрытия чувствительных подробностей

### Requirement: Role-based access control
Система SHALL поддерживать роли `user`, `tenant-admin`, `operator`, `auditor` и `system-admin` с минимально необходимыми правами; Temporal retry/reset SHALL быть доступен только `system-admin`.

#### Scenario: Regular user requests another user's job
- **WHEN** пользователь без административной роли запрашивает недоступную ему job
- **THEN** система не возвращает job или её metadata

### Requirement: Logical tenant isolation
Каждая бизнес-запись, artifact, event и audit entry SHALL иметь доверенный `tenantId`; первая версия SHALL использовать configured `DEFAULT_TENANT_ID`, если разрешённый tenant claim отсутствует.

#### Scenario: Token has no tenant claim
- **WHEN** действительный пользовательский токен не содержит configured tenant claim и default tenant разрешён
- **THEN** backend назначает `DEFAULT_TENANT_ID` и применяет tenant-scoped access rules

### Requirement: Auditable privileged actions
Создание, просмотр, отмена, retry/reset, удаление, maintenance и webhook redelivery SHALL создавать audit-события с actor, tenant, action, target и timestamp.

#### Scenario: Administrator resets a workflow
- **WHEN** `system-admin` выполняет reset workflow
- **THEN** система сохраняет audit-событие до выполнения операции и связывает новую попытку с исходной job

### Requirement: Sensitive content is excluded from operational logs
Production-логи MUST NOT содержать полные prompts, требования, результаты, access tokens, secrets или credentials; полный диагностический контент SHALL храниться только как защищённый artifact согласно retention.

#### Scenario: Provider call fails
- **WHEN** LLM-провайдер возвращает ошибку
- **THEN** технический лог содержит correlation ID, безопасный reason code, модель и timing без пользовательского текста и секретов

