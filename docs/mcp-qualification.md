# MCP gateway release qualification

Текущий tool schema: `2.2.0`. Gateway обязан рекламировать ровно семь инструментов: `upload_artifact`, `cancel_task`, `decompose_requirements`, `research_requirements`, `get_task_status`, `get_task_result`, `get_task_result_content`.

## Автоматические gates

- protocol/schema conformance официального SDK и strict input/output schemas;
- one-to-one mapping четырёх POST и трёх GET к ReqAI REST;
- idempotency, canonical statuses/results и read compatibility исторических mode values;
- auth/tenant isolation, redaction, Host/body/concurrency/timeout limits;
- readiness требует capabilities `decomposition` и `requirements-research`;
- отсутствие локального provider fallback и отсутствующих mutation tools;
- production dependency audit и disabled-by-default deployment.

```bash
npm -w mcp-gateway test
npm -w server test
npm -w client run build
npm run qualify:legacy-surface
docker compose --profile mcp build mcp-gateway
npm audit --omit=dev --workspace mcp-gateway
```

Production publication остаётся отдельным gate: владелец среды подтверждает HTTPS ingress, allowlist, readiness service account, IAM audience, role mapping и tenant-isolation canary. Rollback отключает gateway/ingress и возвращает предыдущую пару image/config только если внешним клиентам временно нужен снятый контракт; API jobs и данные не мигрируются обратно.

Проверка schema 2.2.0: `npm -w mcp-gateway test`. HTTP MCP-клиент проверяет загрузку UTF-8 через REST с SHA-256, запуск по artifactId, статус, чтение содержимого и отмену. Интеграционный тест использует mock LLM и хранилище в памяти; он не заменяет IAM canary или реальный GLM-прогон.
