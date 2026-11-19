## Context

The async frontend is currently concentrated in `AsyncJobWorkspace.jsx`. It already owns durable REST submission, SSE reconciliation, reload restoration, decomposition editing, linked requirements insights, generic research results, and history. The redesign must reorganize that behavior without changing backend contracts or duplicating state into a second frontend application. See `proposal.md` for motivation and `specs/frontend-guided-workflow/spec.md` for the observable behavior contract.

The current standalone research result can contain a very large generated report. The current history is always rendered below the workspace. Mode values also drive both navigation and job submission, which makes accidental navigation coupling possible.

## Goals / Non-Goals

**Goals:**

- Derive a stable user-facing workflow stage from authoritative job/result/version state.
- Break the large UI into focused presentation components while keeping one state owner.
- Reduce initial visual complexity through secondary navigation, disclosures, drawers, and summary-first result sections.
- Preserve every existing durable API interaction and reload path.
- Make the redesigned controls testable through semantic labels and selected/expanded states.

**Non-Goals:**

- Changing the backend API, Temporal workflows, database schema, prompt contracts, or provider behavior.
- Removing standalone research modes or their historical results.
- Introducing a router, a component library, or a global state dependency.
- Redesigning generated research content itself; only its presentation changes.

## Decisions

### 1. Separate workspace selection from job mode

Introduce a small UI-level workspace state such as `requirements` or `tools`, while retaining the existing job mode as submission/restoration state. Linked `REQUIREMENTS_INSIGHTS` always resolves to the requirements workspace. Standalone modes resolve to tools only when deliberately selected or restored from an active/history job.

This prevents job-mode changes from implicitly making the legacy module a primary navigation peer. Keeping the existing mode state avoids an API migration. A full client-side router was considered but rejected because the application has a single URL and restoration is already job-driven.

### 2. Derive workflow stage instead of persisting it

The four-stage indicator will be computed from the selected job type/mode, terminal state, loaded result content, and the latest requirements version. No new local-storage key or backend field is introduced. Research remains visually optional: completed decomposition enables it, while saving a final research-derived version completes stage four.

Persisting a step number was rejected because it could drift from authoritative durable state after reload or history navigation.

### 3. Extract presentational components, keep orchestration centralized

Create focused components in the same frontend module initially: `WorkflowStepper`, `AppHeader`, `AiSettingsDisclosure`, `HistoryDrawer`, `ResearchResultTabs`, `ImprovementReview`, and localized status helpers. `AsyncJobWorkspace` remains the owner of API effects and durable state.

This is a lower-risk migration than introducing context/global state during a visual redesign. If the file remains too large after implementation, components can be moved to separate files mechanically after behavior tests pass.

### 4. Use semantic tabs and native disclosures

Research detail navigation will use an accessible tab-like button group with explicit selected state. AI settings and technical metadata will use native `details/summary` where appropriate, gaining keyboard behavior without a new dependency. Result parsing will normalize existing mode-specific payloads into overview, insights, risks, recommendations, full report, and improvement collections.

An accordion-only report was considered but rejected because users need predictable direct access to distinct result areas.

### 5. Use an overlay drawer for history

History opens as a right-side fixed drawer with backdrop, close control, filters, compact entries, scroll containment, and Escape/backdrop dismissal. Selecting a job invokes the existing `load` path and then closes the drawer. Pagination remains available inside the drawer.

A persistent desktop sidebar was rejected because it reduces the content width needed for requirement editing and does not solve mobile layout.

### 6. Keep final review actions sticky within the viewport

Improvement decisions will be rendered as comparison cards with explicit accept/reject controls. A bottom sticky action bar within the result workspace shows accepted count and the final-save action. It must not obscure content and collapses vertically on narrow screens.

The underlying save payload and immutable version lineage remain unchanged.

### 7. Localize presentation without changing domain values

Central label helpers map lifecycle, outcome, type, and mode identifiers to Russian UI text and status tones. Raw values remain available in technical details for diagnostics and tests. This isolates presentation changes from API contracts.

### 8. Name the workspace after the process and share one visual shell

