# Enterprise configuration contract

All static configuration is read from environment variables and validated before a process becomes ready. Kubernetes `ConfigMap` owns non-secret values; Kubernetes `Secret` or a mounted secret volume owns credentials and private key material. Operational maintenance mode is runtime state in PostgreSQL; `MAINTENANCE_DEFAULT_MODE` is only its bootstrap default.

An invalid required value, unknown enum, malformed JSON map, non-positive timeout or limit outside the documented range prevents the affected process from becoming ready. Secret values must never appear in effective-configuration output or logs.

## Process and deployment

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `APP_ROLE` | `api` | `api`, `workflow-worker`, `event-worker`, `maintenance-worker` | ConfigMap |
| `DEPLOYMENT_SITE_ID` | `local` | 1–128 safe identifier characters | ConfigMap |
| `PORT` | `5178` | integer 1–65535 | ConfigMap |
| `API_SHUTDOWN_GRACE_MS` | `30000` | 1,000–600,000 | ConfigMap |
| `WORKER_SHUTDOWN_GRACE_MS` | `600000` | 1,000–3,600,000 | ConfigMap |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` | ConfigMap |
| `MAINTENANCE_DEFAULT_MODE` | `NORMAL` | `NORMAL`, `ACCEPT_AND_QUEUE`, `DRAIN`, `REJECT_NEW`, `FAILOVER_IN_PROGRESS` | ConfigMap |

`PORT_RETRY_LIMIT` is a local development convenience and must be zero or unset in Kubernetes, where container ports are fixed.

## PostgreSQL

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `DATABASE_URL` | none | required for async roles; `postgresql:` URL | Secret |
| `DATABASE_SCHEMA` | `reqai` | valid PostgreSQL identifier | ConfigMap |
| `DATABASE_ARTIFACT_SCHEMA` | `reqai_artifacts` | valid PostgreSQL identifier | ConfigMap |
| `DATABASE_POOL_MIN` | `2` | 0–100 | ConfigMap |
| `DATABASE_POOL_MAX` | `20` | 1–500 and ≥ min | ConfigMap |
| `DATABASE_CONNECT_TIMEOUT_MS` | `5000` | 100–60,000 | ConfigMap |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | 1,000–600,000 | ConfigMap |
| `DATABASE_SSL_MODE` | `verify-full` in production | `disable`, `require`, `verify-ca`, `verify-full` | ConfigMap |
| `DATABASE_CA_CERT_PATH` | none | readable mounted file when configured | Secret volume |

Application, migration and Temporal persistence users must be separate least-privilege identities. Temporal uses its own database/schema and is not configured through the application `DATABASE_SCHEMA`.

## Kafka

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `KAFKA_BROKERS` | none | required comma-separated host:port list | ConfigMap |
| `KAFKA_CLIENT_ID` | `reqai-${DEPLOYMENT_SITE_ID}` | non-empty | ConfigMap |
| `KAFKA_JOB_EVENTS_TOPIC` | `reqai.job-events.v1` | non-empty | ConfigMap |
| `KAFKA_WEBHOOK_DLQ_TOPIC` | `reqai.webhook-dlq.v1` | non-empty | ConfigMap |
| `KAFKA_SSL_ENABLED` | `true` in production | boolean | ConfigMap |
| `KAFKA_SASL_MECHANISM` | `plain` | `plain`, `scram-sha-256`, `scram-sha-512` | ConfigMap |
| `KAFKA_USERNAME` | none | required when SASL is enabled | Secret |
| `KAFKA_PASSWORD` | none | required when SASL is enabled | Secret |
| `OUTBOX_PUBLISH_BATCH_SIZE` | `100` | 1–1,000 | ConfigMap |
| `OUTBOX_PUBLISH_INTERVAL_MS` | `1000` | 100–60,000 | ConfigMap |

Kafka messages are metadata-only and must not exceed the platform message limit. `jobId` is the partition key.

## Temporal

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `TEMPORAL_ADDRESS` | none | required for workflow roles | ConfigMap |
| `TEMPORAL_NAMESPACE` | `reqai` | existing namespace | ConfigMap |
| `TEMPORAL_TASK_QUEUE_DECOMPOSITION` | `requirements-decomposition` | non-empty | ConfigMap |
| `TEMPORAL_TASK_QUEUE_RESEARCH` | `requirements-research` | non-empty | ConfigMap |
| `TEMPORAL_TLS_ENABLED` | `true` in production | boolean | ConfigMap |
| `TEMPORAL_TLS_CERT_PATH` | none | readable client certificate when mTLS is used | Secret volume |
| `TEMPORAL_TLS_KEY_PATH` | none | readable client private key when mTLS is used | Secret volume |
| `TEMPORAL_TLS_SERVER_NAME` | none | non-empty TLS server name when required | ConfigMap |
| `WORKER_MAX_CONCURRENT_ACTIVITIES` | `10` | 1–1,000 | ConfigMap |
| `WORKER_ACTIVITY_HEARTBEAT_MS` | `30000` | 1,000–300,000 | ConfigMap |

## IAM and NGAM

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `AUTH_ENABLED` | `true` in production | boolean | ConfigMap |
| `IAM_ISSUER` | none | required HTTPS URL when auth is enabled | ConfigMap |
| `IAM_AUDIENCE` | none | required non-empty value | ConfigMap |
| `IAM_JWKS_URI` | derived from discovery | HTTPS URL | ConfigMap |
| `IAM_USER_ID_CLAIM` | `sub` | non-empty claim name | ConfigMap |
| `IAM_ROLES_CLAIM` | `roles` | non-empty claim name | ConfigMap |
| `IAM_TENANT_CLAIM` | `tenant_id` | non-empty claim name | ConfigMap |
| `IAM_DEFAULT_TENANT_ALLOWED` | `true` | boolean | ConfigMap |
| `IAM_CLOCK_TOLERANCE_SECONDS` | `60` | 0–300 | ConfigMap |
| `IAM_ROLE_MAPPING_JSON` | ReqAI role defaults | JSON object mapping application roles to IAM role values | ConfigMap |
| `DEFAULT_TENANT_ID` | `default-enterprise` | 1–128 characters | ConfigMap |
| `IAM_CLIENT_SECRET` | none | only for confidential service clients | Secret |

Exact platform values remain in `docs/platform-integration-profile.md` until supplied by IAM/NGAM owners.

## Job admission, deadlines and artifacts

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `ADMISSION_MAX_JOBS_PER_MINUTE` | `30` | 1–10,000 | ConfigMap |
| `ADMISSION_MAX_ACTIVE_JOBS_PER_USER` | `5` | 1–1,000 | ConfigMap |
| `QUEUE_SOFT_BACKLOG_LIMIT` | `1000` | non-negative and < hard limit | ConfigMap |
| `QUEUE_HARD_BACKLOG_LIMIT` | `5000` | positive and > soft limit | ConfigMap |
| `DECOMPOSITION_QUEUE_PRIORITY` | `100` | integer 0–1,000 | ConfigMap |
| `RESEARCH_QUEUE_PRIORITY` | `50` | integer 0–1,000 | ConfigMap |
| `JOB_DECOMPOSITION_DEADLINE_MS` | `3600000` | 60,000–86,400,000 | ConfigMap |
| `JOB_RESEARCH_DEADLINE_MS` | `14400000` | 60,000–86,400,000 | ConfigMap |
| `JOB_INPUT_MAX_BYTES` | `104857600` | 1–104,857,600 | ConfigMap |
| `JOB_RESULT_MAX_BYTES` | `104857600` | 1–104,857,600 | ConfigMap |
| `LLM_CHUNK_TARGET_TOKENS` | `60000` | 1,000–120,000 and below model context | ConfigMap |
| `LLM_CHUNK_CONCURRENCY` | `3` | 1–20 | ConfigMap |

## LLM model execution

The first async implementation uses one ZAI provider. `ZAI_API_KEY` is a secret; endpoint and model catalog are non-secret configuration. The UI exposes the complete catalog, while each job step snapshots no more than three fallback models.

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `LLM_PROVIDER_MODE` | `zai` | `zai`, `gigachat`; `mock` only for local tests | ConfigMap |
| `ZAI_BASE_URL` | `https://api.z.ai/api/coding/paas/v4` | HTTPS URL | ConfigMap |
| `ZAI_MODELS` | `glm-5.3,glm-5-turbo,glm-4.7,glm-4.7-flash` | comma-separated distinct provider model identifiers | ConfigMap |
| `ZAI_API_KEY` | none | required for workflow workers in ZAI mode | Secret |
| `LLM_MODEL_PRIORITY` | first 3 entries of `ZAI_MODELS` | optional comma-separated 1–3 models contained in `ZAI_MODELS` | ConfigMap |
| `LLM_MAX_MODELS_PER_STEP` | `3` | 1–3 | ConfigMap |
| `LLM_MAX_ATTEMPTS_PER_MODEL` | `2` | 1–2 | ConfigMap |
| `LLM_REQUEST_TIMEOUT_MS` | `300000` | 1,000–1,800,000 | ConfigMap |
| `LLM_RETRY_INITIAL_DELAY_MS` | `2000` | 100–60,000 | ConfigMap |
| `LLM_RETRY_MAX_DELAY_MS` | `30000` | ≥ initial and ≤600,000 | ConfigMap |
| `LLM_RETRY_JITTER_PERCENT` | `20` | 0–100 | ConfigMap |
| `LLM_MODEL_MAX_CONCURRENCY_JSON` | none | JSON object with positive integer per configured model | ConfigMap |
| `LLM_CIRCUIT_FAILURE_THRESHOLD` | `5` | 1–1,000 | ConfigMap |
| `LLM_CIRCUIT_WINDOW_MS` | `60000` | 1,000–3,600,000 | ConfigMap |
| `LLM_CIRCUIT_OPEN_MS` | `120000` | 1,000–3,600,000 | ConfigMap |
| `LLM_CIRCUIT_HALF_OPEN_MAX_REQUESTS` | `1` | 1–100 | ConfigMap |

