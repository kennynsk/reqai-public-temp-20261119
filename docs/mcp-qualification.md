# MCP gateway release qualification

Дата evidence: 2026-08-25. Build/tool schema: `1.0.0`. SDK: `@modelcontextprotocol/sdk 1.30.0`.

## Автоматические gates

| Gate | Evidence |
| --- | --- |
| MCP protocol/schema | Официальный `Client` + `StreamableHTTPClientTransport`; ровно пять tools, strict schemas, structured output/errors |
| Tool mapping | Все три POST и два GET сопоставлены one-to-one, Bearer и idempotency key сохранены |
| Async/idempotency | `ACCEPTED` возвращается без ожидания; replay сохраняет `jobId`; изменённый payload даёт conflict |
| Status/result | Все canonical statuses, COMPLETE/PARTIAL, RESULT_NOT_READY и artifact references |
| Mock E2E | Все три start tools проходят MCP → ReqAI REST → `MockLlmProvider` → canonical status/result |
| Auth/isolation | human/service token forwarding; missing/invalid/expired/wrong-audience, forbidden role и safe cross-tenant not-found |
| Failure policy | unavailable, timeout, admission, response limit; отсутствует локальный fallback/retry loop |
| Security | strict technical-field rejection, source import guard, redaction, Host/body/concurrency/timeout limits, threat model |
| Deployment | отдельный image/profile/Deployment/Service/Ingress/NetworkPolicy; production disabled (`replicas: 0`, `MCP_ENABLED=false`) |
| Dependencies | production `npm audit --omit=dev --workspace mcp-gateway`: 0 известных vulnerabilities |

Команды release gate:

```bash
npm -w mcp-gateway test
npm -w server test
npm -w client run build
docker compose --profile mcp build mcp-gateway
npm audit --omit=dev --workspace mcp-gateway
npx openspec validate add-requirements-mcp-server --strict
```

Deployment-like smoke собрал отдельный image, подтвердил healthy readiness/version и через MCP создал decomposition job `3445f9c1-c024-49d3-a0ae-2078ff423669`; последующий `get_task_status` прочитал ту же canonical job в backend.

## Publication decision

Код и deployment artifacts готовы к canary. Production endpoint намеренно не публикуется автоматически: перед изменением `replicas`/`MCP_ENABLED` владелец среды обязан подтвердить HTTPS ingress, allowlist, least-privilege readiness service account, одинаковую IAM audience MCP/API, human/service-account role mapping и tenant-isolation прогон на реальном IdP. Если audiences различаются, release остаётся fail-closed до отдельной реализации delegated token exchange.

Rollback выполняется отключением gateway/ingress; API, workers и уже принятые jobs не затрагиваются.
