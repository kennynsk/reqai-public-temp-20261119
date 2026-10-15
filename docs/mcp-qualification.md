# MCP gateway release qualification

Текущий tool schema: `3.0.0`. Gateway обязан рекламировать ровно четыре инструмента: `decompose_requirements`, `research_requirements`, `get_task_status`, `get_task_result`.

## Автоматические gates

- protocol/schema conformance официального SDK и strict input/output schemas;
- one-to-one mapping двух POST и двух GET к ReqAI REST;
- idempotency, canonical statuses/results и read compatibility исторических mode values;
- auth/tenant isolation, redaction, Host/body/concurrency/timeout limits;
- readiness требует capabilities `decomposition` и `requirements-research`;
- отсутствие локального provider fallback и лишних mutation/content tools;
- production dependency audit и disabled-by-default deployment.

```bash
npm -w mcp-gateway test
npm -w server test
npm -w client run build
npm run qualify:legacy-surface
docker compose --profile mcp build mcp-gateway
npm audit --omit=dev --workspace mcp-gateway
```

Production publication остаётся отдельным gate: владелец среды подтверждает HTTPS ingress, allowlist, readiness service account, IAM audience, role mapping и tenant-isolation canary. Rollback отключает gateway/ingress и возвращает предыдущую пару image/config с соблюдением текущих четырёх инструментов; API jobs и данные не мигрируются обратно.

Проверка schema 3.0.0: `npm -w mcp-gateway test`. HTTP MCP-клиент проверяет загрузку UTF-8 через REST с SHA-256, запуск по artifactId, статус, чтение содержимого и отмену. Интеграционный тест использует mock LLM и хранилище в памяти; он не заменяет IAM canary или реальный GLM-прогон.
