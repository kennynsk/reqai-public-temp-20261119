## 1. Prompt Bundle Foundation

- [x] 1.1 Define the prompt-bundle manifest validator, catalog registry interface and deterministic SHA-256 calculation for manifests and template files.
- [x] 1.2 Define the output-contract registry and register the existing decomposition, requirements-insights, standard-research and agent-research parse/validation contracts with explicit schema identifiers.
- [x] 1.3 Extract the current production decomposition prompts into an immutable `requirements-decomposition/1.0.0` bundle without intentional wording changes and add rendering fixtures that prove parity with the current builder.
- [x] 1.4 Extract the current requirements-insights, standard-research and agent-research prompt chains into complete `1.0.0` bundles with declared variables, step mappings, hashes and output contracts.
- [x] 1.5 Add startup and qualification validation for duplicate bundle identities, path traversal, missing steps or variables, hash mismatch, unsupported workflow purposes and unsupported output contracts.
- [x] 1.6 Add configuration for one active and a bounded allowlist of released versions per workflow purpose, including env examples, validation and safe startup inventory logging.

## 2. Prompt Profile Resolution and Execution

- [x] 2.1 Add a central prompt-profile resolver that maps job type, feature mode and optional requested version to a validated released bundle or a controlled policy error.
- [x] 2.2 Extend job acceptance to persist bundle ID, version, manifest hash, template hashes and output schema version in `configuration_snapshot` for every production decomposition and research job.
- [x] 2.3 Extend canonical job option validation with optional `promptVersion` while preventing arbitrary bundle IDs, templates or prompt text from entering production workflows.
- [x] 2.4 Preserve the original prompt profile when creating linked retries and prove that active-version changes affect only newly accepted jobs.
- [x] 2.5 Implement deterministic prompt rendering from declared variables with missing-variable, undeclared-variable, rendered-size and integrity checks before provider invocation.
- [x] 2.6 Refactor async decomposition and research activities to load only their snapshotted bundle steps and output contracts instead of importing active hardcoded prompt builders.
- [x] 2.7 Support pre-change jobs without `promptProfile` through an explicit temporary compatibility path while preventing profile-bearing jobs from falling back to hardcoded or active prompts.
- [x] 2.8 Add safe bundle/version/schema/hash metadata to job diagnostics and audit facts while keeping templates and rendered prompts under the existing protected-detail policy.
- [x] 2.9 Add tests for multi-chunk consistency, multi-step atomicity, retry/replay consistency, missing historical bundles, altered hashes and unsupported output schemas.

## 3. Transport-Neutral Requirements Operations

- [x] 3.1 Define strict domain request DTOs and product-level strategy mapping for decomposition, standalone standard/agent research and requirements-version insights research.
- [x] 3.2 Implement canonical domain request hashing from operation, input checksum, normalized options and requested prompt version before allocating inline artifacts.
- [x] 3.3 Add a PostgreSQL repository operation that idempotently commits inline input artifact, accepted job, outbox event and audit record together, returning the existing job on an identical replay and conflict on a changed request.
- [x] 3.4 Implement the existing-artifact submission path with checksum-aware hashing, owner/tenant authorization and no control-plane content copy.
- [x] 3.5 Add an authorized requirements-version resolution operation that derives the immutable input artifact and eligible source decomposition job without trusting client lineage fields.
- [x] 3.6 Implement transport-neutral `startDecomposition`, `startStandaloneResearch` and `startRequirementsResearch` application operations that delegate to the canonical artifact, job and version services.
- [x] 3.7 Unit-test the application operations without Express objects, including idempotent replay, conflicting replay, strategy mapping, prompt-version policy and server-derived lineage.

## 4. Domain REST API

- [x] 4.1 Add strict request validation and `POST /api/v1/decompositions` for inline business context XOR authorized input artifact, returning the canonical `202 Accepted` job envelope.
- [x] 4.2 Add strict request validation and `POST /api/v1/research` for inline research context XOR authorized input artifact with supported `standard` and `agent` strategies.
- [x] 4.3 Add `POST /api/v1/requirements/versions/{versionId}/research`, reject client-supplied lineage and internal mode fields, and return the canonical child job envelope.
- [x] 4.4 Apply the existing JWT middleware, role checks, tenant derivation, owner scoping, admission control, operational mode and versioned error envelopes to all domain routes.
- [x] 4.5 Reuse canonical job status, cancellation, SSE and result URLs in responses without adding duplicate domain status or result resources.
- [x] 4.6 Extend API capability discovery and OpenAPI v1 with strict one-of input schemas, product strategies, `promptVersion`, idempotency, security, accepted responses and documented artifact-upload fallback for large inputs.

## 5. Security, Compatibility and Contract Tests

