## Context

See `proposal.md` for motivation. Today one React workspace owns both the guided requirements journey and five standalone modes. The same legacy modes are accepted by generic job validation, exposed by a standalone domain route, dispatched through shared research workflow branches, backed by separate prompt profiles, and surfaced as `start_research` in MCP. Job rows store the mode as durable historical metadata, so execution removal must not make canonical reads unable to serialize old records.

The repository also has active completed OpenSpec changes for the requirements integration API and MCP server that have not yet been synced into main specs. This change therefore defines the desired reduced contracts explicitly while modifying the existing main frontend capability.

## Goals / Non-Goals

**Goals:**

- Make decomposition plus optional requirements-linked AI research the only creation path across every enabled adapter.
- Remove legacy UI, orchestration, prompt, configuration, test, and documentation branches once active legacy work is drained.
- Keep canonical read paths stable for retained historical jobs without retaining legacy execution capability.
- Make rollout and rollback safe despite the breaking API and MCP surface change.

**Non-Goals:**

- Deleting or rewriting persisted legacy jobs, artifacts, audit events, traces, or requirements versions.
- Renaming the canonical `RESEARCH` job type; `REQUIREMENTS_INSIGHTS` remains a research job.
- Replacing the durable job, SSE, artifact, result, or requirements-version architecture.
- Redesigning the guided decomposition, insight review, or final-version experience beyond removing legacy branches.

## Decisions

### 1. Remove creation capability end-to-end, retain generic reads

Admission is removed at every creation boundary: UI, domain REST, generic job validation, MCP, and any adapter capability discovery. Generic list/status/result/event/artifact/trace paths continue to deserialize and return historical mode strings.

This separates execution support from data readability. Deleting historical rows or narrowing read schemas to current modes would break saved permalinks, audits, and retained results. Keeping legacy creation hidden behind the generic `/jobs` endpoint was rejected because it would preserve an undocumented bypass and keep all workflow code operational.

### 2. Use an explicit allowlist for new modes

Creation validation and service-level authorization use one supported-mode policy containing only `DECOMPOSITION` and `REQUIREMENTS_INSIGHTS`, with the latter accepted only through server-derived requirements-version lineage. Public discovery and OpenAPI are generated or checked against the same policy.

A denylist of the six known retired modes was rejected because newly introduced internal modes could accidentally become public. Read DTOs remain deliberately more permissive than create DTOs so historical records continue to work.

### 3. Remove the standalone domain operation instead of aliasing it

`POST /api/v1/research` and the `standalone-research` discovery capability are removed. Requirements research remains `POST /api/v1/requirements/versions/{versionId}/research`, which guarantees immutable input and lineage.

Redirecting standalone input into requirements insights was rejected because free-form research context has no eligible requirements version or parent decomposition and would silently change semantics.

### 4. Publish a reduced MCP contract

The MCP server unregisters `start_research`, removes its schema and REST operation, and updates backend compatibility checks to require only decomposition and requirements research. Status and result tools remain mode-agnostic reads. The tool-schema or gateway contract version is advanced so clients can detect the breaking surface change.

Keeping a deprecated tool that always errors was rejected because discovery would continue to advertise unsupported capability. Translating it to `research_requirements` was rejected because the required immutable `versionId` cannot be derived safely from standalone input.

### 5. Split rollout into admission drain and execution cleanup

The first deploy disables all legacy admission while workers and prompt bundles can still finish already accepted jobs. A qualification gate inventories non-terminal jobs in retired modes. Only after the inventory reaches zero does the cleanup deploy remove workflow branches, activities used only by them, prompt profiles/bundles, environment policy, fixtures, and qualification paths.

This is preferred over removing workers and admission in one deploy because a queued or running legacy job could otherwise remain permanently non-terminal. Because cancellation is part of the drain path, the existing cancellation request must be proven to reach the workflow engine and transition the job to `CANCELLED` before cleanup is allowed.

### 6. Render historical legacy jobs through a generic read-only view

The frontend history continues to include retained research jobs. Selecting a retired mode opens a compact read-only state/result view with safe metadata, authorized diagnostics, and artifact download. It does not retain mode-specific forms, comparison controls, prompt inputs, or rich standalone result tabs.

Removing legacy history entries was rejected because it would make durable jobs appear lost. Keeping every legacy result renderer was rejected because it would retain much of the frontend maintenance burden the change is intended to remove.

### 7. Remove only assets exclusively owned by retired modes

Shared model execution, research helpers, result persistence, cancellation, retries for supported modes, and requirements-insights rendering remain. Before deleting an activity, prompt template, configuration key, or test fixture, implementation must show that `DECOMPOSITION` and `REQUIREMENTS_INSIGHTS` do not reference it.

Broadly deleting all research code was rejected because linked requirements research uses the `RESEARCH` workflow family and shared durable infrastructure.

## Risks / Trade-offs

- [External REST or MCP clients still use standalone research] → Treat the change as breaking, update discovery/schema versions and release notes, and monitor rejected calls during the admission-drain phase.
- [A legacy job remains active when execution code is removed] → Gate cleanup on an authoritative non-terminal legacy-job inventory and verified workflow cancellation propagation.
- [Read DTO validation rejects a historical mode] → Separate creation enums from historical read representation and add retained-job contract fixtures.
- [Shared research code is removed accidentally] → Build a mode-to-workflow/activity/prompt dependency inventory and run decomposition plus requirements-insights end-to-end qualification before deletion.
- [Rollback image expects removed prompt configuration] → Retain the previous image and its configuration secret set through the rollback window; do not delete operational secrets until rollback expires.
- [History becomes confusing when a legacy result has no rich renderer] → Label it as an archived legacy result and provide status, timestamps, summary when available, diagnostics authorization, and artifact download.

## Migration Plan

1. Inventory all UI, REST, generic job, MCP, workflow, activity, prompt, configuration, test, script, and documentation references to retired modes; classify shared dependencies before deletion.
2. Ship admission blocking and contract changes: remove the UI launcher, standalone API route/discovery, generic creation acceptance, and MCP tool; keep legacy workers and prompt assets temporarily available.
3. Verify cancellation propagation end-to-end, then wait for or cancel all non-terminal legacy jobs. Record a zero-active-legacy-jobs qualification result.
4. Remove mode-specific workflow branches, exclusive activities/result renderers, prompt profiles/bundles, environment settings, fixtures, and obsolete documentation.
5. Run unit, contract, OpenAPI, MCP, prompt qualification, and end-to-end tests for decomposition, linked requirements research, historical reads, rejection of retired modes, cancellation, and permalink restoration.
6. Deploy cleanup and monitor unsupported-mode rejections, MCP compatibility failures, stuck jobs, and read errors for historical mode values.

Rollback uses the previous application and worker images together with the retained legacy prompt/configuration set. Database rollback is unnecessary because this change does not migrate or delete persisted job data.