Use «Подготовка требований» for the primary navigation label and page heading because the workspace transforms a business task into business, functional, and non-functional requirements. Keep «Бизнес-требования» only where that specific requirement category is meant.

Render standalone tools through the same page-header, card, settings-disclosure, control, and action styling conventions as the primary workspace. Mode-specific fields remain conditional content inside that shared visual shell; they do not define a separate legacy-looking interface.

### 9. Use one active-job status surface

Treat the disabled primary action as the single activity indicator for accepted, queued, and running jobs. Show its spinner and contextual verb there, and render a compact «Отменить» action alongside it. Do not also render the normal-running `JobStateCard` below the form.

Keep `JobStateCard` for exceptional or actionable states that need explanation beyond the primary action: retry wait, cancellation requested, cancelled, and failed. This removes redundant information while preserving cancellation and recovery feedback.

### 10. Shift visual priority to requirements after decomposition

When decomposition succeeds, replace the full stage-one form with a native disclosure summary containing a completion marker, a truncated business-context preview, and an «Изменить контекст» affordance. Expanding the disclosure restores the existing textarea, upload, AI settings, and re-decomposition controls. Keep the state derived from the authoritative result; do not persist a separate completed-form flag.

For decomposition results, omit the generic completed-result header because the stepper and visible requirement cards already communicate success. Put a responsive sticky review toolbar directly below the step-two heading. The toolbar owns «Сохранить изменения» and the optional «Провести AI-ресерч» action. Research stays disabled until an immutable reviewed version exists, preserving the existing lineage contract while avoiding a CTA hidden after long requirement columns.

### 11. Treat desktop review as a document editor

In the completed-decomposition state, replace the large workflow-card grid and separate context-summary band with a compact stage header containing «Шаг 2 из 4», the review title, a restrained progress affordance, and a disclosure for the source context. Keep the full stepper for the initial context state and research/final transitions where orientation is more valuable.

Retain the compact stage header but restore the familiar three-column editing layout beneath the review toolbar. Business, functional, and non-functional requirements remain visible simultaneously, allowing the user to understand the balance and relationship between categories without switching views. All columns continue to edit the same in-memory requirement arrays and submission payload.

Collapse each category's add form behind «Добавить требование». Keep editing explicit, but group secondary item actions in a quiet trailing control/menu so the requirement wording remains the dominant surface. Use borders for requirement items, not for every surrounding structural layer.

### 12. Make action color communicate meaning

Use indigo for the current primary action, neutral styling for secondary actions, and green only for persisted success. While there are unsaved changes, saving is the sole primary action and research remains gated. Once saved, show a compact saved-state confirmation and expose «Улучшить требования с помощью AI» as a neutral/outline optional action rather than a green CTA.

Normalize product copy through centralized labels: use «AI-исследование» for the workflow stage, «Улучшить требования с помощью AI» for the contextual action, and Russian quality-attribute language such as «Соответствие требованиям». Backend modes and payload values remain unchanged.

### 13. Keep the initial state singular

Before a decomposition job exists, the business-context form and disabled/enabled primary action already communicate what the user must do. Do not render a second empty-result card stating that decomposition has not happened. Continue to show activity in the primary action, exceptional states in `JobStateCard`, and generated requirements immediately after successful completion.

### 14. Lock linked research to authoritative active-job state

Treat both the in-flight creation request and every non-terminal linked `REQUIREMENTS_INSIGHTS` job as the same busy state for the requirements-review action. The action stays disabled with a spinner until the authoritative job reaches a terminal state, including after the POST request returns and after reload restoration. Guard the submission handler as well as the button so repeated activations cannot create parallel linked research jobs.

Map known admission errors such as `USER_ACTIVE_JOB_LIMIT` to concise Russian guidance while retaining the raw code only for technical diagnostics. The backend admission limit remains a safety net rather than the primary duplicate-submission control.

### 15. Preserve the linked-research card workspace

Keep `REQUIREMENTS_INSIGHTS` visually distinct from generic standalone research. A completed linked result opens directly on the existing horizontal category filters and responsive insight-card grid, using three columns on desktop. Category pills, applicability, summaries, native detail disclosures, related requirement/source metadata, and inline accept/reject controls stay together in each card; the sticky accepted-count and final-save bar remains below them.

