## Context

See [proposal.md](./proposal.md) for motivation and [the delta spec](./specs/frontend-guided-workflow/spec.md) for observable behavior.

`AsyncJobWorkspace.jsx` currently has separate legacy and BABOK renderers for `REQUIREMENTS_INSIGHTS`. Both render the same three-column card pattern but use different requirement containers and enhancement normalization. Category metadata, `ResearchEvidence`, `ProposalReview`, decision keys, source/context views and final-save behavior already exist and must remain authoritative. Relationship IDs currently reuse `RecordLinks`, whose navigation callback changes the workflow to the source-requirements view.

The research payload already contains the information approved in the prototype. The frontend receives insight fields through `value.insights` and receives the immutable research input through `value.baseRequirements` or `value.baseRegistry`; no network lookup or contract extension is needed.

## Goals / Non-Goals

**Goals:**

- Give legacy and BABOK linked research one consistent split-view presentation while retaining their existing proposal assembly and save paths.
- Make selection and filtering deterministic and preserve all current user-relevant insight fields.
- Resolve relation previews exclusively from the immutable research input snapshot.
- Keep the detail hierarchy compact: category and applicability share the metadata row, while title and summary receive the full readable width.
- Meet keyboard, narrow-screen, long-copy and historical-payload acceptance scenarios without introducing another UI library.

**Non-Goals:**

- Changing the research prompt, normalization, persistence, SSE events, requirements-version API or decision-lineage schema.
- Replacing `ResearchEvidence`, `ProposalReview`, the source/context snapshots or the final requirements editor.
- Editing requirement content from the preview, navigating from the preview, or resolving a missing historical ID against a newer version.
- Redesigning unrelated workflow stages, navigation, filters or the sticky progress/final-save controls.

## Decisions

### 1. Share a research-review presentation model across legacy and BABOK renderers

Introduce a small view-model boundary used by both result renderers. It maps each raw insight to the presentation fields required by the split view and receives mode-specific enhancement normalization and save callbacks from the existing renderer. The shared layer owns filtering, selected insight, layout, field presentation and requirement preview; it does not own proposal application or final-registry assembly.

This avoids implementing the new interaction twice while preserving `displayEnhancementsForInsight`, `displayBabokEnhancementsForInsight`, `finalRequirements`, `finalBabokRegistry` and the existing decision keys. Keeping two independent layouts was rejected because their current duplication has already produced drift and would make accessibility and historical-payload behavior harder to keep consistent.

### 2. Keep filter and selection state explicit and deterministic

Store `activeFilter` and `selectedInsightId` independently. The selected ID initially points to the first visible insight. When a filter excludes it, select the first item in the filtered result; when no result remains, render an empty detail state. Returning to a filter MAY restore no hidden detail: the current visible selection remains the source of truth.

Selection changes only the detail pane. Proposal decisions stay keyed by the existing stable enhancement key, so changing insight, filter or breakpoint cannot reset or duplicate decisions. Index-based selection was rejected because filtering and reordered historical results would point to the wrong insight.

### 3. Use a bounded selector and flexible detail pane

At the desktop breakpoint, use a two-column workspace with a selector approximately 280–320 CSS pixels wide and a flexible detail pane. The selector rows show the current category icon from `INSIGHT_CATEGORY_META`, category label, exact percentage and a two-line title. The active row has one selected-state treatment and remains visible when the user changes selection.

Below the desktop breakpoint, stack the selector above the detail. Bound the selector height so twelve results do not push the selected insight out of reach; the selector may scroll internally while the page retains its normal vertical flow. Do not introduce horizontal page scrolling.

The previous three-column card grid was rejected because repeated headers and nested disclosures consume space without supporting direct comparison. A single full-width accordion was rejected because opening a result moves surrounding content and makes scanning twelve results unstable.

### 4. Give title and summary the full reading column

Place category and the compact `N% · применимость` label in one top metadata row. Render title and summary below it in a single flow with no percentage side column. Use normal word wrapping, a readable maximum measure near 70–75 characters for prose, and `overflow-wrap` only for genuinely unbroken tokens. Do not use `break-all`, per-character wrapping or fixed title heights.

The complete `detail`, visible relation IDs and source types follow the summary. `ResearchEvidence` remains a clearly labelled disclosure because citations and verification controls are supporting material. Each enhancement follows as «Предлагаемое требование» with target type, affected IDs, full wording and the existing review actions.

### 5. Build requirement previews from the immutable input snapshot

