# ReqAI Requirements MCP gateway

MCP gateway — отдельная тонкая обёртка над Requirements Integration API. Он не импортирует репозитории backend, не рендерит prompt bundles, не вызывает LLM и не запускает Temporal workflows. REST остаётся единственным источником job state, результатов, авторизации и tenant isolation.

## Поставка и версии

- MCP SDK: `@modelcontextprotocol/sdk` `1.30.0` (точно закреплён в lockfile).
- Production transport: authenticated Streamable HTTP, endpoint `/mcp`.
- Tool schema: `1.0.0`; runtime публикует версии через `/version` и metadata каждого tool.
- stdio разрешён только при `NODE_ENV != production`, `MCP_TRANSPORT=stdio`, `MCP_ENABLED=true` и наличии `MCP_STDIO_BEARER_TOKEN`.
- MCP выключен по умолчанию. Основной ReqAI API не рекламирует MCP capabilities и продолжает работать независимо.

SDK обрабатывает MCP framing и schema publication; gateway дополнительно ограничивает Host, JSON body, concurrency, backend timeout и response metadata size. Обновление SDK требует protocol/schema suite, `npm audit` и повторной threat-model проверки.

Security posture на 2026-08-25: `npm audit --omit=dev --workspace mcp-gateway` — 0 известных production vulnerabilities. Для общего hoisted dependency tree также установлены совместимые patch-версии Express 4.22.2 и `path-to-regexp` 0.1.13; это не меняет backend API-контракт.

## Tools

| Tool | REST operation | Назначение |
| --- | --- | --- |
| `decompose_requirements` | `POST /api/v1/decompositions` | Асинхронная декомпозиция |
| `start_research` | `POST /api/v1/research` | Самостоятельный standard/agent research |
| `research_requirements` | `POST /api/v1/requirements/versions/{versionId}/research` | Исследование сохранённой версии требований |
| `get_task_status` | `GET /api/v1/jobs/{jobId}` | Канонический статус |
| `get_task_result` | `GET /api/v1/jobs/{jobId}/result` | Канонические metadata результата |

Start tools требуют `idempotencyKey` из 16–128 безопасных символов и сразу возвращают backend `202` envelope. MCP request ID не заменяет idempotency key. Повтор с тем же ключом и тем же телом возвращает исходный `jobId`; изменённое тело получает канонический conflict. Polling выполняется клиентом через status/result tools.

Inline-поля ограничены 1 MiB. Для больших входов клиент сначала загружает artifact через `POST /api/v1/artifacts`, затем передаёт только `inputArtifactId`. Результат MCP содержит metadata и `resultContentUrl`, но не проксирует защищённое содержимое artifact.

## Authentication и tenant context

Remote endpoint всегда требует `Authorization: Bearer <JWT>`. Gateway проверяет токен и совместимость v1 capabilities вызовом защищённого `/api/v1`, а затем без изменения пересылает его в доменную операцию. Backend остаётся authoritative для срока действия, issuer/audience, ролей (`user`, `tenant-admin`, `operator`, `auditor`, `system-admin`), principal и tenant. Отдельный least-privilege `MCP_READINESS_BEARER_TOKEN` используется только readiness-probe и никогда не подменяет caller authority.

Первая production-версия использует `MCP_IAM_AUDIENCE_MODE=forward-same-audience`: MCP и ReqAI API должны принимать один audience. При разных audience запуск конфигурации прекращается; delegated token exchange пока не реализован. Gateway не принимает `tenantId`, owner, claims, delegated identity, prompt или lineage overrides и не использует общий привилегированный credential.

Пример конфигурации MCP-клиента:

```json
{
  "mcpServers": {
    "reqai": {
      "type": "streamable-http",
      "url": "https://mcp.reqai.example/mcp",
      "headers": { "Authorization": "Bearer ${REQAI_ACCESS_TOKEN}" }
    }
  }
}
```

Локальный Docker-запуск: `docker compose --profile mcp up --build`. Endpoint — `http://localhost:5180/mcp`; даже при локально отключённой backend auth клиент должен передать непустой Bearer-токен.

## Ошибки и наблюдаемость

Tool errors возвращаются с `isError=true` и безопасной структурой `error: { code, message, retryable, requestId, details? }`. Backend codes сохраняются. Connectivity использует `MCP_BACKEND_UNAVAILABLE`, timeout — `MCP_BACKEND_TIMEOUT`, несовместимый ответ — `MCP_BACKEND_CONTRACT_MISMATCH`. Тела backend-ответов, JWT, inline requirements, prompts и artifact content не логируются.

Служебные endpoints: `/health/live`, `/health/ready`, `/version`, `/metrics`. Метрики имеют только bounded labels: tool, outcome и stable error code; user, tenant, job ID и payload в labels отсутствуют.

## Threat model

- Session fixation: production runtime stateless (`sessionIdGenerator` отключён), Bearer проверяется на каждом HTTP request.
- Confused deputy/cross-tenant: authority пересылается без подмены; tenant/owner/lineage запрещены schemas; backend применяет owner scope и safe not-found.
- SSRF: backend URL задаётся только startup-конфигурацией, должен быть абсолютным HTTP(S) URL без credentials/query/fragment; tool input не управляет URL.
- Schema injection: strict Zod schemas запрещают unknown fields, arbitrary prompt и internal modes.
- DoS: Host validation, body/inline/response limits, bounded concurrency и timeout. Mutating request не ретраится gateway; повтор делает клиент с исходным idempotency key.
- Data leakage: allowlisted DTO parsing и recursive log redaction; large result content остаётся за governed REST artifact endpoint.
