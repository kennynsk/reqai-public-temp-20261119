## ADDED Requirements

### Requirement: BABOK registry review surface

After a successful BABOK decomposition, the frontend SHALL present the
structured registry as the dominant review surface. The review SHALL provide
access to `BR`, `SR`, `FR`, `NFR`, `TR` and `CON` records, and SHALL expose
`GAP`, `HYP`, `TERM`, traceability and clarification questions in separate
reviewable sections.

#### Scenario: User opens a completed BABOK decomposition

- **WHEN** a completed result uses the BABOK decomposition schema
- **THEN** the requirements stage shows registry counts and grouped records,
  while gaps, hypotheses, terms, traceability and questions remain discoverable
  without being mixed into confirmed requirements

#### Scenario: User opens a legacy decomposition

- **WHEN** a completed result uses the legacy three-category schema
- **THEN** the existing legacy requirements editor remains available and the
  BABOK-only panels are not shown for missing data

### Requirement: BABOK evidence and analysis details

The frontend SHALL show each requirement's source, provenance, quality and
related identifiers when those fields are present. GAP, HYP and TERM records
SHALL show their affected records and next-step information, and clarification
questions SHALL show priority and intended addressee when provided.

#### Scenario: User inspects a requirement's evidence

- **WHEN** the user expands a BABOK requirement record
- **THEN** its wording, source citation, provenance, quality and traceability
  references are visible without editing the underlying source artifact

#### Scenario: User reviews an unresolved gap

- **WHEN** the result contains a GAP linked to requirements or questions
- **THEN** the gap is presented as unresolved analysis context and is not
  displayed as a confirmed requirement

## MODIFIED Requirements

### Requirement: Requirements-focused review stage

After a successful decomposition, the frontend SHALL make the generated BABOK
registry and its review context the dominant content. The completed
business-context form SHALL collapse into a compact summary that can be
expanded for editing or re-decomposition, and redundant completed-job
presentation SHALL not separate the context summary from the registry review.

The requirements review SHALL expose a sticky responsive action area near its
heading. It SHALL offer saving reviewed changes, SHALL expose «Улучшить
требования с помощью AI» as an explicitly optional action, and SHALL offer a
clear direct transition to the final version after a reviewed registry version
has been saved. These actions SHALL not be placed only after the final registry
section.

#### Scenario: User enters requirements review

- **WHEN** decomposition completes successfully with a BABOK result
- **THEN** the full context textarea, upload control, AI settings, and
  decomposition action are collapsed into a compact completed-context summary
  and the registry review heading is visible immediately below it

#### Scenario: User needs to change context

- **WHEN** the user expands the completed-context summary
- **THEN** the original context, file control, AI settings, and re-decomposition
  action become available without losing the current registry review state

#### Scenario: User reviews generated requirements

- **WHEN** editable BABOK requirement records are displayed
- **THEN** save and optional-research actions are grouped near the review heading
  and remain reachable while scrolling

#### Scenario: Reviewed version has not been saved

- **WHEN** the current BABOK registry does not yet have a persisted reviewed
  version
- **THEN** both the AI-research and direct-final actions are disabled and
  explain that the reviewed version must be saved first

#### Scenario: Reviewed version is ready to finish

- **WHEN** a reviewed BABOK version is persisted and no edits are pending
- **THEN** the user can either start optional AI research or proceed directly to
  the final version

### Requirement: Familiar linked-research result cards

Completed `REQUIREMENTS_INSIGHTS` research SHALL open directly on the familiar
filterable insight-card view instead of the standalone tabbed report shell. On
desktop it SHALL show three parallel card columns. Every card SHALL expose a
recognizable category icon and label, applicability as the familiar
five-segment bar scale together with its exact percentage, title, summary,
expandable detail, and any proposed requirement with explicit accept/reject
actions. The applicability control SHALL expose its numeric value to assistive
technology. The sticky final-save action and decision-lineage payload SHALL
remain intact for BABOK requirement target types.

#### Scenario: Applicability is readable visually and numerically

- **WHEN** a completed linked-research insight has an applicability score
- **THEN** its card shows five compact bar segments filled proportionally to the
  score
- **AND** the exact percentage remains visible and available as the accessible
  meter value

#### Scenario: Linked AI research result opens

- **WHEN** a completed `REQUIREMENTS_INSIGHTS` job is selected or finishes
- **THEN** the stage-one context form is not rendered above the result and the
  user immediately sees category filters followed by the insight-card grid

#### Scenario: User reviews linked-research cards on desktop

- **WHEN** the linked-research result is displayed at the desktop breakpoint
- **THEN** insight cards appear in three columns and each proposed enhancement
  can be accepted or rejected within its source insight card

#### Scenario: Insight preserves its requirement relationships

- **WHEN** a linked-research insight references existing requirements through
  `relatedTo`
- **THEN** the referenced `BR`, `SR`, `FR`, `NFR`, `TR` or `CON` identifiers
  remain visible on the collapsed card beside a relationship icon
- **AND** opening «Подробнее» reveals the insight detail and source types
  without moving the relationship identifiers

#### Scenario: User reviews a compact enhancement

- **WHEN** an insight proposes an enhancement
- **THEN** the collapsed enhancement row states the BABOK target type
- **AND** expanding the row reveals the full wording with explicit accept and
  reject actions
- **AND** accepting or rejecting the enhancement updates the existing decision
  lineage and final BABOK requirements payload

#### Scenario: User inspects the requirements sent to research

- **WHEN** the user opens the source requirements from a completed
  linked-research result
- **THEN** the BABOK requirement registry uses the same type-aware presentation
  as the primary review editor and analysis context remains separately
  accessible
- **AND** a consistent header action returns to the research-result cards
  without losing decisions

### Requirement: Focused desktop requirements editor

On desktop, the requirements review SHALL prioritize reading and editing the
BABOK registry while retaining the compact persistent four-stage progress
indicator and access to the source context.

The editor SHALL let the user filter or select the six requirement types
`BR`, `SR`, `FR`, `NFR`, `TR` and `CON` without presenting analysis records as
requirements. Each selected type SHALL show its title, description, item count,
records and add-requirement control. GAP, HYP, TERM, traceability and questions
SHALL be available in dedicated read-oriented panels. The selected registry
view SHALL remain responsive and keyboard accessible.

#### Scenario: User begins reviewing a decomposition

- **WHEN** a completed BABOK decomposition is displayed on a desktop viewport
- **THEN** the user sees the persistent stage-two progress indicator, direct
  access to the source context, and the type-aware registry as the dominant
  visible content

#### Scenario: User reviews decomposed categories

- **WHEN** the desktop BABOK requirements editor is displayed
- **THEN** the user can inspect and edit every confirmed requirement type and
  the current type's records remain individually addressable by stable ID

#### Scenario: User switches to stacked rows

- **WHEN** the user selects «Строки» in the requirements editor
- **THEN** the six requirement types are stacked in one column, the selection is
  exposed as pressed, and the same choice is restored in subsequent requirement
  editors

#### Scenario: User switches registry type

- **WHEN** the user selects a different BABOK requirement type
- **THEN** the corresponding records and item count are shown without changing
  the saved source result or hiding unsaved edits in another type

#### Scenario: User adds a requirement

- **WHEN** the user activates «Добавить требование» for a selected type
- **THEN** the composer opens for that type, generates a valid type-specific ID
  on save, and can be dismissed without modifying requirements
