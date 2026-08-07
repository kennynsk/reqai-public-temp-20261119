## Purpose

Определяет независимо собираемые и масштабируемые frontend, API и worker-компоненты для production-развёртывания приложения в Kubernetes.

## ADDED Requirements

### Requirement: Independent production services
Система SHALL собирать и запускать frontend, backend API и фоновые workers независимо, а backend API MUST NOT зависеть от наличия frontend build artifacts.

#### Scenario: Backend starts without frontend image
- **WHEN** backend API развёрнут без frontend image и каталога `client/dist`
- **THEN** API запускается и обслуживает REST endpoints без ошибок зависимости от frontend

#### Scenario: Frontend is scaled independently
- **WHEN** оператор изменяет число frontend replicas без изменения backend replicas
- **THEN** frontend продолжает обслуживать пользователей, не перезапуская backend или workers

### Requirement: Same-origin public routing
Публичная маршрутизация SHALL направлять `/api/*` в backend API, а остальные пользовательские пути во frontend, сохраняя единый origin для браузера.

#### Scenario: Browser calls API through the public origin
- **WHEN** frontend выполняет запрос к относительному пути `/api/v1/jobs`
- **THEN** ingress или NGAM направляет запрос в backend API без использования внутреннего Kubernetes DNS в браузере

### Requirement: Independently deployable worker pools
Система SHALL позволять независимо развёртывать и масштабировать API, decomposition workers, research workers, event delivery workers и maintenance workers из версионированных образов.

#### Scenario: Research capacity is increased
- **WHEN** оператор увеличивает число research worker replicas
- **THEN** пропускная способность research task queue увеличивается без перезапуска API и decomposition workers

### Requirement: Container runtime safety
Production-контейнеры SHALL запускаться с фиксированными портами, непривилегированными пользователями, внешней конфигурацией и корректной обработкой завершения процесса.

#### Scenario: Kubernetes terminates a pod
- **WHEN** контейнер получает `SIGTERM`
- **THEN** он прекращает принимать новую работу, завершает или освобождает текущую работу в пределах configured grace period и корректно завершает процесс

