## Context

See `proposal.md` for motivation. The current asynchronous platform already creates `jobs.id` with `randomUUID()`, uses it for PostgreSQL ownership, Temporal execution identity, job steps and attempts, outbox/SSE ordering, artifacts, requirements-version lineage, audit, and REST reads. The frontend instead selects a job from `localStorage` and renders the application at `/`; technical metadata is an inline result disclosure.

The existing enterprise specs require tenant/owner isolation, reference-only control-plane events, safe operational logs, protected artifacts for full prompts/results, and shorter retention for raw diagnostic content. The design must preserve those constraints and keep `jobId` and `/api/v1/jobs` as the canonical technical contracts while the UI continues using the user-facing word «задача».

## Goals / Non-Goals

**Goals:**

- Establish one identity from browser URL through persistence, workflow, events and diagnostics.
- Make routing race-safe and make server state authoritative across browsers.
- Produce a useful trace for both active and terminal tasks from existing durable data plus narrowly scoped new diagnostic records.
- Keep the default trace safe and small while allowing audited privileged drill-down into retained artifacts.
- Preserve the current job API and support partial trace data for pre-migration jobs.

**Non-Goals:**

- Introducing a separate task aggregate or remapping existing UUIDs.
- Synchronizing unsaved browser drafts or adding collaborative text editing.
- Adding a conversational chat UI or inventing chat messages where the product has none.
- Replacing OpenTelemetry, production logs, or the operator dashboards with the Debug panel.
- Guaranteeing full prompts, Skill content, stack traces, or browser reconnect history when they were not captured or have expired.

## Decisions

### 1. Keep `jobId` unchanged from database through URL

The physical primary key remains `jobs.id`, and service/API mappers continue exposing it only as `jobId`. The frontend uses that returned value directly in `/tasks/{jobId}`; “tasks” is route and product vocabulary, not a second backend resource or field.

This avoids a mapping table, response alias, identifier migration, dual-key consistency bugs, and changes to Kafka partitioning or Temporal workflow identity. A separate higher-level task aggregate and a `taskId` alias were considered, but the current product history and active selection treat every decomposition/research job as a task, and related jobs already have explicit `parent_job_id` lineage.

### 2. Extend the existing job API only for diagnostics

Keep the existing `/api/v1/jobs`, `/api/v1/jobs/{jobId}`, `/result`, `/result/content`, `/events`, and `/requirements/versions` contracts unchanged. Add `/api/v1/jobs/{jobId}/trace` plus entry-detail endpoints beneath the same job resource. No `/api/v1/tasks` aliases or `taskId` response fields are introduced.

All inaccessible and nonexistent task reads use the existing not-found behavior to avoid resource enumeration. Trace/detail reads reuse task visibility checks before accessing related records.

### 3. The URL is the frontend selection source of truth

Use declarative browser routing with routes `/` and `/tasks/:jobId`. The route parameter drives loading through existing job APIs, workspace derivation, result/version hydration, and SSE lifecycle. Navigation after creation or selection happens first; the route effect then performs the load, ensuring one path owns selection state.

`localStorage` remains only for nonidentity preferences such as editor layout. Legacy `reqai.activeJob` and `reqai.viewedJob` values can be consumed once on `/` as an upgrade redirect and then removed; they never override an explicit task URL. «Новая задача» routes to `/` after the existing unsaved-edit confirmation.

Each route load gets an `AbortController` and a monotonically increasing selection token. Cleanup closes the previous SSE stream; reducers/callbacks verify the current route ID before mutating state. This prevents late fetches, reconciliations, or events from an old task replacing the new route.

The frontend server keeps API proxy behavior and serves `index.html` for valid nonasset application routes so direct deep links work in Vite and Nginx deployments.

### 4. Persist server facts and label browser observations

The trace read model is assembled in deterministic order from:

- `jobs` for summary and lifecycle timing;
- `job_steps` for step status, summary, start/end timing and outcomes;
- `job_attempts` for models, attempts, tokens, safe reason codes and timings;
- `outbox_events` for durable state transitions and SSE-source events;
- requirements versions and artifact metadata for saved intermediate/final lineage;
- a small additive `job_trace_entries` table for important phases not represented by those sources, such as instruction loading, context preparation, validation decisions, retry scheduling, and protected-detail references.

