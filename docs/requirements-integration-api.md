# Requirements Integration API

The integration API is an additive, asynchronous façade over the canonical artifact and job platform. It does not create a second execution service.

Local direct API base URL is `http://localhost:5178`; `http://localhost:8080/api` is the frontend proxy. Production clients use the approved enterprise ingress and Bearer JWT. `GET /api/v1` returns enabled domain operations, model choices and safe prompt-release metadata.

## Operations

- `POST /api/v1/decompositions` accepts `businessContext` or `inputArtifactId` and creates a canonical decomposition-only job. It does not accept `withInsights`; research is started separately after a requirements version is saved.
- `POST /api/v1/research` accepts `researchContext` or `inputArtifactId`; `strategy` is `standard` or `agent`.
- `POST /api/v1/requirements/versions/{versionId}/research` derives the immutable version artifact and source decomposition lineage server-side.

Every call requires `Idempotency-Key` (16–128 safe characters). Responses are `202 Accepted` and contain the canonical `jobId`, status, SSE, result and cancellation URLs. Clients monitor and retrieve work only through `/api/v1/jobs/{jobId}` resources.

## Direct API examples

Start decomposition without the frontend:

```bash
curl -X POST http://localhost:5178/api/v1/decompositions \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: decomposition-example-0001' \
  --data '{"businessContext":"Сократить время обработки клиентских возвратов"}'
```

Start standalone research:

```bash
curl -X POST http://localhost:5178/api/v1/research \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: research-example-000001' \
  --data '{"researchContext":"Требования к автоматизации возвратов","strategy":"agent"}'
```

After reviewing decomposition, create an immutable requirements version through `POST /api/v1/requirements/versions`, then start its dedicated insights research:

```bash
curl -X POST http://localhost:5178/api/v1/requirements/versions/REQUIREMENTS_VERSION_UUID/research \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: requirements-research-0001' \
  --data '{}'
```

Follow any accepted operation using the returned paths:

```bash
curl http://localhost:5178/api/v1/jobs/JOB_UUID
curl http://localhost:5178/api/v1/jobs/JOB_UUID/result
curl http://localhost:5178/api/v1/jobs/JOB_UUID/result/content
```

When authentication is enabled, add `Authorization: Bearer $ACCESS_TOKEN`. Clients must treat `jobId` as the only durable task identity and should use a new idempotency key only for intentionally new work.

Inline JSON is limited to 1 MiB. For larger input, first stream bytes to `POST /api/v1/artifacts` with `X-Content-SHA256`, then provide the returned `inputArtifactId`. Existing artifacts and requirements versions are resolved under the verified tenant and owner scope and are never copied through the control plane.

## Authentication and tenant context

Production uses the existing Bearer JWT verifier. Human users and service accounts must be mapped by the enterprise identity provider to an allowed application role (`user`, `tenant-admin`, or `system-admin`) and a tenant claim. The request must not contain `tenantId`; tenant and principal come only from verified claims. Cross-owner or cross-tenant references return safe unavailable behavior.

The API does not issue JWTs. A future IAM integration can add role and tenant policies without changing the domain DTOs or job lifecycle.

## Operational and system endpoints

OpenAPI also declares capability discovery, webhook redelivery, workflow reset and operational-mode administration. Those administrative routes require `operator` or `system-admin` as documented and are not exposed as MCP tools. `/health/live`, `/health/ready` and `/metrics` are system endpoints used by deployment and monitoring.

## Rollback

Set `REQUIREMENTS_INTEGRATION_API_ENABLED=false` to hide only the additive domain routes. Existing `/api/v1/jobs`, artifact, status, SSE and result APIs remain available. Accepted jobs continue normally.

The authoritative machine-readable contract is [OpenAPI v1](api/openapi.v1.json).
