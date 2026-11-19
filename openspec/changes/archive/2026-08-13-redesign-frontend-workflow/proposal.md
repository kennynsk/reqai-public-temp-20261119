## Why

ReqAI now supports the intended business-context → decomposition → optional AI research → final requirements journey, but the frontend still presents it as a collection of similarly weighted tools. The redesign should make the primary journey self-explanatory, reduce long-page cognitive load, and keep advanced and legacy capabilities available without allowing them to distract from the core workflow.

## What Changes

- Add a persistent four-step workflow indicator for business context, reviewed requirements, optional AI research, and final version.
- Let users finish directly from reviewed requirements without running optional AI research, and show the skipped research stage explicitly instead of marking it complete.
- Make «Подготовка требований» the primary workspace, reserving «Бизнес-требования» for the corresponding requirement type, and move the standalone legacy research module under secondary «Дополнительные инструменты» navigation.
- Apply the primary workspace's color system, typography, cards, spacing, AI-settings disclosure, action states, and responsive behavior consistently across every standalone tool.
- Collapse model, temperature, and other expert controls under an «Настройки AI» disclosure with recommended defaults.
- Replace the long research-result page with a concise summary-first experience and sections for insights, risks, recommendations, and the full report.
- Retain the familiar linked requirements-research result layout: category filters, category icons, a three-column desktop insight-card grid, the five-segment applicability scale with its exact percentage, expandable detail, inline accept/reject decisions, and a sticky final-save bar, without showing the stage-one context form above it.
- Make the read-only source-requirements view inside a linked research result reuse the primary three-column requirement styling, including category-colored top borders, category descriptions, counts, quiet divided rows, and a consistent result/source navigation header.
- Restore the original linked-insight card hierarchy: show `relatedTo` requirement IDs directly on the card, keep research detail and sources under «Подробнее», and present each enhancement as a compact target-category row whose wording and accept/reject actions expand on demand.
- Present proposed requirement improvements as accept/reject comparisons and keep the selected-count/final-save action visible while scrolling.
- Move job history into a compact, filterable side drawer instead of occupying the bottom of every workspace.
- Replace raw lifecycle and mode identifiers with one localized user-facing status while retaining technical details in an optional disclosure.
- Avoid duplicate active-job messaging: keep the spinner and active label in the primary action, place cancellation beside it, and reserve a separate state card for exceptional states.
- Prevent duplicate linked AI-research jobs by keeping the research action locked for the complete authoritative active-job lifetime and by presenting admission-limit failures in clear Russian user-facing language.
- After decomposition, collapse the completed context form into a compact editable summary, remove redundant completed-result chrome, and place save plus optional-research actions beside the requirements review rather than below all requirement cards.
- Keep the desktop requirements-review stage focused by compressing completed workflow chrome while restoring the familiar simultaneous three-column view for business, functional, and non-functional requirements.
- Let users switch requirement categories between parallel columns and stacked rows, persist that display preference locally, and reuse it in the final editor.
- Make the saved final version a full manual editor after either the direct or research-assisted path, with durable revision lineage and an option to add AI research later after a direct finish.
- Keep every client viewing the same workflow synchronized in real time for job lifecycle, linked-research creation, and requirements-version changes, with ordered replay after temporary disconnects and conflict-safe handling of local unsaved edits.
- Provide an explicit «Новая задача» action from a completed workflow so users can return to a clean business-context form without deleting the completed result or its history.
- Establish one primary action per state, present optional AI improvement as a secondary action after saving, and reserve green for successful statuses rather than calls to action.
- Reduce repeated card borders and always-visible controls by using quieter section hierarchy, contextual item actions, and collapsed add-requirement composers.
- Remove the redundant pre-decomposition empty-result card so the initial screen contains only the business-context task and its primary action.
- Standardize user-facing Russian terminology across the primary workspace and standalone tools while keeping technical identifiers in technical details.
- Preserve durable job submission, reload recovery, cancellation, requirements version lineage, artifact download, and the standalone legacy research capabilities.
- Improve keyboard/accessible-state handling for the new navigation, drawer, tabs, disclosures, and review controls. The follow-up editor refinement targets the planned desktop usage; the already-safe narrow layout remains supported but is not redesigned further.

## Capabilities

### New Capabilities

- `frontend-guided-workflow`: Covers the guided four-step requirements journey, secondary tool navigation, progressive disclosure, summary-first research results, decision review, compact history, localized status presentation, responsiveness, and accessibility.

### Modified Capabilities

None. There are no synchronized main specifications yet; this change introduces the first dedicated frontend workflow capability.

## Impact

- Primary implementation: `client/src/AsyncJobWorkspace.jsx`, supporting frontend components/styles, and frontend regression tests.
- Existing `/api/v1` request shapes, durable workflows, and job modes remain unchanged. Requirements-version validation is extended so manual final revisions can be chained from the saved final version while preserving research lineage.
- No new runtime dependency is expected; the design will reuse React, Lucide icons, Tailwind utilities, and the existing enterprise API client.
- Docker frontend image will be rebuilt and the result will be verified in the local Compose environment and in the in-app browser.