Retryable classes are timeout, network, HTTP `429` and `5xx`. HTTP `400`, `401`, `403`, content-policy and unknown errors are non-retryable; unknown errors are logged at `ERROR` with redaction.

## SSE and webhook

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `SSE_HEARTBEAT_MS` | `15000` | 1,000–120,000 | ConfigMap |
| `SSE_POLL_INTERVAL_MS` | `1000` | 100–30,000 | ConfigMap |
| `WEBHOOK_ENABLED` | `false` | boolean | ConfigMap |
| `WEBHOOK_URL` | none | required HTTPS URL when enabled; admin-controlled | ConfigMap |
| `WEBHOOK_SECRET` | none | required when enabled, minimum 32 bytes | Secret |
| `WEBHOOK_TIMEOUT_MS` | `10000` | 1,000–120,000 | ConfigMap |
| `WEBHOOK_MAX_ATTEMPTS` | `5` | 1–20 | ConfigMap |
| `WEBHOOK_RETRY_INITIAL_DELAY_MS` | `5000` | 100–600,000 | ConfigMap |
| `WEBHOOK_RETRY_MAX_DELAY_MS` | `300000` | ≥ initial and ≤3,600,000 | ConfigMap |

## Debug diagnostics

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `DIAGNOSTIC_CAPTURE_PROTECTED` | `false` | boolean; enable only in an approved diagnostic environment | ConfigMap |
| `DIAGNOSTIC_TRACE_MAX_PAGE_SIZE` | `100` | 10–500 | ConfigMap |
| `DIAGNOSTIC_DETAIL_MAX_BYTES` | `1048576` | 1,024–10,485,760 | ConfigMap |

