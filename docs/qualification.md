# Enterprise qualification and rollout evidence

OpenSpec qualification tasks are closed only from immutable JSON evidence generated against the approved on-prem environment. Mock runs never qualify production tasks.

## Prerequisites

- 100 short-lived IAM/NGAM bearer tokens in a permission-restricted JSON file;
- pre-uploaded tenant-owned input artifact and a cross-tenant fixture job;
- exact Kubernetes contexts for both data centers and an isolated qualification namespace;
- approved incident/change ID exported as `QUAL_CHANGE_ID`;
- provider quota sheet with measured RPM, TPM, context, output and connection limits.

## Commands

Run `npm run qualify:load` for 100 users, 30 jobs/min and 5/10-category traffic. Run `npm run qualify:soak` for a 24-hour minimum 100 MB run and an approved database growth/query/backup/restore verifier. Run `npm run qualify:security` for IAM/RBAC/tenant checks. Failure and DC drills use `npm run qualify:drill` and `npm run qualify:failover`; both require the explicit `QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND` guard and reviewed command argv. `npm run qualify:rollout-gate` refuses final rollout evidence until all qualification kinds, compatibility-window expiry and external security/operations sign-off IDs are present.

Evidence is written with create-only semantics under `qualification/evidence/`; it includes a SHA-256 digest but never tokens, prompts, results or credentials. Operations and security reviewers sign the evidence externally and reference its `evidenceId` in the architecture decision and rollout record.

For the permanent-task/Debug change, run `npm run qualify:task-routing` against the local Compose
frontend or an approved environment via `REQAI_BASE_URL`. It covers creation → canonical `jobId` →
`/tasks/{jobId}`, direct SPA deep-link loading, two independent SSE readers receiving the same
ordered event, shared persisted state, and bounded trace pagination. Server contract tests cover
unchanged `/api/v1/jobs` identity, redaction, audit, retention, role/owner and tenant isolation;
client tests cover linked-research routing, legacy-selection conflicts, back/forward races, SSE
cursor resume, Debug accessibility and removal of the old inline technical block.

The remaining gates are: Temporal replicas/UI/schema in both DCs; load and provider calibration; 100 MB soak with DB backup/restore; pod/API/worker/Temporal/Kafka/PostgreSQL disruptions; controlled DC outage with measured RPO/RTO; security suite; additive migration; decomposition and research canaries; incremental SSE/webhook enablement; full `/api/v1` routing; compatibility-window expiry; endpoint removal and formal sign-off.

## Requirements integration implementation qualification — 2026-08-24

`add-requirements-integration-api` is implementation-ready for controlled rollout. The complete server suite passed 133/133 tests, prompt catalog qualification accepted five active `1.0.0` bundles (including the compatibility-only combined-decomposition bundle), and strict OpenSpec validation passed. Mock-provider HTTP qualification covered decomposition, standalone research and requirements-version research through accepted job, canonical status and result retrieval. A direct Docker API smoke run also completed a decomposition job through `glm-5.3`. This record is implementation evidence, not a replacement for the production environment gates above.

## Requirements MCP gateway qualification — 2026-08-25

The follow-up `add-requirements-mcp-server` is implemented as a separately deployable, disabled-by-default gateway. Its suite passed 27/27 tests, including official SDK Streamable HTTP conformance and all three starts through ReqAI REST and the mock provider. The server suite remains 133/133, frontend build and strict OpenSpec validation pass, the standalone image builds with zero known production vulnerabilities, and a live Docker MCP smoke created and read the same canonical decomposition job. See [MCP release qualification](mcp-qualification.md); real IAM/tenant canary sign-off remains an environment-specific production publication gate.
