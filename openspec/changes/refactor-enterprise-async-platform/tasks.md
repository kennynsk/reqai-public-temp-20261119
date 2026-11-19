## 1. Contracts and Baseline

- [x] 1.1 Record current synchronous API request/response fixtures and end-to-end decomposition/research behavior as regression tests.
- [x] 1.2 Define and validate the `/api/v1` OpenAPI contract for jobs, artifacts, history, results, cancellation, retry and operational errors.
- [x] 1.3 Define versioned Kafka/SSE/webhook event schemas with event identity, tenant, job sequence and compatibility rules.
- [x] 1.4 Document all env settings, defaults, validation rules and secret versus non-secret ownership, including the agreed SLO, retention, model and capacity values.
- [x] 1.5 Obtain and record LLM model RPM, TPM, context, output and parallel-connection limits and IAM/NGAM issuer, audience and claim mappings.

## 2. Backend Foundation

- [x] 2.1 Split the Express bootstrap into independently testable app, server, configuration, middleware, routes, services and provider modules without changing legacy behavior.
- [x] 2.2 Implement fail-fast typed env validation and a redacted effective-configuration diagnostic for operators.
- [x] 2.3 Add correlation/request context propagation and production-safe structured logging that excludes prompts, results and credentials.
- [x] 2.4 Add consistent versioned API error envelopes and centralized validation/error middleware.
- [x] 2.5 Add `SIGTERM` handling, graceful HTTP drain and role-specific process entrypoints for API and background workers.

## 3. PostgreSQL Domain and Persistence

- [x] 3.1 Add database connectivity, migration tooling and health checks using a dedicated application schema and least-privilege users.
- [x] 3.2 Create tenant-aware tables and indexes for jobs, job steps, attempts, dependencies, idempotency keys and configuration snapshots.
- [x] 3.3 Create artifact metadata/content, outbox, webhook delivery, audit and operational-state tables with retention indexes.
- [x] 3.4 Implement transactional repositories and state-transition guards for the complete job status/outcome state machine.
- [x] 3.5 Enforce unique `(tenant_id, idempotency_key)` job creation and unique checkpoint keys `(job_id, step_id, input_hash)`.
- [x] 3.6 Add PostgreSQL Row-Level Security and transaction-scoped tenant context, including negative cross-tenant tests.

## 4. IAM, NGAM and Authorization

- [x] 4.1 Integrate IAM/NGAM token validation for issuer, audience, signature, expiry and configured claims.
- [x] 4.2 Map `user`, `tenant-admin`, `operator`, `auditor` and `system-admin` roles to endpoint permissions and verify least privilege.
- [x] 4.3 Apply `DEFAULT_TENANT_ID` only under the configured missing-claim policy and reject user-supplied tenant identifiers.
- [x] 4.4 Implement immutable audit recording for job, artifact, maintenance, cancellation, retry/reset and webhook redelivery actions.
- [x] 4.5 Add authorization tests for job history, result/artifact access, SSE subscriptions and privileged Temporal operations.

## 5. Asynchronous Job API

- [x] 5.1 Implement idempotent `POST /api/v1/jobs` with transactional job/outbox creation and `202 Accepted` response metadata.
- [x] 5.2 Implement tenant/user-scoped job detail, paginated history and result endpoints with status, outcome, progress and model metadata.
- [x] 5.3 Implement cooperative cancel and authorized retry endpoints, preserving immutable input snapshots and parent/attempt linkage.
- [x] 5.4 Implement decomposition-before-research priority, per-user admission limits and configurable soft/hard backlog responses.
- [x] 5.5 Add compatibility routing or feature flags so legacy synchronous endpoints remain available during migration.

## 6. Temporal Integration and Durable Workflows

