# ReqAI Requirements MCP gateway

MCP gateway — отдельная тонкая обёртка над Requirements Integration API. Он не импортирует backend repositories, не рендерит prompts, не вызывает LLM и не запускает Temporal напрямую. REST остаётся источником job state, результатов, авторизации и tenant isolation.

## Поставка

- SDK: `@modelcontextprotocol/sdk` `1.30.0`.
- Production transport: authenticated Streamable HTTP на `/mcp`.
- Tool schema: `2.0.0` (breaking reduction of the mutation surface).
- Gateway выключен по умолчанию; stdio разрешён только локально при явной конфигурации.

## Tools

| Tool | REST operation | Назначение |
| --- | --- | --- |
| `decompose_requirements` | `POST /api/v1/decompositions` | Асинхронная декомпозиция |
| `research_requirements` | `POST /api/v1/requirements/versions/{versionId}/research` | Исследование сохранённой версии |
| `get_task_status` | `GET /api/v1/jobs/{jobId}` | Канонический статус |
| `get_task_result` | `GET /api/v1/jobs/{jobId}/result` | Metadata результата и ссылка на artifact |

Start tools требуют `idempotencyKey` из 16–128 безопасных символов и сразу возвращают backend `202` envelope. Polling выполняется через status/result tools. Read DTO допускает mode исторической задачи, но gateway не предоставляет мутацию для её повторного запуска.

Inline-вход ограничен 1 MiB. Для больших входов клиент загружает artifact через REST и передаёт `inputArtifactId`. MCP не проксирует защищённое содержимое result artifact.

Remote endpoint требует `Authorization: Bearer <JWT>`. Gateway проверяет совместимость capabilities и без изменения пересылает caller token; backend остаётся authoritative для ролей, principal и tenant. Readiness использует отдельный least-privilege token. Первая версия требует одинаковый IAM audience (`forward-same-audience`) и fail-closed при иной конфигурации.

Gateway ограничивает Host, body size, concurrency, backend timeout (`MCP_BACKEND_TIMEOUT_MS`) и response metadata. Логи не содержат JWT, prompt/requirements text или artifact content. Threat model требует reference-only control plane, fail-closed auth, строгих schemas и отсутствия локального execution fallback. Deployment по умолчанию имеет `replicas: 0` и `MCP_ENABLED=false`; публикация требует HTTPS ingress, allowlist и IAM canary.

Breaking change и rollback: [legacy-mode-retirement.md](legacy-mode-retirement.md). Release gates: [mcp-qualification.md](mcp-qualification.md).
