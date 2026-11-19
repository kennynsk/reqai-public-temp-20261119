## 1. Inventory and retirement gates

- [x] 1.1 Build and record a mode-to-UI/API/MCP/workflow/activity/prompt/config/test/documentation dependency inventory for `DECOMPOSITION_WITH_INSIGHTS`, `STANDARD_RESEARCH`, `AGENT_RESEARCH`, `MODEL_COMPARE`, `AGENT_COMPARE`, and `PROMPT_TEST`, marking every dependency shared with `DECOMPOSITION` or `REQUIREMENTS_INSIGHTS`.
- [x] 1.2 Add an operational qualification query or script that reports non-terminal jobs in retired modes and fails cleanup qualification unless the count is zero.
- [x] 1.3 Correct cancellation propagation so a persisted `CANCEL_REQUESTED` event reaches the workflow engine and the workflow transitions authoritatively to `CANCELLED`.
- [x] 1.4 Add server and workflow tests proving cancellation dispatch, idempotent repeated cancellation, and terminal reconciliation for running legacy and supported jobs.

## 2. Stop legacy admission in the API

- [x] 2.1 Introduce a single explicit creation-mode allowlist for `DECOMPOSITION` and `REQUIREMENTS_INSIGHTS`, separate from the mode representation used by historical read DTOs.
- [x] 2.2 Restrict generic `POST /api/v1/jobs` validation and service policy so all retired modes are rejected before artifact persistence, workflow dispatch, or provider work.
- [x] 2.3 Remove `POST /api/v1/research` and the standalone-research application-service operation while preserving decomposition and requirements-version research routes.
- [x] 2.4 Remove `standalone-research` and retired creation modes from API capability discovery while keeping historical list/status/result responses serializable.
- [x] 2.5 Reject retry, reset, clone, or equivalent new execution attempts for retained jobs whose mode is retired, without affecting read access or cancellation during the drain phase.
- [x] 2.6 Update the OpenAPI v1 document to remove standalone submission and retired creation enums while retaining compatible historical status/result schemas.
- [x] 2.7 Add API unit and contract tests for the two supported submission paths, rejection of every retired mode/route, capability discovery, historical reads, and legacy retry rejection.

## 3. Remove the standalone frontend surface

- [x] 3.1 Remove «Дополнительные инструменты», the tools workspace state, and all standalone mode selection controls from the primary navigation.
- [x] 3.2 Remove standalone research, model comparison, agent comparison, and prompt-testing input state, submission payload construction, forms, and action labels.
- [x] 3.3 Remove mode-specific standalone result tabs and renderers that are not used by decomposition or `REQUIREMENTS_INSIGHTS`.
- [x] 3.4 Add a generic read-only archived-result presentation for retained legacy permalinks and history entries with localized status, timestamps, safe summary/metadata, authorized Debug access, and artifact download.
- [x] 3.5 Preserve history filters, task permalinks, SSE reconciliation, cancellation, reviewed-version lineage, direct-final flow, and linked insight-card review for supported jobs.
- [x] 3.6 Replace frontend tests for standalone launchers with tests proving the launcher is absent, retired modes cannot submit, supported guided flow remains intact, and retained legacy results open read-only without retry controls.

## 4. Reduce the MCP contract

- [x] 4.1 Remove the `start_research` input schema, tool definition, operation mapping, and backend REST client method.
- [x] 4.2 Update MCP backend authentication/readiness compatibility checks to require only `decomposition` and `requirements-research` domain operations.
- [x] 4.3 Advance the MCP tool-schema or gateway contract version and ensure discovery advertises exactly `decompose_requirements`, `research_requirements`, `get_task_status`, and `get_task_result`.
- [x] 4.4 Keep status/result output validation compatible with retained legacy mode values without exposing any mutation that restarts those modes.
- [x] 4.5 Update MCP schema, protocol, REST client, authentication, redaction, and backend E2E tests for the reduced tool surface and retained legacy reads.

## 5. Drain and remove legacy execution code

- [x] 5.1 Deploy or exercise the admission-blocking phase while legacy-compatible workers remain available, then capture qualification evidence that no non-terminal retired-mode job remains.
- [x] 5.2 Remove retired mode branches from research/decomposition workflow selection while preserving the complete `REQUIREMENTS_INSIGHTS` path and shared durable lifecycle behavior.
- [x] 5.3 Remove activities, handlers, output parsing, comparison assembly, and provider paths proven by the inventory to be exclusive to retired modes.
- [x] 5.4 Remove standalone/agent/comparison/combined prompt profile mappings, bundles, manifests, output contracts, qualification fixtures, and catalog inventory entries that are not used by supported jobs.
- [x] 5.5 Remove legacy-only environment variables and configuration policy while ensuring API and worker readiness succeeds with only decomposition and requirements-insights prompt releases.
- [x] 5.6 Update workflow, activity, prompt catalog, prompt rendering, configuration, and qualification tests to cover only supported execution plus historical read compatibility.

## 6. Documentation and release qualification

- [x] 6.1 Update functional parity and product workflow documentation to describe only business context, decomposition, optional AI research, and final requirements.
- [x] 6.2 Update requirements integration API, OpenAPI guidance, MCP adapter/qualification, configuration, prompt-bundle, local development, and operations/runbook documentation to remove retired operations and settings.
- [x] 6.3 Document the breaking REST and MCP changes, historical read-only compatibility window, two-phase drain requirement, and rollback dependency on the previous image/configuration set.
- [x] 6.4 Update documentation and source qualification scripts so stale mentions of «Дополнительные инструменты», standalone modes, `POST /api/v1/research`, or `start_research` fail unless explicitly labelled as historical migration context.
- [x] 6.5 Run client, server, MCP, OpenAPI, prompt, documentation, and end-to-end qualification for decomposition, linked AI research, cancellation, historical permalinks/results, and rejection of retired modes.
- [x] 6.6 Review the final diff against the dependency inventory and confirm no supported decomposition, requirements-insights, requirements-version lineage, canonical read, or observability path was removed.
