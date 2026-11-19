## Context

See `proposal.md` for motivation. `add-requirements-integration-api` provides strict domain REST submissions, canonical job status/result resources, JWT/RBAC/tenant enforcement and a protocol-neutral adapter contract. The MCP delivery must remain a façade over those capabilities and must not become another orchestration or prompt-execution service.

## Goals / Non-Goals

**Goals:**

- Publish a small enterprise MCP tool surface over the existing requirements APIs.
- Preserve canonical `jobId`, asynchronous behavior, idempotency, auth scope and errors across transports.
- Deploy and roll back MCP independently of the main API and workers.
- Keep credentials, prompts and large artifacts out of MCP logs and ordinary tool payloads.

**Non-Goals:**

- Execute prompts, providers or Temporal workflows in the MCP process.
- Introduce MCP-specific job/result persistence or tenant configuration.
- Replace REST, expose internal comparison/prompt-test modes or stream LLM completion through a start tool.
- Add an MCP prompt/resource surface in the first server release; the scope is tools only.

## Decisions

### 1. Deploy a separate thin MCP gateway over REST

The production MCP process calls the released domain submission and canonical query APIs. This matches the intended wrapper model, gives the gateway independent scaling and exposure policy, and leaves the backend as the single authorization/orchestration authority. The shared `requirements-adapter-boundary` remains the semantic contract and can support an in-process deployment later, but REST is the initial deployment boundary.

Alternative considered: import repositories and activities into the MCP process. Rejected because it duplicates security, transaction, lifecycle and rollout logic.

### 2. Use remote Streamable HTTP for production and stdio only for local qualification

Production exposes one authenticated remote MCP endpoint behind the enterprise ingress. Local stdio may be enabled only in development/test configuration and must not bypass backend authentication. No unauthenticated production transport is supported.

Alternative considered: stdio as the enterprise deployment contract. Rejected because it does not provide the centrally governed remote service, tenant context and operational controls required here.

### 3. Forward verified end-user/service-account authority to the backend

The gateway validates transport authentication and forwards the caller's Bearer access token to the REST API, which remains authoritative for claim mapping, roles and tenant isolation. The gateway never accepts tenant fields and never substitutes a broad shared application credential for user-scoped calls. Token values are memory-only and redacted from telemetry.

Alternative considered: one gateway service credential plus caller identity headers. Rejected because it creates a second trust protocol and risks privilege escalation. Token exchange can be added later only if the enterprise IAM requires audience conversion and preserves delegated identity.

### 4. Keep starts asynchronous and require client idempotency keys

Each start tool requires a 16–128 character idempotency key and returns the backend `202` envelope. MCP request IDs are correlation data, not a durable idempotency identity. Clients call status/result tools or canonical URLs afterwards; the gateway does not poll on their behalf inside start calls.

Alternative considered: a long-running tool that waits for completion. Rejected because research can exceed connection lifetimes and would weaken retry semantics.

### 5. Map tools one-to-one to stable domain operations

`decompose_requirements`, `start_research` and `research_requirements` map to the three domain POST endpoints. `get_task_status` and `get_task_result` map to canonical job GET endpoints. Input schemas reject unknown properties, technical lineage and arbitrary prompts. Large content uses pre-uploaded `inputArtifactId`; MCP does not proxy large byte streams in this release.

### 6. Translate errors without changing their meaning

The gateway maps backend status and `ApiError` fields into MCP structured error content with `code`, `message`, `retryable`, `requestId` and approved details. Authentication and connectivity failures have separate stable gateway codes. No raw response body, stack, token, prompt or artifact content is included.

### 7. Qualify and publish independently

Readiness verifies configuration, auth metadata/JWKS reachability as applicable, backend API compatibility and tool schema version. Deployment publishes the remote MCP endpoint only after end-to-end tests cover every tool, two principals/tenants, idempotency conflict/replay, unavailable backend, partial result and redaction. MCP can be disabled or rolled back without changing API/workers.

## Risks / Trade-offs

- **[Risk] Forwarded token has the wrong backend audience.** → Define supported IAM audience or delegated token exchange during configuration qualification; fail closed rather than use a privileged fallback credential.
- **[Risk] MCP and REST schemas drift.** → Generate or contract-test tool mappings against OpenAPI and version the tool surface.
- **[Risk] Gateway retries mutate twice.** → Require client idempotency keys and preserve them exactly at the backend boundary.
- **[Risk] Long research exceeds transport expectations.** → Return after acceptance and expose explicit status/result tools.
- **[Risk] Credentials or prompts leak through protocol tracing.** → Field-level allowlists, redaction tests and protected diagnostic policy; never log request bodies or authorization headers.
- **[Trade-off] REST adds one network hop.** → Accept the small control-plane cost for isolation and reuse; LLM execution remains asynchronous and dominates latency.

## Migration Plan

1. Complete and deploy `add-requirements-integration-api`, prompt bundles and canonical API qualification.
2. Implement the MCP gateway and tool schemas behind disabled configuration.
3. Qualify auth and backend API compatibility in a non-production environment, including service-account and human principals.
4. Publish the remote endpoint to a limited client allowlist and monitor safe tool/error metrics.
5. Expand availability after idempotency, partial/failure and tenant-isolation evidence is accepted.
6. Roll back by disabling or removing the MCP gateway endpoint; REST jobs and already accepted work continue unchanged.

## Open Questions

- The enterprise IAM may require delegated token exchange when MCP and ReqAI API use different audiences. This does not change tool behavior, but the selected mechanism must be resolved during implementation configuration before production enablement.
