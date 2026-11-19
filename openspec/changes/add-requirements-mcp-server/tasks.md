## 1. Runtime and Contract Foundation

- [x] 1.1 Select and pin the MCP SDK/transport versions, record their security posture and add a separately runnable MCP gateway package or runtime entrypoint.
- [x] 1.2 Define versioned strict schemas for `decompose_requirements`, `start_research`, `research_requirements`, `get_task_status` and `get_task_result` with unknown-field rejection.
- [x] 1.3 Define the shared accepted-job, status, result and structured-error tool DTOs without prompt, credential or protected artifact fields.
- [x] 1.4 Add configuration and validation for MCP enablement, environment, public endpoint, backend API URL, timeouts, schema version and production transport policy.
- [x] 1.5 Add tool discovery/version metadata and ensure no MCP capability is advertised by the main ReqAI API when the gateway is disabled or absent.

## 2. Enterprise Transport Authentication

- [x] 2.1 Implement authenticated Streamable HTTP session initialization and reject missing, invalid or expired Bearer credentials before tool execution.
- [x] 2.2 Resolve the production IAM audience decision, implementing delegated token exchange only if required while preserving caller principal, tenant and roles.
- [x] 2.3 Forward caller authority to the ReqAI API without logging, persisting or returning access tokens and without accepting tenant/owner fields from tool input.
- [x] 2.4 Apply tool-level role policy for human and service-account principals and preserve backend `401`, `403` and safe cross-tenant unavailable behavior.
- [x] 2.5 Restrict stdio transport to explicit local/test configuration and prove it cannot bypass backend authentication in production mode.

## 3. Requirements API Client and Tool Mapping

- [x] 3.1 Implement a bounded ReqAI REST client for domain submissions and canonical job status/result resources with request correlation and safe timeout handling.
- [x] 3.2 Map `decompose_requirements` to `POST /api/v1/decompositions`, including inline XOR artifact input, product options, prompt version and required idempotency key.
- [x] 3.3 Map `start_research` to `POST /api/v1/research` with only `standard` and `agent` strategies and no internal modes.
- [x] 3.4 Map `research_requirements` to the nested requirements-version research endpoint without client lineage overrides.
- [x] 3.5 Map `get_task_status` and `get_task_result` to canonical job query endpoints without creating MCP-specific task state or waiting loops.
- [x] 3.6 Translate canonical backend and gateway failures into stable structured MCP errors while preserving retryability and approved safe details.
- [x] 3.7 Enforce response size and content allowlists so large artifacts remain references retrieved through the governed backend contract.

## 4. Asynchronous, Idempotency and Parity Tests

- [x] 4.1 Add contract tests proving all start tools return immediately after acceptance with the same `jobId` and follow-up references as REST.
- [x] 4.2 Add replay/conflict tests proving idempotency keys create one artifact/job and differ for changed input, options, strategy or prompt version.
- [x] 4.3 Add status/result parity tests for accepted, running, complete, partial, failed, cancelled and result-not-ready jobs.
- [x] 4.4 Add validation tests for missing/dual inputs, unknown fields, technical lineage, internal modes, arbitrary prompts and oversized inline content.
- [x] 4.5 Add backend-unavailable, timeout and admission-policy tests proving the gateway never runs a local fallback workflow.
- [x] 4.6 Add a guard test proving the MCP runtime imports no repositories, workflow activities, prompt catalog or provider executor.

## 5. Security and Isolation Qualification

- [x] 5.1 Add authentication tests for valid human/service-account tokens, missing/invalid/expired tokens, insufficient roles and wrong audiences.
- [x] 5.2 Add two-principal and two-tenant tests for artifact, requirements-version, job status and result isolation.
- [x] 5.3 Verify tool inputs cannot set tenant, owner or delegated identity and cannot redirect requirements lineage.
- [x] 5.4 Add redaction tests for authorization headers, tool arguments, inline requirements, prompt metadata, backend bodies and protocol traces.
- [x] 5.5 Threat-model session fixation, confused-deputy behavior, SSRF/backend URL configuration, tool schema injection and denial-of-service limits and close accepted findings.

## 6. Operations and Deployment

- [x] 6.1 Add liveness, readiness, backend compatibility checks, graceful drain/shutdown and safe build/tool-schema version reporting.
- [x] 6.2 Add bounded concurrency, request/body limits, backend timeouts and retry rules that never retry mutations without the original idempotency key.
- [x] 6.3 Add safe metrics and traces for tool calls, outcomes, latency, auth rejection and backend errors without sensitive labels or payloads.
- [x] 6.4 Create independent deployment manifests, network policy, ingress/TLS configuration, secret references and disabled-by-default production enablement.
- [x] 6.5 Document client setup, tool contracts, JWT/service-account expectations, large-artifact workflow, polling and result retrieval.
- [x] 6.6 Document canary publication, rollback by gateway disablement, incident response and confirmation that accepted REST jobs continue unaffected.

## 7. End-to-End Release Qualification

- [x] 7.1 Run MCP protocol conformance and schema tests against the selected SDK and Streamable HTTP transport.
- [x] 7.2 Run end-to-end decomposition, standalone research and requirements-version research with the mock provider through MCP, backend API, canonical status and result.
- [x] 7.3 Run enterprise auth, tenant isolation, idempotency, partial/failure, unavailable-backend and redaction qualification in a deployment-like environment.
- [x] 7.4 Verify the main API and workers remain backward compatible with MCP disabled and that no direct execution or duplicate state path exists.
- [x] 7.5 Run the complete gateway/server test suites and strict OpenSpec validation, then record production publication readiness.