Do not render the initial business-context form or the generic standalone summary/report tabs above a completed linked result. Use only a compact stage-three result heading before the cards so research content is the dominant surface.

### 16. Restore the segmented applicability meter

Use the pre-redesign `ApplicabilityBars` treatment in each linked-research card: five equal compact vertical bars, with the filled count calculated by rounding the normalized percentage to the five available segments. Filled segments are emerald, remaining segments are neutral, and the exact percentage stays visible beside them.

Expose the same value through a semantic meter so the compact visualization does not reduce accessibility. A text-only «Применимость N%» label was rejected because it removes the fast visual comparison that users relied on when scanning several research cards.

### 17. Reuse requirement-category presentation inside linked research

Extract the business, functional, and non-functional column metadata so the editable decomposition result and the read-only research-source snapshot share titles, descriptions, prefixes, counts, and blue/violet/amber top-border accents. Render source requirements as the same quiet divided document rows, but omit edit/add actions because this snapshot identifies the immutable version sent to research.

Wrap the source snapshot title and return action in the same bordered white result header used by the linked-research view. Restore the original category icon mapping on insight cards (`TrendingUp`, `Sparkles`, `AlertTriangle`, `Users`, and `BookOpen`) so scanning a result does not rely on pill color alone.

### 18. Port the legacy insight-card disclosure hierarchy

Port the proven presentation pattern from `RequirementsDecomposer.jsx` rather than enabling the entire legacy frontend. Keep `relatedTo` chips immediately below the insight summary so relationships remain visible before «Подробнее». The detail disclosure owns only the expanded research explanation and source-type metadata.

Render enhancements through a compact row modelled after the legacy `EnhancementAddRow`: a colored quick-accept control, a target label («В бизнес-требования», «В функциональные», or «В нефункциональные»), and a chevron disclosure. Expanding it shows the full proposed wording and the current explicit accept/reject decisions. Accepted and rejected states remain reversible and continue to feed the durable final-version lineage; the legacy one-way local add behavior is not restored.

If an older result lacks structured enhancements, retain the legacy defensive fallback that derives one proposal from the insight title/summary and infers a target category from the insight category. This preserves useful presentation for historical results without changing backend contracts.

### 19. Model optional research as an explicit branch

After the reviewed version is saved, expose two valid next actions: an outlined optional AI-improvement action and a primary direct-final action. Persist direct completion as a new immutable requirements version whose decisions include `skippedResearch: true`; derive stage four from the newest version rather than from transient component state. When this branch is active, keep stage three neutral and label it «Пропущено» so the progress indicator does not claim research was completed.

The direct final editor may still start linked research later from its current immutable version. This keeps skipping reversible without weakening the save-before-research lineage rule.

### 20. Share a persistent requirement layout preference

Place one accessible segmented «Столбцы / Строки» control immediately above category content in both the review and final editors. Column mode uses the simultaneous desktop three-column layout; row mode stacks complete category sections. Store only this presentation preference in local storage under a frontend-specific key, while requirement content and workflow state continue to come from durable APIs.

### 21. Treat every saved final version as editable

Render a saved research-assisted or direct final version through the same manual category editor used for reviewed requirements. Saving produces a new immutable revision based on the currently visible final version and carries forward its decisions. For research-assisted finals, backend validation accepts a base version from either the immutable research input or a previous version produced by the same research job, while retaining the original research enhancement keys.

### 22. Extend the durable job stream to workflow mutations

Use the existing per-job outbox stream as the single realtime transport. Creating a requirements version increments the source job sequence and inserts `requirements.version-created` in the same database transaction as the version row. Creating linked research inserts `linked-research.created` against the parent job in the same transaction as child acceptance. Both events contain reference-only identifiers; clients re-read authoritative REST resources rather than accepting requirement content from SSE payloads.