The base trace stores and returns safe semantic metadata. Full prompts, adapted instructions,
intermediate payloads and error stacks are not implied to exist when protected capture is off;
Debug labels them as not recorded. Protected artifact reads require a diagnostic role, stack
traces require `system-admin`, and every permitted protected read creates an audit event.
Responses are redacted again and bounded by `DIAGNOSTIC_DETAIL_MAX_BYTES`.

## Retention and SLO

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `RETENTION_FINAL_RESULTS_DAYS` | `180` | 1–3,650 | ConfigMap |
| `RETENTION_CHECKPOINTS_AFTER_COMPLETION_DAYS` | `30` | 1–3,650 | ConfigMap |
| `RETENTION_INTERMEDIATE_RESULTS_DAYS` | `30` | 1–3,650 | ConfigMap |
| `RETENTION_RAW_LLM_RESPONSES_DAYS` | `14` | 1–3,650 | ConfigMap |
| `RETENTION_FULL_PROMPTS_DAYS` | `14` | 1–3,650 | ConfigMap |
| `RETENTION_AUDIT_DAYS` | `365` | 1–3,650 | ConfigMap |
| `RETENTION_CLEANUP_INTERVAL_MS` | `3600000` | 60,000–86,400,000 | ConfigMap |
| `RETENTION_CLEANUP_BATCH_SIZE` | `500` | 1–10,000 | ConfigMap |
| `SLO_AVAILABILITY_PERCENT` | `99.5` | 0–100 | ConfigMap |
| `SLO_API_P95_MS` | `500` | positive | ConfigMap |
| `SLO_JOB_ACCEPT_P95_MS` | `2000` | positive | ConfigMap |
| `SLO_DECOMPOSITION_START_P95_MS` | `30000` | positive | ConfigMap |
| `SLO_RESEARCH_START_P95_MS` | `120000` | positive | ConfigMap |
| `SLO_ACTIVITY_RECOVERY_MS` | `120000` | positive | ConfigMap |
| `FAILOVER_RPO_TARGET_SECONDS` | `300` | positive | ConfigMap |
| `FAILOVER_RTO_TARGET_SECONDS` | `1800` | positive | ConfigMap |

