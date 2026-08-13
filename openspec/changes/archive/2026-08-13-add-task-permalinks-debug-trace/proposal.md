## Why

The durable backend already assigns every workflow job a UUID, but the frontend keeps the selected job only in browser-local storage and always renders at `/`. As a result, a task cannot be shared, bookmarked, or reliably restored from its URL, and the small technical-details block does not provide enough structured evidence to diagnose a workflow failure.

## What Changes

- Keep the existing durable `jobId` UUID as the only identifier and use it directly in the permanent user-facing task URL.
- Add canonical frontend routes at `/tasks/{jobId}` and make creation, history selection, linked workflow navigation, reload, browser back/forward, and direct navigation resolve through that route.
- Keep the existing `/api/v1/jobs/*` state, result, requirements-version, artifact, cancellation, and SSE contracts; add diagnostics under the same job resource instead of creating task-oriented API aliases.
- Continue keying persistence, SSE subscriptions, workflow relationships, version history, technical trace retrieval, and any persisted conversation/message history by `jobId`.
- Replace the inline «Техническая информация» block with an accessible Debug control and a responsive modal or side panel.
- Provide a chronological, expandable task trace assembled from durable task/job state, workflow steps, model attempts, state events, SSE delivery/reconnect observations, artifacts, retries, errors, and the final result.
- Show sensitive prompts, adapted Skill inputs, raw intermediate content, and stack traces only when they were explicitly captured into protected diagnostic artifacts and the caller has the required diagnostic role; otherwise show safe metadata, references, redaction markers, or “not recorded”. Secrets and credentials are never returned.
- Treat a nonexistent or inaccessible task URL as a stable not-found/access-denied state without silently falling back to a different locally remembered task.
- Do not add a new conversational chat UI in this change; the application currently has no task chat surface. The existing `jobId` will remain the required foreign key for any message history that exists or is introduced separately.

## Capabilities

### New Capabilities

- `task-permalinks`: Durable URL routing, restoration, navigation, and real-time synchronization using the existing canonical `jobId`.
- `task-debug-trace`: Authorized collection, retrieval, redaction, and timeline presentation of task execution diagnostics.

### Modified Capabilities

- `frontend-guided-workflow`: Move technical metadata out of the primary workflow, make history and linked-stage selection update the canonical task URL, and provide a nonintrusive Debug entry point.

## Impact

- Frontend routing and state orchestration in `client/src/App.jsx`, `client/src/AsyncJobWorkspace.jsx`, and the enterprise API client, plus focused routing/debug UI tests and dev-server history fallback configuration.
- Versioned REST/OpenAPI contracts for job trace retrieval, UUID validation, authorization, and error responses; existing job creation/read/result/event contracts remain canonical.
- PostgreSQL queries and possibly additive diagnostic tables/artifact references for step timing, trace events, and protected payloads keyed by the existing `jobs.id` UUID.
- Workflow activities, model-attempt recording, event/outbox payloads, SSE delivery, reconnect telemetry, retention, safe logging, auditing, and tenant/owner isolation.
- No identifier or API-resource migration is required.