Create a requirement index once per research result:

- BABOK: flatten the allowed requirement groups and any supported analytical records from `value.baseRegistry`, retaining each record's type.
- Legacy: flatten the category arrays from `value.baseRequirements`, retaining the user-facing category label.

Do not use `latestVersion` as the primary preview source because it can contain accepted research additions or later edits that were not part of the research input. Resolve material names through the snapshot's material metadata when available, display a human-readable locator, and do not expose raw artifact UUIDs. If the immutable snapshot or referenced ID is unavailable, return a typed unavailable state instead of searching newer data.

### 6. Use a single non-modal preview surface

Replace `RecordLinks` only within the insight-detail relationship and enhancement-target contexts with preview buttons. Other uses of `RecordLinks` retain navigation behavior. The preview is rendered outside the split pane's clipped/scrolling containers and is positioned from the active trigger.

On desktop it is an anchored, opaque popover. On narrow screens and at equivalent zoom-induced widths it uses the same content in a fixed bottom sheet. Opening another ID updates the same surface rather than stacking overlays. The trigger exposes popup and expanded state; opening announces the labelled preview, Escape and the close action dismiss it, and dismissal restores focus to the opening trigger. An outside pointer press may dismiss the non-modal surface without changing review state.

A modal was rejected because viewing a relation is a supporting task that does not require protected focus. Continuing to navigate to the source view was rejected because it discards the user's visual research context and creates unnecessary back-and-forth.

### 7. Preserve current data and decision components

`ResearchEvidence` remains responsible for honest applicability copy, rationale, citations and verification metadata. `ProposalReview` remains responsible for exact wording, add/replace choice, structured fields, warnings, reversible decisions and the review dialog. The split-view layer renders every enhancement returned by the existing display helper and passes the same keys and decision values through unchanged.

Unknown categories use a neutral icon/label fallback but remain visible under «Все результаты». Missing optional fields remove only their corresponding empty section. No source category is presented as a citation, and no missing value is fabricated.

### 8. Verify behavior at component and rendered-layout levels

Extend component tests for both result modes to cover selector changes, filter reselection, empty results, full field coverage, multiple enhancements, unknown categories, historical sparse payloads, requirement lookup and unavailable targets. Test that preview actions do not call source-view navigation, that popup state is accessible, that Escape restores focus and that proposal/save callbacks retain their existing payloads.

Perform rendered acceptance at the incumbent desktop width, 390 CSS pixels and 200 percent zoom with real long Russian content. Verify no horizontal page overflow, title/summary wrapping, selector reachability, popover-to-bottom-sheet adaptation, sticky save visibility and both light/dark color-scheme behavior supported by the existing application.

## Risks / Trade-offs

- **[Risk]** A shared presentation layer could accidentally merge legacy and BABOK domain behavior. → Keep normalization, final assembly and save callbacks outside the shared layer; test both payload families independently.
- **[Risk]** Internal selector scrolling may hide results or create a nested-scroll trap. → Use it only below the desktop breakpoint, cap height conservatively, keep keyboard focus scrolling the active row into view and preserve page scrolling for the detail.
- **[Risk]** Anchored previews can be clipped or positioned off-screen. → Render the surface outside overflow containers, clamp it to viewport edges and switch to the bottom-sheet layout at narrow effective widths.
- **[Risk]** A target ID may refer to a record not retained in an old snapshot. → Show the exact ID with an unavailable message; never resolve it against mutable current data.
- **[Risk]** Showing more insight fields at once can make the detail pane dense. → Keep evidence progressively disclosed, omit absent metadata and use spacing/typography hierarchy rather than additional nested cards.
- **[Trade-off]** Replacing the five-segment applicability meter with the compact exact percentage reduces decorative comparability but frees title width and makes the estimate's meaning more explicit.

## Migration Plan

1. Add the shared view model, selector/detail components and snapshot index helpers behind the existing `REQUIREMENTS_INSIGHTS` render branch.
2. Migrate the BABOK result renderer while retaining its source/context/final branches and save assembly; run focused regression tests.
3. Migrate the legacy renderer through the same presentation layer and run its compatibility tests.
4. Add the preview surface and replace relation navigation only inside selected-insight details.
5. Add responsive styles and rendered acceptance checks, then run the complete frontend test/lint/build suite and strict OpenSpec validation.

Rollback is a frontend-only revert to the existing card render blocks. No data migration, contract rollback or stored-result rewrite is required.
