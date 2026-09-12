## Context

See proposal.md for scope and motivation. Runtime ownership: `BabokRegistryResult` in `client/src/AsyncJobWorkspace.jsx` owns selection, registry and review state. `BabokRequirementCard` and `BabokAddRequirementForm` use `useDraftField` through `ReviewDraftProvider`. `ResearchInsightWorkspace.jsx` provides the visual exemplar: filter buttons, 17.5–20rem selector, 16px gap, white panels, slate borders, indigo selection. The prototype demonstrates composition only; existing action priorities and validated data remain authoritative.

Earlier completed but unarchived changes (`simplify-requirements-review-screen`, `redesign-linked-research-review`, `add-requirement-ai-discussion`) already affect runtime. This delta supersedes the earlier stacked BABOK stage-two composition; do not apply that older visual delta after this one. Their draft, status, discussion and final-editor contracts continue to apply.

## Goals / Non-Goals

**Goals:** isolate presentation from mutations; preserve draft ownership and current callbacks; integrate selection into navigation and validation; allow easy review and rollback via a dedicated branch.

**Non-Goals:** new registry state model, backend migrations, persistence of UI search, changes to final/read-only/legacy editors, deployment or merging.

## Decisions

1. Add `RequirementListWorkspace.jsx` as a controlled presentation component. Parent supplies records/groups, filters, selected ID and render slots for details and composers. Reuse the visual values from research without refactoring research itself. A combined research/requirement domain component would widen the change unnecessarily.
2. Gate integration by the existing `compact` condition in `BabokRegistryResult`. Keep the old noncompact branch and legacy `DecompositionResult` intact. A global replacement would affect finalization and snapshots that were not reviewed in the prototype.
3. Keep drafts in `useReviewState`/`ReviewDraftProvider`. Render only the selected detail with a stable record key; field drafts survive unmounting through the existing provider. Keep per-type composers available within the workspace, driven by existing `RequirementComposerMenu`; do not create a second draft system. Show a draft indication in selector entries when appropriate. Keep the current card as the edit/source/clarification implementation and add a focused visual variant rather than duplicating its business logic.
4. Parent owns search and selected ID, alongside type/clarification state, because navigation, add, delete and validation must reveal records. Selection fallback is derived from filtered records; an explicit reveal clears search and clarification, selects the target type/record and focuses after rendering. Initial record targets use the same visibility logic. Analysis links retain their current destination behavior.
5. Preserve header, review tabs, export, completeness, save guards and discussion wiring. Adapt prototype styling to those contracts; its demo header priorities, synthetic evidence and inactive tabs are not implementation requirements.
6. Use real buttons with `aria-pressed` for selector and filters, labelled search, visible focus and meaningful empty states. Bound the desktop selector to min(42rem, 65vh) with internal scrolling and a sticky heading. At <1024px stack the selector above detail and reduce its bound to min(18rem, 36vh), matching the research pattern. Avoid a new sticky overlay. Preserve full wording in detail even when list excerpts clamp to two lines.

## Risks / Trade-offs

- Unmounting cards could lose unfinished edits → provider-backed draft regression tests covering text, structured fields, links and save while hidden; retain global dirty state.
- Validation targets could be absent from DOM → select/reveal the invalid record before scheduling field focus; test no save request on invalid hidden drafts.
- Add composer could become unreachable for an empty/filter-hidden type → independent add menu and visible selected composer, reset restrictive filters on creation.
- Parent contains multiple result formats → integrate only in compact BABOK branch and run existing legacy/final/read-only tests.
- Showing only one detail removes simultaneous reading of full records → searchable compact overview and one full editor follow the approved prototype; final review keeps its existing presentation.
- Branch separation alone does not isolate a running local dev server → do not deploy, merge or restart the shared application stack; verify through tests and an isolated fixture preview.

## Migration Plan

Base branch: `codex/integrate-babok-requirements-skill`. Implementation branch: `codex/requirements-list-detail`, created before changes to product code. No schema or data migration. Run focused regressions, full client tests/lint/build and OpenSpec strict validation. Keep implementation and specs in reviewable commits. Existing branch remains at its original commit; rollback is returning to that branch after preserving any additional local edits. No force-reset or deletion of user work.
