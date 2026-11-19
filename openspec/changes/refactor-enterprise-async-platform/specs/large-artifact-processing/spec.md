## Purpose

Определяет безопасную потоковую загрузку, хранение и LLM-обработку входных данных и результатов размером до 100 МБ.

## ADDED Requirements

### Requirement: Streamed artifact upload and download
Система SHALL принимать и возвращать artifacts размером до 100 МБ потоково, проверять configured size limit и checksum и не загружать весь artifact в память API.

#### Scenario: Valid large input is uploaded
- **WHEN** авторизованный пользователь загружает artifact размером не более 100 МБ
- **THEN** система сохраняет его в tenant-scoped PostgreSQL artifact storage и возвращает `artifactId`, размер и checksum

#### Scenario: Artifact exceeds the limit
- **WHEN** upload превышает configured maximum bytes
- **THEN** API прекращает приём и возвращает контролируемую ошибку размера без создания доступного artifact

### Requirement: Reference-only control plane
Temporal payloads, Kafka events, SSE events, webhook payloads и job metadata MUST содержать ссылки на крупные artifacts, а не их полное содержимое.

#### Scenario: Large result completes
- **WHEN** workflow создаёт результат, превышающий inline response threshold
- **THEN** status и notification содержат `resultArtifactId` и авторизованную REST-ссылку, но не полный результат

### Requirement: Chunked hierarchical processing
Вход, превышающий context limit выбранной модели, SHALL разбиваться на контролируемые chunks, обрабатываться ограниченно-параллельно и объединяться иерархическим synthesis.

#### Scenario: Input does not fit one model context
- **WHEN** нормализованный вход превышает безопасный token budget одного вызова
- **THEN** workflow создаёт checkpointed chunk plan, обрабатывает chunks и формирует итог с трассировкой использованных частей

### Requirement: Artifact retention and access isolation
Artifacts SHALL удаляться согласно retention policy и SHALL быть доступны только авторизованным субъектам соответствующего tenant.

#### Scenario: Artifact retention expires
- **WHEN** artifact достигает configured retention boundary и не удерживается активной job или legal hold
- **THEN** maintenance worker удаляет содержимое batch-операцией и сохраняет требуемое audit-событие