- [x] 6.1 Add the `WorkflowEngine` boundary and a Temporal adapter for start, signal, cancel, retry/reset and execution lookup.
- [x] 6.2 Configure the Temporal namespace, separate decomposition/research/synthesis task queues, worker identities and deterministic workflow versioning.
- [x] 6.3 Implement an idempotent outbox dispatcher that starts Temporal workflows and a reconciler for committed but unstarted jobs.
- [x] 6.4 Implement the checkpointed decomposition workflow: validate, normalize/chunk, decompose, merge/validate and persist.
- [x] 6.5 Implement the checkpointed research workflow: analyze categories, bounded-parallel category research, synthesis, improve and persist.
- [x] 6.6 Implement durable retry timers, activity timeouts/heartbeats, cancellation propagation and deadline enforcement.
- [x] 6.7 Implement `COMPLETE` and `PARTIAL` outcome evaluation, including at least one successful research category or decomposition section.
- [x] 6.8 Add workflow replay/versioning tests and prove that a worker restart resumes from checkpoints without duplicating completed steps.

## 7. LLM Execution Resilience

- [x] 7.1 Refactor the single-provider adapter to expose normalized responses, usage, request IDs and safe classified errors for all configured models.
- [x] 7.2 Implement immutable per-job model-policy snapshots with at most three prioritized models and two attempts per model.
- [x] 7.3 Implement retry/fallback for timeout, network, `429` and `5xx`, and non-retryable handling for `400`, `401`, `403`, content-policy and unknown errors.
- [x] 7.4 Implement per-model circuit breakers with configurable closed/open/half-open behavior and metrics.
- [x] 7.5 Implement distributed or database-coordinated per-model concurrency limits that work across workers in both data centers.
- [x] 7.6 Persist and expose requested/completed model, attempt history, fallback reasons, execution site, timings and token usage for every step.
- [x] 7.7 Add failure-matrix tests for retry, fallback, circuit transitions, deadline expiration, partial completion and sanitized unknown errors.
- [x] 7.8 Wire the real ZAI provider endpoint, credentials and model catalog from `.env.dev` into local durable workflow workers, keeping mock execution available only as an explicit test override.

## 8. Large Artifact Pipeline

- [x] 8.1 Implement tenant-authorized streaming artifact upload with 100 MB limit, checksum validation and bounded API memory use.
- [x] 8.2 Implement streaming artifact download and result-content endpoints with metadata-only list/detail queries.
- [x] 8.3 Ensure job, Temporal, Kafka, SSE and webhook payloads carry artifact references instead of large content, with automated payload-size tests.
- [x] 8.4 Implement normalization, token estimation, configurable chunk planning and checkpointed bounded-parallel chunk processing.
- [x] 8.5 Implement hierarchical synthesis with traceability from final output to processed chunks and explicit reporting of failed chunks.
- [x] 8.6 Add artifact integrity, concurrent upload/download, 100 MB boundary and interrupted-transfer tests.

## 9. Kafka Events, SSE and Webhook

- [x] 9.1 Implement the transactional outbox publisher to the versioned job-event Kafka topic with idempotent publication and metrics.
- [x] 9.2 Implement ordered job event sequencing and consumer deduplication by `eventId`.
- [x] 9.3 Implement authenticated SSE subscriptions, heartbeat, `Last-Event-ID` handling and REST reconciliation support.
- [x] 9.4 Implement the optional single-destination webhook dispatcher with HMAC-SHA256, terminal metadata-only payloads and configured timeouts.
- [x] 9.5 Implement webhook exponential retry, persistent delivery history, Kafka DLQ and system-admin redelivery.
- [x] 9.6 Add disconnect/reconnect, duplicate/out-of-order event, invalid signature, webhook outage and DLQ integration tests.

## 10. Frontend Job Experience

- [x] 10.1 Replace duplicated request helpers with one authenticated `/api/v1` client supporting idempotency, cancellation and normalized errors.
- [x] 10.2 Replace browser-side decomposition orchestration with job submission, durable progress and result rendering.
- [x] 10.3 Replace browser-side research/category/synthesis/improve orchestration with backend job submission and progress views.
- [x] 10.4 Add paginated job history and restore active/completed jobs after reload, logout/login and navigation between modules.
- [x] 10.5 Add SSE updates with automatic reconnect and mandatory REST reconciliation.
- [x] 10.6 Display `COMPLETE` versus `PARTIAL`, failed steps/chunks, requested and actual models, fallback reasons and execution attempts clearly.
- [x] 10.7 Add streaming artifact upload/download UX with validation and progress for files up to 100 MB.
- [x] 10.8 Add frontend tests for abandoned sessions, partial results, cancellation, retries, authorization failures and legacy feature-flag rollback.
- [x] 10.9 Restore functional parity with the original application through durable modes for decomposition insights, standard research, model/temperature comparison, agent comparison, agent research and prompt testing.
- [x] 10.10 Expose mode-specific persisted results in the asynchronous UI and add backend/frontend regression tests for the migrated scenarios.
- [x] 10.11 Restore visual and interaction parity with the original frontend while retaining durable REST job submission, history, progress and results.