`job_trace_entries` is append-only and tenant-scoped with `job_id`, a per-job sequence, category, step key, status, timestamps, safe JSON metadata, and nullable input/output/detail artifact references. It stores no secret or raw prompt inline. Unique `(job_id, sequence)` ordering and stable entry IDs support cursor pagination. Writers record trace facts in the same transaction as the state change where possible; readers tolerate gaps and partial legacy data.

SSE event rows describe what the server committed and offered for delivery. The frontend separately keeps an in-memory ring buffer for the current tab's connection-open, disconnect, reconnect, resume-cursor, parse-error, and REST-reconciliation observations. These are rendered with a “current browser session” label and are not promised across reloads.

### 5. Large and sensitive details use protected artifacts

The base trace endpoint returns bounded safe metadata only. Entry-detail endpoints resolve references to protected artifacts for retained inputs, outputs, prompt/instruction envelopes, intermediate data, Skill manifests/selected-file digests, or redacted error stacks. Activity code records names, versions, hashes, selected sections and safe model parameters in metadata; full content is captured only when diagnostic capture policy enables it.

Regular owners receive safe metadata. `operator`, `auditor`, and `system-admin` may request policy-permitted protected content, and raw redacted stacks require `system-admin`. Every protected read is audited. A centralized redactor removes credentials, tokens, authorization headers and configured sensitive keys before artifact persistence and again before response. Expired or absent artifacts yield explicit states without breaking the timeline.

This preserves the existing rule that production logs and control-plane messages never contain prompts/results. Returning all internals in the initial trace response was rejected because it increases latency, retention exposure, and accidental disclosure.

### 6. Debug is a lazy, nonmodal-to-workflow diagnostic surface

Remove the inline technical-details disclosure and add a header-level bug-icon button whenever a task is selected. Use a right side panel on desktop and a full-width dialog on narrow screens, with focus trapping, Escape/close behavior, focus restoration, labelled controls and expandable timeline rows.

Opening the panel fetches the first trace page. Expanding an entry lazy-loads allowed details. New task SSE events trigger cursor-based refresh without clearing expanded state or scroll position. Summary fields show unavailable/not-recorded/expired explicitly. The existing result JSON download can remain as a result action or move into Debug, but it remains separate from protected trace-detail authorization.

## Risks / Trade-offs

- **[Product “task” may later mean a multi-job journey]** → Keep parent/child lineage explicit and avoid a new aggregate now; a future journey ID can be additive without changing current permanent job/task URLs.
- **[Trace writes add database volume and hot-row sequencing]** → Record coarse semantic phases rather than log lines, batch low-value observations, paginate reads, index `(tenant_id, job_id, sequence)`, and apply technical-data retention.
- **[Trace records can diverge from authoritative state]** → Treat jobs/steps/attempts/events as authoritative and additive trace entries as evidence; show missing/partial markers rather than synthesizing facts.
- **[Sensitive diagnostic content can expose user or platform data]** → Default to metadata, use protected artifacts, dual redaction, least-privilege roles, audit reads, response size limits and existing retention.
- **[Route changes expose race conditions in the monolithic workspace component]** → Centralize route-derived selection and cancellation before extracting visual components; add rapid-navigation and stale-event tests.
- **[Legacy tasks lack new trace phases]** → Backfill is not required; compose what exists and label absent fields as not recorded.

## Migration Plan

1. Deploy additive database migration and repository support for trace entries/artifact references; old code remains compatible.
2. Deploy job trace/detail endpoints, authorization, auditing and additive OpenAPI updates without changing existing job contracts.
3. Instrument workflow/activity transitions and model execution with safe trace metadata behind a diagnostic-capture configuration flag.
4. Deploy frontend routes and deep-link fallback, initially retaining a one-time legacy local-storage redirect on `/`.
5. Deploy Debug panel and remove the inline technical block after trace endpoints are available.
6. Validate direct links, multi-browser SSE, permissions, retention, pagination and compatibility in qualification tests; then enable protected diagnostic capture only in approved environments.

Rollback keeps the additive schema and existing job endpoints, disables permanent routing/diagnostic capture, and restores the previous frontend bundle. No identifier or durable job data conversion is involved.
