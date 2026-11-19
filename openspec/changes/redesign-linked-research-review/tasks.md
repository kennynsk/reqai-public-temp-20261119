## 1. Shared research-review model

- [x] 1.1 Add focused fixtures for complete, multi-enhancement, unknown-category, sparse historical and missing-target research payloads in both legacy and BABOK shapes.
- [x] 1.2 Extract shared insight presentation helpers that preserve category, title, summary, detail, applicability, source types, relationships, evidence fields and stable enhancement keys.
- [x] 1.3 Build immutable requirement-index helpers for `baseRequirements` and `baseRegistry`, including type labels, exact wording, quality, human-readable source metadata and relationships without exposing artifact UUIDs.
- [x] 1.4 Add unit coverage proving snapshot indexes do not substitute records from `latestVersion` and return an explicit unavailable state for missing IDs.

## 2. Split-view research workspace

- [x] 2.1 Add the shared result selector and selected-insight detail components while keeping legacy/BABOK normalization and final assembly outside the presentation layer.
- [x] 2.2 Implement stable `activeFilter` and `selectedInsightId` behavior, including first-visible initialization, reselection after filtering and an explicit empty filtered state.
- [x] 2.3 Render category icons, labels and exact applicability percentages in the selector with a neutral fallback for unknown categories.
- [x] 2.4 Render the selected category/applicability metadata row, full-width title and summary, complete detail, visible relationships and source types without a nested «Подробнее» disclosure.
- [x] 2.5 Render `ResearchEvidence` through its existing disclosure and render every enhancement as «Предлагаемое требование» with target type, affected IDs, full wording and existing `ProposalReview` actions.
- [x] 2.6 Migrate both `BabokRequirementsInsightsResult` and `RequirementsInsightsResult` to the shared workspace without changing source/context/final views, sticky save behavior or decision keys.

## 3. Contextual requirement preview

- [x] 3.1 Add preview-only requirement ID controls for selected-insight `relatedTo` and enhancement targets without changing navigation behavior of `RecordLinks` elsewhere.
- [x] 3.2 Implement one anchored non-modal desktop preview showing type, ID, exact wording, quality, human-readable source and relationships from the immutable research snapshot.
- [x] 3.3 Add missing-record content, single-surface switching between IDs, outside-pointer dismissal, close action and Escape dismissal with focus restoration.
- [x] 3.4 Expose popup/expanded state and labelled preview semantics to assistive technology and verify opening or closing does not change filters, selection, drafts or decisions.
- [x] 3.5 Adapt the preview to a readable bottom sheet at narrow effective widths without stacking overlays or navigating away from AI-исследование.

## 4. Responsive layout and typography

- [x] 4.1 Implement the bounded 280–320 px desktop selector and flexible detail pane with one selected-state treatment and no clipped content.
- [x] 4.2 Stack a height-bounded selector above detail on narrow screens, keep the active item reachable and prevent horizontal page overflow.
- [x] 4.3 Give title and summary the full reading column, keep prose near a 70–75 character measure and prevent per-character wrapping for long Russian text and unbroken tokens.
- [x] 4.4 Preserve usable category filters, proposal/evidence controls and sticky final-save actions at 390 CSS pixels and 200 percent zoom.

## 5. Regression coverage and acceptance

- [x] 5.1 Extend component tests for selector changes, filter reselection, empty results, complete/sparse fields, multiple enhancements and unknown categories in both payload families.
- [x] 5.2 Add interaction tests for requirement preview lookup, missing targets, switching, no-navigation behavior, accessible state, Escape and focus restoration.
- [x] 5.3 Retain regression coverage for exact-change review, accept/reject reversal, saved decision lineage, source/context return and final-save payloads after the layout migration.
- [x] 5.4 Run the focused frontend test files, then the complete frontend test, lint and production-build commands; resolve only failures attributable to this change.
- [x] 5.5 Verify the real room-booking research result visually at the incumbent desktop width, 390 CSS pixels and 200 percent zoom, including long title wrapping, selector reachability, popover/bottom-sheet placement and absence of horizontal overflow.
- [x] 5.6 Run `openspec validate redesign-linked-research-review --strict` and reconcile any spec/task drift before implementation handoff.