Trace metadata uses `expires_at` and is removed in bounded tenant-scoped maintenance batches.
Referenced diagnostic artifacts follow the existing raw-response/full-prompt retention classes;
after content expiry, the timeline remains useful and reports the detail as expired or not recorded.

## Effective configuration and snapshots

The API exposes only a privileged, redacted diagnostic view. It reports source, parsed value for non-secrets and whether each secret is configured, never the secret value. Every job snapshots model order, attempts, deadlines, chunking parameters and relevant feature flags so a redeploy cannot change an in-flight workflow.
# Requirements integration and prompt releases

`REQUIREMENTS_INTEGRATION_API_ENABLED` controls the additive domain submission routes; disabling it does not disable canonical jobs. `VERSIONED_PROMPTS_ENABLED` controls prompt-profile resolution for newly accepted production jobs and should remain enabled after worker qualification.

The two workflow families have independent active/released settings: `PROMPT_DECOMPOSITION_ACTIVE_VERSION`, `PROMPT_DECOMPOSITION_RELEASED_VERSIONS`, `PROMPT_REQUIREMENTS_INSIGHTS_ACTIVE_VERSION`, and `PROMPT_REQUIREMENTS_INSIGHTS_RELEASED_VERSIONS`. Released values are comma-separated immutable semantic versions (at most ten); active must be included in its released set. Run `npm --workspace server run prompts:qualify` against every API/worker image before activation. See [prompt bundle release and rollback](prompt-bundles.md).

## Requirements MCP gateway

MCP uses a separate runtime and does not read backend prompt/provider/database settings.

| Variable | Default | Validation | Owner |
|---|---:|---|---|
| `MCP_ENABLED` | `false` | boolean; production remains disabled until qualification | ConfigMap |
| `MCP_ENVIRONMENT` | `NODE_ENV` | `production` activates strict transport policy | ConfigMap |
| `MCP_TRANSPORT` | `streamable-http` | production: only `streamable-http`; `stdio` local/test only | ConfigMap |
| `MCP_HOST` | `127.0.0.1` | bind address | ConfigMap |
| `MCP_PORT` | `5180` | 1–65,535 | ConfigMap |
| `MCP_PUBLIC_ENDPOINT` | local `/mcp` URL | absolute URL; HTTPS required in enabled production | ConfigMap |
| `MCP_ALLOWED_HOSTS` | localhost only | comma-separated; required in enabled production | ConfigMap |
| `MCP_BACKEND_API_URL` | `http://127.0.0.1:5178` | fixed absolute HTTP(S) URL without credentials/query/fragment | ConfigMap |
| `MCP_IAM_AUDIENCE_MODE` | `forward-same-audience` | only supported first-release policy | ConfigMap |
| `MCP_TOOL_SCHEMA_VERSION` | `2.0.0` | published schema version | ConfigMap |
| `MCP_BUILD_VERSION` | `1.0.0` | immutable image/build identifier | ConfigMap |
| `MCP_BACKEND_TIMEOUT_MS` | `10000` | 100–120,000 | ConfigMap |
| `MCP_AUTH_TIMEOUT_MS` | `5000` | 100–30,000 | ConfigMap |
| `MCP_BODY_LIMIT_BYTES` | `1100000` | 1,024–2,000,000 | ConfigMap |
| `MCP_RESPONSE_LIMIT_BYTES` | `262144` | 4,096–1,000,000 | ConfigMap |
| `MCP_MAX_CONCURRENCY` | `32` | 1–512 | ConfigMap |
| `MCP_READINESS_BEARER_TOKEN` | none | required in enabled production; least-privilege service account used only for API compatibility readiness | Secret |
| `MCP_STDIO_BEARER_TOKEN` | none | required only for explicit local/test stdio | local secret/env |

See [MCP gateway contract and security](mcp-requirements-adapter.md).
