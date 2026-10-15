# ReqAI Requirements MCP gateway

MCP gateway — отдельная тонкая обёртка над Requirements Integration API. Он не импортирует backend repositories, не рендерит prompts, не вызывает LLM и не запускает Temporal напрямую. REST остаётся источником job state, результатов, авторизации и tenant isolation.

## Поставка

- SDK: `@modelcontextprotocol/sdk` `1.32.1`.
- Production transport: authenticated Streamable HTTP на `/mcp`.
- Tool schema: `3.0.0` (ровно четыре инструмента, metadata без содержимого).
- Gateway выключен по умолчанию; stdio разрешён только локально при явной конфигурации.

## Tools

| Tool | REST operation | Назначение |
| --- | --- | --- |
| `decompose_requirements` | `POST /api/v1/decompositions` | Асинхронная декомпозиция |
| `research_requirements` | `POST /api/v1/requirements/versions/{versionId}/research` | Исследование сохранённой версии |
| `get_task_status` | `GET /api/v1/jobs/{jobId}` | Канонический статус |
| `get_task_result` | `GET /api/v1/jobs/{jobId}/result` | Metadata результата и ссылка на artifact |

Start tools требуют `idempotencyKey` из 16–128 безопасных символов и сразу возвращают backend `202` envelope. Polling выполняется через status/result tools, а после `SUCCEEDED` авторизованный REST-клиент читает содержимое по `resultContentUrl`. Read DTO допускает mode исторической задачи, но gateway не предоставляет мутацию для её повторного запуска.

Inline-вход ограничен 1 MiB. Для больших входов клиент загружает artifact через REST и передаёт `inputArtifactId`. MCP возвращает только metadata и ссылки. Загрузка файлов, отмена и чтение содержимого доступны авторизованному REST-клиенту; MCP их не проксирует.

Операции запуска принимают необязательный `reasoning` (`disabled`, `low`, `high`, `max`); по умолчанию используется `disabled`. Для GLM-5.3 и GLM-5.3-Flash backend преобразует его в минимальный поддерживаемый `reasoning_effort=low`, поскольку эти модели не отключают thinking полностью.

Remote endpoint требует `Authorization: Bearer <JWT>`. Gateway проверяет совместимость capabilities и без изменения пересылает caller token; backend остаётся authoritative для ролей, principal и tenant. Readiness использует отдельный least-privilege token. Первая версия требует одинаковый IAM audience (`forward-same-audience`) и fail-closed при иной конфигурации.

Gateway ограничивает Host, body size, concurrency, backend timeout (`MCP_BACKEND_TIMEOUT_MS`) и MCP payload size (`MCP_RESPONSE_LIMIT_BYTES`). Логи не содержат JWT, prompt/requirements text или artifact content. Threat model допускает ограниченную загрузку текста через artifact API и требует, fail-closed auth, строгих schemas и отсутствия локального execution fallback. Deployment по умолчанию имеет `replicas: 0` и `MCP_ENABLED=false`; публикация требует HTTPS ingress, allowlist и IAM canary.

Breaking change и rollback: [legacy-mode-retirement.md](legacy-mode-retirement.md). Release gates: [mcp-qualification.md](mcp-qualification.md).


## Материалы, содержимое и отмена

Загрузите TXT, Markdown или JSON в UTF-8 через `POST /api/v1/artifacts` с SHA-256 и тем же bearer token. Передайте полученный `artifactId` в `decompose_requirements` как `inputArtifactId`. Для небольшого контекста можно передать `businessContext` прямо в инструмент запуска.

После завершения читайте metadata через `get_task_result`, а содержимое — авторизованным REST-запросом по `resultContentUrl`. Отмена выполняется через `POST /api/v1/jobs/{jobId}/cancel`; затем проверяйте канонический статус до терминального состояния. Уже выполненные LLM-вызовы не отменяются задним числом.

Переход на schema 3.0.0 несовместим с клиентами прежних дополнительных инструментов. До включения gateway обновите клиентов; откат приложения не должен возвращать снятый публичный контракт в обход продуктовых границ.

DTO MCP проектируется по разрешённым полям перед валидацией: дополнительные поля REST (название, настройки и содержимое) не передаются клиенту. Свободные `message`, `summary` и `failedSteps[].summary` возвращаются как null; канонические статус, reasonCode, прогресс, model attempts и ссылки остаются доступны.
