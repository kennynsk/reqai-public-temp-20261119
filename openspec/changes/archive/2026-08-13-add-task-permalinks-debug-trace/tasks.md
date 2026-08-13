## 1. Existing Job Identity and Trace Storage

- [x] 1.1 Verify and contract-test that existing job creation, idempotent replay, persistence, lineage, events, and SSE consistently use the generated UUID `jobId` without adding another identifier.
- [x] 1.2 Add an additive tenant-scoped migration for append-only `job_trace_entries`, stable per-job sequencing, safe metadata, optional protected artifact references, indexes, foreign keys, and retention eligibility.
- [x] 1.3 Extend database role grants and row-level isolation for trace entries and add migration contract tests covering upgrade, uniqueness, referential integrity, and tenant separation.
- [x] 1.4 Implement trace-entry repository writes and cursor reads with deterministic ordering, bounded limits, partial legacy-data tolerance, and explicit missing/expired detail states.

## 2. Existing Job API and Diagnostic Extension

- [x] 2.1 Reuse existing job UUID validation, tenant/owner authorization, serializers, lineage, and error behavior for diagnostic handlers.
- [x] 2.2 Preserve existing job creation, list, detail, result, result-content, requirements-version, cancellation, artifact, and SSE routes without introducing `/api/v1/tasks` aliases.
- [x] 2.3 Update the OpenAPI document and contract tests for additive job trace/detail routes, UUID validation, authorization, bounded pagination, and not-found anti-enumeration behavior.

## 3. Diagnostic Trace Backend

- [x] 3.1 Implement a trace query service that composes jobs, workflow steps, model attempts, outbox events, requirements versions, artifact metadata, and additive trace entries into one ordered paginated contract.
- [x] 3.2 Add `/api/v1/jobs/{jobId}/trace` and entry-detail endpoints with owner/tenant visibility, diagnostic-role gates, bounded responses, and protected-read auditing.
- [x] 3.3 Extend safe redaction to diagnostic persistence and responses, explicitly removing secrets, tokens, authorization headers, credentials, and configured sensitive keys.
- [x] 3.4 Add diagnostic-capture configuration and protected artifact handling for retained prompts/instructions, intermediate input/output, Skill metadata/content references, provider details, and redacted error stacks.
- [x] 3.5 Instrument task acceptance, workflow initialization and transitions, context preparation, validation, persistence, completion, cancellation, and retry decisions with coarse semantic trace entries.
- [x] 3.6 Instrument model execution with requested/actual model, safe parameters, attempt number, tokens, correlation/provider IDs, duration, failure classification, fallback, and retry delay metadata.
- [x] 3.7 Record Skill name/version, selected files or instruction identifiers, hashes and applied sections when a Skill runtime is used, and record an explicit not-applicable state for workflows without one.
- [x] 3.8 Add backend tests for active and terminal traces, pagination, deterministic ordering, fallback/retry sequences, legacy missing fields, expired artifacts, redaction, role matrices, auditing, and cross-tenant denial.

## 4. Canonical Frontend Routing

- [x] 4.1 Add browser routing for `/` and `/tasks/:jobId` and configure Vite/Nginx deep-link fallback without intercepting API or asset paths.
- [x] 4.2 Refactor workspace selection so the route parameter exclusively drives task loading, result/version hydration, workspace mode, and task-scoped SSE subscription.
- [x] 4.3 Navigate to the canonical task URL after creation, history selection, parent/child selection, and linked-research events; navigate to `/` for «Новая задача» after the existing unsaved-edit guard.
- [x] 4.4 Remove local storage as an identity source, retain nonidentity preferences, and implement a one-time legacy selection redirect that never overrides an explicit task URL.
- [x] 4.5 Add abort controllers and route-selection guards so browser back/forward, rapid selection, stale fetches, reconciliation callbacks, and old SSE events cannot mutate another routed task.
- [x] 4.6 Keep the enterprise API client and SSE helper on existing job endpoints, add trace/detail calls, expose connection observations, resume the same job cursor, and retain server reconciliation as the source of truth.
- [x] 4.7 Add frontend tests for creation navigation, direct/reload restoration without local storage, conflicting legacy selection, history and linked-child routes, new-task navigation, missing/inaccessible routes, back/forward races, and two-client SSE semantics.

## 5. Debug User Experience

- [x] 5.1 Add a task-header Debug button with a bug icon and remove the inline «Техническая информация» disclosure from the primary result flow.
- [x] 5.2 Build the responsive Debug side panel/full-width dialog with task summary, status and timings, accessible focus management, Escape/close behavior, and focus restoration.
- [x] 5.3 Build the ordered expandable timeline with category/status presentation, duration formatting, pagination, empty/not-recorded/expired states, and lazy entry-detail loading.
- [x] 5.4 Present workflow transitions, steps, model attempts, Skill/instruction metadata, artifact references, retries, errors, final result, and durable server events without exposing protected values in collapsed rows.
- [x] 5.5 Maintain a bounded current-tab SSE observation buffer and label connection, disconnect, reconnect, cursor resume, parse failure, and REST reconciliation entries as client-local.
- [x] 5.6 Reconcile new trace entries while Debug is open without resetting expanded rows or scroll position, and preserve a separately authorized result JSON download action.
- [x] 5.7 Add component and accessibility tests for keyboard operation, focus trap/restoration, narrow viewport behavior, lazy details, pagination, redacted/denied content, live updates, and absence of the old inline block.

## 6. End-to-End Verification and Documentation

- [x] 6.1 Add an integration scenario covering creation → existing `jobId` → `/tasks/{jobId}` → second authorized client → shared persisted state → ordered real-time synchronization.
- [x] 6.2 Add qualification coverage for direct deep links after frontend restart, unchanged job APIs, linked research routing, SSE resume, trace pagination, retention, redaction, audit, and role/tenant isolation.
- [x] 6.3 Update local development, API/event compatibility, configuration, security, retention, and diagnostic-operation documentation, including which Debug fields are unavailable when capture is disabled.
- [x] 6.4 Run server and client test suites, strict OpenSpec validation, OpenAPI contract validation, lint/build checks, and the focused multi-client qualification scenario; record any environment-dependent checks.

## Verification record

- 2026-08-13: server suite passed (107 tests); client suite passed (29 tests); client lint and production build passed.
- 2026-08-13: strict OpenSpec validation and OpenAPI JSON/contract tests passed.
- 2026-08-13: local Compose migration/build completed and `npm run qualify:task-routing` passed with two SSE clients for job `1806abac-c53e-4424-b51e-544a387645b8`.
