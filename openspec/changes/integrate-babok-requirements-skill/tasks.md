## 1. Skill bundle and output contract

- [x] 1.1 Add a repository-local, versioned BABOK skill bundle containing `SKILL.md`, mandatory references and manifest metadata without changing the external CLI skill source.
- [x] 1.2 Implement bundle loading and qualification so required variables, file hashes, release policy and `babok-requirements.v1` are checked at startup.
- [x] 1.3 Define the BABOK JSON output contract for summary, context, `BR/SR/FR/NFR/TR/CON`, `GAP/HYP/TERM`, traceability, delta and questions.
- [x] 1.4 Implement structural, enum, identifier and referential-integrity validation for the BABOK output contract, including controlled invalid-output errors.
- [x] 1.5 Add deterministic rendering from a validated BABOK registry to the application report view and downloadable report representation.

## 2. Materials and durable job execution

- [x] 2.1 Extend decomposition input validation and idempotency hashing to support one primary artifact plus optional baseline and reference artifacts.
- [x] 2.2 Persist authorized material descriptors and the selected BABOK profile in the job configuration snapshot and audit metadata.
- [x] 2.3 Update extraction activities to preserve source citations and section evidence while using the released BABOK application adapter.
- [x] 2.4 Add a global consolidation activity that merges section artifacts, assigns globally unique IDs, removes semantic duplicates and builds traceability across the whole job.
- [x] 2.5 Make consolidation validate baseline deltas, unavailable references, GAP/HYP/TERM records and partial execution scope before persisting the result.
- [x] 2.6 Keep legacy decomposition execution and result readers available, and dispatch result handling by the recorded output schema version.

## 3. Requirements versions and linked research

- [x] 3.1 Extend requirements-version normalization and persistence to store the complete BABOK registry, analysis context, material lineage, provenance and quality fields.
- [x] 3.2 Preserve immutable base-version links and manual decision metadata for BABOK review and subsequent revisions.
- [x] 3.3 Validate linked research inputs against a saved BABOK version and expose the complete BABOK identifier set to research activities.
- [x] 3.4 Adapt the requirements-insights contract and normalization to preserve BABOK `relatedTo` identifiers and enhancement target types while retaining legacy research compatibility.

## 4. Frontend BABOK review workflow

- [x] 4.1 Add schema-aware result parsing that keeps the existing legacy editor for old results and routes BABOK results to the new registry review surface.
- [x] 4.2 Implement type-aware BABOK requirement navigation for `BR/SR/FR/NFR/TR/CON`, including counts, stable IDs, editing, deletion and add-record validation.
- [x] 4.3 Add read-oriented panels for `GAP/HYP/TERM`, source/provenance/quality details, traceability and clarification questions.
- [x] 4.4 Extend review-version save, reload, URL restoration, remote-version reconciliation and final-version editing to preserve the complete BABOK registry.
- [x] 4.5 Update linked-research cards and enhancement decision controls for BABOK target types without losing decision lineage.
- [x] 4.6 Preserve the four-stage guided workflow, responsive behavior, accessibility semantics and legacy result rendering during the frontend migration.

## 5. Verification and rollout

- [x] 5.1 Add server contract tests for complete, partial, insufficient-context, missing-baseline, unavailable-reference, duplicate-ID and broken-traceability cases.
- [x] 5.2 Add workflow tests for multi-chunk global consolidation, partial execution, profile snapshotting, rollback and legacy result access.
- [x] 5.3 Add requirements-version and linked-research tests covering BABOK lineage, manual revisions, target types and legacy compatibility.
- [x] 5.4 Add frontend tests for registry navigation, evidence panels, GAP/questions presentation, editing, reload and research decisions.
- [x] 5.5 Add representative golden fixtures from the BABOK skill and run prompt qualification, token/latency measurement and large-artifact checks.
- [x] 5.6 Release the new prompt profile behind the existing qualification/canary process, document rollback and retain the legacy profile through its job and artifact retention window.

## 6. Runtime reliability for structured model output

- [x] 6.1 Snapshot per-model output token budgets with each job and pass the selected budget through model policy to every provider adapter, defaulting BABOK execution to 32,000 output tokens.
- [x] 6.2 Add a single separately traced BABOK repair pass for deterministic JSON/contract violations and stop automatic Temporal retries of already-received invalid model output.
- [x] 6.3 Preserve machine-readable contract failure reasons in checkpoints, job status and trace while keeping raw prompts/outputs behind protected diagnostics.
- [x] 6.4 Make model-attempt persistence distinguish repeated activity executions and repair passes instead of overwriting attempts with the same provider-level attempt number.
- [x] 6.5 Add provider, model-executor, workflow and API/UI tests for output budgets, repair bounds, non-retryable contract failures, attempt lineage and safe error presentation.
- [x] 6.6 Run the failed-job regression scenario and qualification checks after the final CTX contract alignment, verify no hidden full-call retries, and document the operational limits and rollback behavior.
