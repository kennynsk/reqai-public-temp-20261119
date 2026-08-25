# Requirements Integration API

Requirements Integration API — асинхронный фасад над каноническими artifacts, requirements versions и jobs. Базовый адрес локального API — `http://localhost:5178`; frontend проксирует `/api` через `http://localhost:8080`.

## Операции создания

- `POST /api/v1/decompositions` принимает `businessContext` или `inputArtifactId` и создаёт job режима `DECOMPOSITION`.
- `POST /api/v1/requirements/versions/{versionId}/research` получает вход и lineage из immutable requirements version и создаёт job режима `REQUIREMENTS_INSIGHTS`.

Generic `POST /api/v1/jobs` допускает только декомпозицию. Исследование требований запускается исключительно через resource-scoped маршрут версии. Каждый вызов создания требует `Idempotency-Key` из 16–128 безопасных символов и возвращает `202 Accepted` с каноническим `jobId`.

```bash
curl -X POST http://localhost:5178/api/v1/decompositions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: decomposition-example-0001' \
  --data '{"businessContext":"Сократить время обработки клиентских возвратов"}'

curl -X POST http://localhost:5178/api/v1/requirements/versions/REQUIREMENTS_VERSION_UUID/research \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: requirements-research-0001' \
  --data '{}'
```

Статус, результат, содержимое артефакта и отмена доступны через `/api/v1/jobs/{jobId}`. Исторические jobs удалённых режимов остаются сериализуемыми и читаемыми, но retry/reset для них возвращает конфликт.

Inline JSON ограничен 1 MiB. Большой вход сначала загружается через `POST /api/v1/artifacts` с `X-Content-SHA256`, после чего клиент передаёт только `inputArtifactId`. Tenant и principal берутся исключительно из проверенного Bearer JWT; API не принимает `tenantId` от клиента.

Capability discovery `GET /api/v1` публикует только decomposition и requirements-research. Административные operations, workflow reset, health и metrics не являются MCP-инструментами.

Авторитетный контракт: [OpenAPI v1](api/openapi.v1.json). Breaking changes: [legacy-mode-retirement.md](legacy-mode-retirement.md).