## 11. Images and Kubernetes Deployment

- [x] 11.1 Create a multi-stage frontend image and Nginx configuration with SPA fallback, cache policy and health endpoint.
- [x] 11.2 Create a non-root backend image with production dependencies and selectable API/worker/maintenance entrypoints.
- [x] 11.3 Add local two-service development/Compose configuration using the same public `/api` routing contract.
- [x] 11.4 Add Kubernetes Deployments and Services for frontend, API, decomposition workers, research workers, event delivery and maintenance roles.
- [x] 11.5 Add NGAM/Ingress routing, liveness/readiness/startup probes, resource requests/limits, PDB, topology spread and security contexts.
- [x] 11.6 Add Secret/ConfigMap and certificate volume wiring without embedding credentials in images or manifests.
- [ ] 11.7 Deploy and validate Temporal server replicas in both data centers with a separate PostgreSQL schema, operator Web UI and system-admin controls.

## 12. Enterprise Operations

- [x] 12.1 Implement PostgreSQL-backed operational modes `NORMAL`, `ACCEPT_AND_QUEUE`, `DRAIN`, `REJECT_NEW` and `FAILOVER_IN_PROGRESS` with operator authorization.
- [x] 12.2 Implement role-specific readiness and graceful drain so one data center can leave service while the other continues API and workflow processing.
- [x] 12.3 Implement retention workers with configured defaults, batch size, active-job/legal-hold protection, metrics and audit events.
- [x] 12.4 Add OpenTelemetry propagation across HTTP, workflow, provider, PostgreSQL, Kafka, SSE and webhook boundaries.
- [x] 12.5 Add dashboards and alerts for API SLO, queue wait, backlog, active/stalled jobs, model concurrency/circuit/fallback, artifacts, webhook and retention.
- [x] 12.6 Produce operator runbooks for maintenance, model outage, backlog, workflow retry/reset, webhook DLQ, dependency outage and rollback.

## 13. Verification and Capacity Qualification

- [x] 13.1 Add contract, repository, workflow, provider and API integration suites runnable without real paid LLM calls.
- [ ] 13.2 Run load tests for 100 concurrent users, 30 accepted jobs/min and 5 typical/10 maximum research categories.
- [ ] 13.3 Calibrate per-model concurrency and backlog limits against measured provider RPM/TPM and verify decomposition priority SLO.
- [ ] 13.4 Run soak tests including 100 MB artifacts and verify PostgreSQL growth, query latency, cleanup, backup and restore behavior.
- [ ] 13.5 Run pod-kill, worker-kill, API restart, Temporal restart, Kafka interruption and PostgreSQL failover tests and verify idempotent recovery.
- [ ] 13.6 Run controlled single-data-center outage and recovery drills and demonstrate 99.5% design, RPO ≤5 minutes and RTO ≤30 minutes.
- [ ] 13.7 Perform security tests for IAM/NGAM, RBAC, tenant isolation, RLS, log redaction, webhook SSRF prevention/signatures and secret handling.

## 14. Staged Migration and Cleanup

- [ ] 14.1 Deploy additive database migrations and new infrastructure without changing existing production traffic.
- [ ] 14.2 Canary the asynchronous decomposition flow behind a feature flag and verify rollback to the legacy endpoint.
- [ ] 14.3 Canary the asynchronous research flow and independently validate partial/fallback/artifact behavior.
- [ ] 14.4 Enable history, SSE and webhook incrementally while monitoring SLO, error rate, backlog and data growth.
- [ ] 14.5 Route all production frontend traffic to `/api/v1` after acceptance and complete a two-data-center drain/failover rehearsal.
- [ ] 14.6 Remove backend static frontend serving and retire legacy synchronous endpoints only after the agreed compatibility window.
- [ ] 14.7 Update production documentation, support procedures and architecture records, then obtain security and operations sign-off.