Keep one SSE subscription for the currently viewed job even after it becomes terminal. Track its cursor inside the subscription across reconnects, reject events whose `jobId` does not match the viewed job, and reconcile job state when the stream reconnects. A linked-research event switches the workspace to the returned child job; a version event reloads requirements versions.

Remote version refresh is safe only when the editor matches its last persisted input. Editors report dirty state to the workspace. If a remote version arrives while dirty, retain local content and show a «Доступна новая сохранённая версия» notice with an explicit reload action; otherwise apply the newest version immediately.

### 23. Separate starting over from deleting history

Expose «Новая задача» in the persistent header whenever the requirements workspace is showing a terminal job. The action removes the active/viewed selection keys, clears the current job, result, versions, remote-version notice, file, and business-context draft, and returns the workspace to decomposition stage one. It does not call a delete API and does not remove the completed job from the history drawer.

Do not offer this action as a way to abandon an active job: while a job is non-terminal, cancellation remains the explicit lifecycle action and server admission rules continue to prevent accidental parallel work.

## Risks / Trade-offs

- **[Risk]** One state owner with more presentation components can still leave `AsyncJobWorkspace.jsx` large. → **Mitigation:** extract pure components first and keep API mutations centralized; split files only after regression tests stabilize.
- **[Risk]** Generated result shapes vary by research mode. → **Mitigation:** use defensive normalization and always retain a full-report fallback rather than hiding unknown content.
- **[Risk]** Sticky and fixed elements can overlap on small screens. → **Mitigation:** test desktop and narrow viewports, include safe padding, and stack sticky actions vertically below the mobile breakpoint.
- **[Risk]** Hiding advanced controls could make expert operation harder. → **Mitigation:** keep settings one disclosure away, show the active model summary, and preserve all existing values.
- **[Risk]** History drawer state may interfere with job restoration. → **Mitigation:** keep drawer visibility presentation-only and route selection through the existing authoritative `load` function.
- **[Risk]** Three requirement columns can become dense when formulations are long. → **Mitigation:** keep typography readable, use quiet dividers, collapse add composers, and preserve the contextual item-action menu.
- **[Risk]** Contextual item actions can be less obvious than persistent buttons. → **Mitigation:** keep a labelled keyboard-focusable menu trigger for every item and expose actions on focus as well as pointer interaction.
- **[Risk]** A fast job-creation response can re-enable the linked-research action while the durable workflow is still active. → **Mitigation:** derive the lock from both local request state and authoritative non-terminal linked-job state, and cover repeated activation plus reload restoration in regression tests.
- **[Risk]** A shared generic result shell can accidentally replace the established linked-research card workflow. → **Mitigation:** branch explicitly on `REQUIREMENTS_INSIGHTS` before generic result normalization and assert filters, three-column semantics, inline decisions, and absence of the context form in regression tests.
- **[Risk]** A skipped optional stage can look completed when progress reaches 100%. → **Mitigation:** derive an explicit skipped-stage set from persisted decisions and render its label and tone separately from completed stages.
- **[Risk]** A local layout preference can become confused with durable workflow state. → **Mitigation:** persist only the `columns`/`rows` presentation value locally; continue deriving requirements, decisions, and stage state from saved versions.
- **[Risk]** A remote save can overwrite another client's in-progress local edit. → **Mitigation:** separate remote-version availability from editor replacement and require an explicit reload while dirty.
- **[Risk]** Appending workflow events after job completion can collide with lifecycle sequences. → **Mitigation:** lock and increment the source job sequence in the same transaction that writes each mutation event.

## Migration Plan

1. Add localized helpers, workspace/stage derivation, and presentational components behind the existing component entry point.
2. Replace the primary navigation and input/settings composition without changing submission functions.
3. Replace result and improvement presentation while preserving save callbacks and payloads.
4. Move history rendering into the drawer and preserve pagination/load behavior.
5. Expand frontend tests for navigation, stages, settings, result sections, history filtering, decisions, reload, and localized statuses.
6. Run lint, unit tests, production build, rebuild the frontend Compose service, and verify desktop and narrow layouts in the browser.

Rollback is a branch switch back to `main` or a revert of the redesign commit; no database or API rollback is required.