- [x] 5.1 Add API contract tests for inline and artifact submissions, missing or dual inputs, unknown fields, unsupported strategies, size limits and safe unavailable behavior.
- [x] 5.2 Add idempotency integration tests proving that identical inline retries create one artifact/job and changed content, options or prompt version returns conflict.
- [x] 5.3 Add authorization tests for missing/invalid JWT, insufficient role, service-account role mapping, forbidden client `tenantId`, owner isolation and cross-tenant artifact/version references.
- [x] 5.4 Add lineage tests proving that nested requirements research derives the correct source decomposition and immutable version and cannot be redirected by request data.
- [x] 5.5 Add parity tests proving domain-created jobs use the same queue, lifecycle, partial/failure outcomes, admission policies and result contracts as canonical `/api/v1/jobs` submissions.
- [x] 5.6 Add a regression test proving domain routes never invoke legacy synchronous handlers and do not change existing direct `/api/v1/jobs` clients.
- [x] 5.7 Verify ordinary logs, events, status, result and future-adapter DTOs contain no full prompt, rendered input, credential or protected diagnostic content.

## 6. MCP-Ready Adapter Boundary

- [x] 6.1 Document the future MCP tool mapping for `decompose_requirements`, `research_requirements`, `start_research`, `get_task_status` and `get_task_result`, including asynchronous return values and canonical job references.
- [x] 6.2 Define the protocol-neutral auth-context and error/result DTO boundary an MCP adapter must provide without adding an MCP SDK or advertising tools in this delivery.
- [x] 6.3 Add a non-HTTP adapter harness test that invokes the shared application and query services and proves it receives the same job identity, tenant scope and result semantics as REST.
- [x] 6.4 Document that MCP start tools must return after job acceptance and must not execute prompts, access repositories or wait for LLM completion directly.
- [x] 6.5 After the REST API and adapter boundary are accepted, create and strictly validate the linked OpenSpec change `add-requirements-mcp-server` for the actual MCP server, tools, transport authentication, deployment and end-to-end qualification; do not mark this change implementation-complete or ready to archive until that follow-up exists.

## 7. Rollout, Qualification and Documentation

- [x] 7.1 Add feature/configuration controls for additive domain-route exposure and versioned-prompt activation while keeping canonical jobs available during rollback.
- [x] 7.2 Add deployment qualification that verifies every API/worker image contains required active and retained bundle versions and rejects activation when worker output contracts are incompatible.
- [x] 7.3 Run mock-provider end-to-end tests for decomposition, standalone research and linked requirements research through the new domain endpoints, including status and result retrieval.
- [x] 7.4 Compare initial bundle rendering and structured outputs with legacy-builder fixtures, record the baseline hashes, and investigate any non-intentional behavior difference before activation.
- [x] 7.5 Update configuration, external integration, security, prompt-release and rollback documentation, including service-account JWT expectations and large-artifact usage.
- [x] 7.6 Document worker-first prompt rollout, active-version rollback and retention of historical bundles for retryable jobs; ensure activation changes produce the required deployment/audit evidence.
- [x] 7.7 Remove async production calls to hardcoded prompt builders after profile-bearing execution is qualified, retaining only the explicitly documented temporary path for pre-change or separately retiring legacy jobs.
- [x] 7.8 Run the complete server test suite and strict OpenSpec validation, then record readiness for implementation rollout without enabling an MCP server.

## 8. Correct Workflow Separation and Local Entrypoint

- [x] 8.1 Make `requirements-decomposition` decomposition-only and move the historical generic combined workflow to an explicitly named compatibility bundle while retaining `/api/v1/jobs` compatibility.
- [x] 8.2 Remove `withInsights` and all combined-mode selection from the `/api/v1/decompositions` application DTO, OpenAPI schema and integration documentation.
- [x] 8.3 Add regression and prompt-catalog tests proving domain decomposition and requirements-version research resolve separate profiles and that the historical generic mode remains isolated.
- [x] 8.4 Change repository-root `npm run dev` to start the current Docker Compose stack and expose the former standalone Node/Vite launcher only as `npm run dev:legacy`.
- [x] 8.5 Update local-development documentation with the current UI URL, command behavior and explicit legacy caveat.
- [x] 8.6 Run focused tests, the complete server suite, strict OpenSpec validation and a Docker/browser smoke check of the current workflow.

## 9. Documentation Contract Synchronization

- [x] 9.1 Rewrite the README capability and setup overview around the current four-stage guided workflow, Docker-first Node 22 runtime and explicitly scoped legacy provider/UI instructions.
- [x] 9.2 Update functional-parity, prompt-bundle and qualification documents for the current navigation, requirements-insights boundary, five-bundle catalog and additional-tools ownership.
- [x] 9.3 Reconcile `docs/configuration.md` with environment variables actually parsed by `loadConfig`, correcting Kafka, SSE, Temporal TLS and unsupported entries.
- [x] 9.4 Extend OpenAPI and integration documentation with capability discovery, administrative operations, system endpoint references and complete direct-API examples needed by MCP consumers.
- [x] 9.5 Add documentation contract tests that detect route/OpenAPI drift, current guided-workflow regressions, stale bundle inventory and unsupported active configuration names.
- [x] 9.6 Run documentation-focused tests, the complete server suite, frontend build and strict OpenSpec validation before starting MCP implementation.
