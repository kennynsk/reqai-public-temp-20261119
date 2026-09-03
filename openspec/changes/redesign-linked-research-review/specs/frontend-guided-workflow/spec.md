## MODIFIED Requirements

### Requirement: Familiar linked-research result cards
Completed `REQUIREMENTS_INSIGHTS` research SHALL open directly on a filterable insight-review workspace instead of the standalone tabbed report shell. On desktop the workspace SHALL present a compact result selector beside one detail pane for the selected insight. The selector SHALL expose a recognizable category icon and label, the exact applicability percentage and the title of each visible insight. The detail pane SHALL expose the selected title and summary across the available reading width, the exact applicability percentage as a model estimate, complete research detail, requirement relationships, source types, available evidence and every proposed requirement with explicit review actions. Long Russian content SHALL wrap by words without clipping, per-character wrapping or a narrow metadata column that leaves avoidable unused space. The sticky final-save action and decision-lineage payload SHALL remain intact.

#### Scenario: Applicability is readable visually and numerically

- **WHEN** a completed linked-research insight has an applicability score
- **THEN** the selector and selected detail expose its exact percentage
- **AND** the selected-detail label identifies the value as applicability rather than a verified probability
- **AND** the numeric value remains available to assistive technology

#### Scenario: Linked AI research result opens

- **WHEN** a completed `REQUIREMENTS_INSIGHTS` job is selected or finishes
- **THEN** the stage-one context form is not rendered above the result
- **AND** the user immediately sees category filters followed by the result selector and the first visible insight's detail

#### Scenario: User reviews linked-research cards on desktop

- **WHEN** the linked-research result is displayed at the desktop breakpoint
- **THEN** a compact selector appears to the left of one selected-insight detail pane
- **AND** selecting another result updates only the detail pane without navigation or loss of proposal decisions

#### Scenario: User filters the selected result out

- **WHEN** the active category filter makes the selected insight unavailable
- **THEN** the first visible result becomes selected and its complete detail is displayed
- **AND** an empty filtered result shows an explicit empty state instead of stale detail

#### Scenario: Insight preserves its requirement relationships

- **WHEN** a linked-research insight references existing requirements through `relatedTo`
- **THEN** their identifiers remain visible in the selected detail beside a relationship icon
- **AND** the insight's complete `detail` and source types remain visible in the same detail pane without a nested «Подробнее» disclosure

#### Scenario: User reviews a compact enhancement

- **WHEN** an insight contains one or more enhancements
- **THEN** the selected detail labels each item «Предлагаемое требование» and shows its target type, affected identifiers and full wording
- **AND** explicit accept and reject actions continue to use the existing exact-change review and reversible decision flow
- **AND** accepting or rejecting the enhancement updates the existing decision lineage and final requirements payload

#### Scenario: User inspects the requirements sent to research

- **WHEN** the user opens the source requirements from a completed linked-research result
- **THEN** business, functional, and non-functional requirements use the same category-colored presentation as the primary review editor
- **AND** each category shows its description, item count, and quiet divided requirement rows
- **AND** a consistent header action returns to the research-review workspace without losing selection or decisions

#### Scenario: User reviews linked research on a narrow viewport

- **WHEN** the workspace is displayed at 390 CSS pixels wide or at 200 percent zoom
- **THEN** the selector is presented above the selected detail without horizontal page overflow
- **AND** the selected insight, proposal actions, evidence disclosure and sticky save action remain reachable in logical reading order

## ADDED Requirements

### Requirement: Complete selected-insight presentation
The selected-insight detail SHALL preserve every user-relevant field supplied by the existing research contract: `category`, `title`, `summary`, `detail`, `applicability`, `source_types`, `relatedTo`, optional `rationale`, optional `citations`, and all valid `enhancements`. Source-type categories SHALL remain distinguishable from citations, missing optional evidence SHALL be stated honestly, and technical insight IDs SHALL remain internal unless required for diagnostics.

#### Scenario: Insight contains the complete current payload

- **WHEN** the selected insight supplies detail, relationships, source types, rationale, citations and multiple enhancements
- **THEN** every supplied value is findable in the selected detail or its clearly labelled evidence disclosure
- **AND** no enhancement is dropped because another enhancement from the same insight is already visible or decided

#### Scenario: Historical insight omits optional fields

- **WHEN** a historical insight lacks detail, rationale, citations, source types or relationships
- **THEN** the available title, summary, applicability and enhancements remain reviewable
- **AND** the interface does not invent missing evidence or render empty metadata containers

#### Scenario: Insight category is unknown

- **WHEN** an insight has a category that is not in the current category map
- **THEN** it remains selectable with a neutral fallback label and icon
- **AND** category filtering and detail review do not fail

### Requirement: Contextual requirement preview
Requirement identifiers shown in `relatedTo` and `enhancements.targetIds` SHALL open an in-context, non-navigating preview instead of changing the workflow section. The preview SHALL resolve the identifier against the immutable requirements snapshot used by the research and SHALL show the record type, identifier, exact wording, quality, human-readable source information and its relationships when those values exist. Opening or closing a preview MUST NOT change filters, selected insight, proposal drafts or decisions.

#### Scenario: User previews a related requirement on desktop

- **WHEN** the user activates a resolvable requirement identifier in selected-insight detail
- **THEN** an anchored non-modal preview opens near the identifier without changing route or workflow view
- **AND** it shows the requirement type, identifier, exact wording, quality, source and relationships available in the research input snapshot

#### Scenario: User previews an affected requirement on a narrow viewport

- **WHEN** the user activates an enhancement target at 390 CSS pixels wide or at 200 percent zoom
- **THEN** the same preview content opens as a readable bottom sheet within the current research view
- **AND** underlying review state remains unchanged

#### Scenario: User switches previewed requirements

- **WHEN** one preview is open and the user activates another requirement identifier
- **THEN** the existing preview updates to the newly selected requirement without stacking another overlay

#### Scenario: User closes a requirement preview with the keyboard

- **WHEN** the preview is open and the user presses Escape or activates its close action
- **THEN** the preview closes and focus returns to the identifier that opened it
- **AND** each identifier exposes its expanded state and popup relationship to assistive technology

#### Scenario: Referenced record is unavailable

- **WHEN** a historical insight references an identifier absent from its available requirements snapshot
- **THEN** activation shows a compact unavailable-record message containing the identifier
- **AND** the UI does not navigate, crash or substitute a similarly named current requirement