## 15. Sequential Requirements Journey

- [x] 15.1 Extend the job API and persistence mapping to accept and expose validated `parentJobId` lineage for research jobs created from an owned decomposition job.
- [x] 15.2 Add API support for saving and retrieving immutable user-reviewed requirements artifacts derived from decomposition and research results.
- [x] 15.3 Replace decomposition's automatic insights step with an explicit frontend action that saves the reviewed requirements and starts a child research job using that artifact.
- [x] 15.4 Add a research-improvement review UI that lets users accept or reject proposed changes and save the selected final requirements version.
- [x] 15.5 Add backend and frontend regression tests for reload-safe edits, no-research completion, linked research lineage and persisted final requirements.

## 16. Embedded Requirements Insights

- [x] 16.1 Add durable `REQUIREMENTS_INSIGHTS` research mode using the original requirements-insights prompt and structured insight result contract.
- [x] 16.2 Keep linked research navigation inside the «Бизнес-требования» workspace and restore the original AI-Ресерчер cards, category filters and back-to-requirements interaction.
- [x] 16.3 Map selected insight enhancements into the final reviewed requirements version while preserving research/decomposition lineage.
- [x] 16.4 Add workflow and frontend regression tests proving that linked AI-Ресерч does not activate the standalone market-research module and remains reload-safe.

## 17. Honest Progress and Background Tasks

- [x] 17.1 Add an idempotent repository/service operation that persists safe `currentStep`, `message` and confirmed milestone `progress` without performing a lifecycle transition, and publishes an ordered progress event through the transactional outbox.
- [x] 17.2 Map checkpoint start/completion for decomposition and research workflows to stable user-facing phases and progress milestones, preserving indeterminate progress during active LLM calls and REST recovery after missed SSE events.
- [x] 17.3 Replace the separate decomposition/research loading fragments with a shared `ActiveJobPanel` that shows phase, confirmed progress, elapsed time, honest duration guidance, cancellation and «Продолжить в фоне».
- [x] 17.4 Keep known active jobs reconciled at workspace level, add a compact header indicator and show an in-app terminal notification with an action that opens a background job result.
- [x] 17.5 Add backend and frontend regression tests for ordered milestone events, REST reconciliation, non-fabricated progress, background navigation, completion notification and return to the finished task.

## 18. Living Progress Experience

- [x] 18.1 Add a deterministic monotonic ease-out visual progress estimator for long model phases that starts from the authoritative milestone, remains below the next server-confirmed boundary, restores from job timing data and yields immediately to REST/SSE progress.
- [x] 18.2 Redesign `ActiveJobPanel` with workflow-specific rotating focus messages, a confirmed-phase mini-timeline, stronger continuous activity treatment and honest estimate guidance; remove the competing percentage from the four-step business journey.
- [x] 18.3 Add frontend tests for estimator boundaries and reload stability, semantic message rotation, confirmed mini-timeline states, authoritative progress jumps and the absence of competing business percentages.

## 19. Original Business Context Navigation

- [x] 19.1 Restore the original decomposition input artifact when a requirements-insights child job is opened directly or after reload, and expose it throughout the later requirements journey.
- [x] 19.2 Add a persistent read-only «Исходная бизнес-задача» disclosure to research and final views with frontend regression coverage that preserves the current research view and decisions.

## 20. Concise Requirements Journey

- [x] 20.1 Remove redundant framing and loading copy, replace «Сейчас в фокусе» with the direct activity message, and move the orientational progress explanation behind an accessible information tooltip.
- [x] 20.2 Consolidate saved-version states and research source navigation, hide inactive save actions, and apply progressive disclosure to research card details and enhancements.
- [x] 20.3 Update frontend regression tests for the concise hierarchy, tooltip copy, source-data navigation, conditional save actions and collapsed research details.
- [x] 20.4 Keep the complete research-card summary visible while retaining progressive disclosure for relations, sources, detail and enhancements, with regression coverage.
