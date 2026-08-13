# frontend-guided-workflow Specification

## Purpose

Provide a clear, accessible, and reload-safe frontend journey from business context through reviewed and research-enriched requirements while keeping advanced tools available without competing with the primary workflow.

## Requirements

### Requirement: Persistent guided workflow
The frontend SHALL present the business-requirements journey as four ordered stages: business context, requirements, optional AI research, and final version. The indicator SHALL distinguish completed, current, available, optional, and unavailable stages without implying that AI research is mandatory.

#### Scenario: New user starts with business context
- **WHEN** no decomposition or saved requirements are selected
- **THEN** the business-context stage is current, later stages are visibly unavailable or pending, and no separate empty decomposition-result card is shown below the input form

#### Scenario: Reviewed requirements are available
- **WHEN** a completed decomposition with editable requirements is selected
- **THEN** the requirements stage is current and the optional AI-research action is available

#### Scenario: Final requirements are saved
- **WHEN** a final requirements version is saved from research improvements
- **THEN** the final-version stage is marked complete and the saved result remains visible after reload

#### Scenario: User skips optional AI research
- **WHEN** a reviewed requirements version is saved and the user proceeds directly to the final version
- **THEN** the final-version stage becomes current at 100 percent, the AI-research stage is labelled as skipped rather than completed, and the direct-final decision remains visible after reload

### Requirement: Primary and secondary navigation
The frontend SHALL make «Подготовка требований» the default primary workspace. The name SHALL describe the end-to-end process and SHALL NOT use «Бизнес-требования», which is reserved for one decomposed requirement type. The standalone legacy research modes SHALL remain available under a secondary «Дополнительные инструменты» entry and SHALL NOT be activated by linked requirements research.

#### Scenario: User opens the application
- **WHEN** the application loads without a persisted active standalone research job
- **THEN** the requirements-preparation workspace is selected and the standalone research modes are not shown as an equal primary destination

#### Scenario: User deliberately opens an advanced tool
- **WHEN** the user selects a standalone research mode from «Дополнительные инструменты»
- **THEN** that mode opens with its existing inputs and durable job behavior intact

### Requirement: Unified visual system for standalone tools
Every standalone mode under «Дополнительные инструменты» SHALL use the same color palette, page hierarchy, typography, content width, cards, spacing, AI-settings disclosure, action treatment, responsive breakpoints, and focus states as «Подготовка требований». Mode-specific inputs SHALL remain available without reintroducing the legacy visual hierarchy.

#### Scenario: User opens a standalone tool
- **WHEN** the user selects any mode under «Дополнительные инструменты»
- **THEN** the page uses the same heading pattern, indigo accents, bordered white cards, control styling, and action hierarchy as the primary workspace

#### Scenario: Standalone tool is opened on a narrow viewport
- **WHEN** a standalone tool is displayed below the desktop breakpoint
- **THEN** its cards and actions stack consistently with the primary workspace and do not cause horizontal overflow

### Requirement: Progressive disclosure of AI settings
The frontend SHALL keep recommended model and generation settings out of the primary action path and SHALL expose them through an explicitly labelled AI-settings disclosure.

#### Scenario: User accepts defaults
- **WHEN** the user submits a valid business context without opening AI settings
- **THEN** the durable job is created with the configured recommended defaults

#### Scenario: Expert changes settings
- **WHEN** the user expands AI settings and changes supported values
- **THEN** the selected values are used for the next eligible job and remain visibly reviewable before submission

### Requirement: Summary-first research presentation
The frontend SHALL render completed standalone research with a concise overview before detailed material and SHALL separate insights, risks, recommendations, and the full report into navigable sections. Detailed content SHALL remain available without forcing the user to scroll through it before reviewing improvements.

#### Scenario: Standalone research result opens
- **WHEN** a completed standalone research result is selected
- **THEN** the overview is the initial section and the improvement-review action is discoverable without traversing the full report

#### Scenario: User requests full detail
- **WHEN** the user selects the full-report section
- **THEN** the persisted complete report is rendered without changing or re-running the research job

### Requirement: Familiar linked-research result cards
Completed `REQUIREMENTS_INSIGHTS` research SHALL open directly on the familiar filterable insight-card view instead of the standalone tabbed report shell. On desktop it SHALL show three parallel card columns. Every card SHALL expose a recognizable category icon and label, applicability as the familiar five-segment bar scale together with its exact percentage, title, summary, expandable detail, and any proposed requirement with explicit accept/reject actions. The applicability control SHALL expose its numeric value to assistive technology. The sticky final-save action and decision-lineage payload SHALL remain intact.

#### Scenario: Applicability is readable visually and numerically

- **WHEN** a completed linked-research insight has an applicability score
- **THEN** its card shows five compact bar segments filled proportionally to the score
- **AND** the exact percentage remains visible and available as the accessible meter value

#### Scenario: Linked AI research result opens
- **WHEN** a completed `REQUIREMENTS_INSIGHTS` job is selected or finishes
- **THEN** the stage-one context form is not rendered above the result and the user immediately sees category filters followed by the insight-card grid

#### Scenario: User reviews linked-research cards on desktop
- **WHEN** the linked-research result is displayed at the desktop breakpoint
- **THEN** insight cards appear in three columns and each proposed requirement can be accepted or rejected within its source insight card

#### Scenario: Insight preserves its requirement relationships

- **WHEN** a linked-research insight references existing requirements through `relatedTo`
- **THEN** their `BT`, `FT`, or `NFT` identifiers remain visible on the collapsed card beside a relationship icon
- **AND** opening «Подробнее» reveals the insight detail and source types without moving the relationship identifiers

#### Scenario: User reviews a compact enhancement

- **WHEN** an insight proposes an enhancement
- **THEN** the collapsed enhancement row states whether it belongs to business, functional, or non-functional requirements
- **AND** expanding the row reveals the full wording with explicit accept and reject actions
- **AND** accepting or rejecting the enhancement updates the existing decision lineage and final requirements payload

#### Scenario: User inspects the requirements sent to research

- **WHEN** the user opens the source requirements from a completed linked-research result
- **THEN** business, functional, and non-functional requirements use the same category-colored three-column presentation as the primary review editor
- **AND** each column shows its description, item count, and quiet divided requirement rows
- **AND** a consistent header action returns to the research-result cards without losing decisions

### Requirement: Explicit improvement decisions
The frontend SHALL let users accept or reject each proposed requirement improvement, SHALL show the proposed requirement and its rationale together, and SHALL provide a persistent summary of accepted decisions with the final-save action.

#### Scenario: User reviews a proposal
- **WHEN** an improvement is displayed
- **THEN** its target requirement type, rationale, proposed wording, and current decision state are visible together

#### Scenario: User saves selected improvements
- **WHEN** the user accepts one or more improvements and saves the final version
- **THEN** only accepted improvements are added and accepted/rejected decision lineage is persisted through the existing requirements-version API

### Requirement: Requirements-focused review stage
After a successful decomposition, the frontend SHALL make the generated requirements the dominant content. The completed business-context form SHALL collapse into a compact summary that can be expanded for editing or re-decomposition, and redundant completed-job presentation SHALL not separate the context summary from the requirements review.

The requirements review SHALL expose a sticky responsive action area near its heading. It SHALL offer saving reviewed changes, SHALL expose «Улучшить требования с помощью AI» as an explicitly optional action, and SHALL offer a clear direct transition to the final version after a reviewed requirements version has been saved. These actions SHALL not be placed only after the final requirement card.

#### Scenario: User enters requirements review
- **WHEN** decomposition completes successfully
- **THEN** the full context textarea, upload control, AI settings, and decomposition action are collapsed into a compact completed-context summary and the requirements heading is visible immediately below it

#### Scenario: User needs to change context
- **WHEN** the user expands the completed-context summary
- **THEN** the original context, file control, AI settings, and re-decomposition action become available without losing the current requirements

#### Scenario: User reviews generated requirements
- **WHEN** editable requirements are displayed
- **THEN** save and optional-research actions are grouped near the review heading and remain reachable while scrolling

#### Scenario: Reviewed version has not been saved
- **WHEN** the current requirements do not yet have a persisted reviewed version
- **THEN** both the AI-research and direct-final actions are disabled and explain that the reviewed version must be saved first

#### Scenario: Reviewed version is ready to finish
- **WHEN** a reviewed requirements version is persisted and no edits are pending
- **THEN** the user can either start optional AI research or proceed directly to the final version

### Requirement: Compact history drawer
The frontend SHALL expose job history from a dismissible side drawer with compact localized entries and filters for all jobs, decompositions, and research. History SHALL no longer reserve permanent vertical space below the active workspace.

#### Scenario: User opens history
- **WHEN** the user activates the history control
- **THEN** a side drawer opens with the most recent jobs and the active workspace remains behind it

#### Scenario: User filters history
- **WHEN** the user selects a decomposition or research filter
- **THEN** only matching entries are shown without changing the currently loaded job

#### Scenario: User selects a history entry
- **WHEN** the user activates one history entry
- **THEN** its durable state or result is restored and the drawer closes

### Requirement: Focused desktop requirements editor
On desktop, the requirements review SHALL prioritize reading and editing requirements while retaining the compact persistent four-stage progress indicator and access to the source context.

The editor SHALL let the user choose between three parallel category columns and a stacked row layout. Each category SHALL show its title, description, requirements, and add-requirement control. Item actions and add-requirement controls SHALL remain discoverable without being permanently expanded for every item and category. The selected layout SHALL persist locally and SHALL also apply to the final requirements editor.

#### Scenario: User begins reviewing a decomposition
- **WHEN** a completed decomposition is displayed on a desktop viewport
- **THEN** the user sees the persistent stage-two progress indicator, direct access to the source context, and requirements as the dominant visible content

#### Scenario: User reviews decomposed categories
- **WHEN** the desktop requirements editor is displayed
- **THEN** business, functional, and non-functional requirements are visible at the same time in three parallel columns and every requirement remains editable and removable

#### Scenario: User switches to stacked rows
- **WHEN** the user selects «Строки» in either the review or final editor
- **THEN** the three categories are stacked in one column, the selection is exposed as pressed, and the same choice is restored in subsequent requirement editors

#### Scenario: User adds a requirement
- **WHEN** the user activates «Добавить требование» in a category column
- **THEN** the composer expands only in that column and can be dismissed without modifying requirements

### Requirement: Clear action and visual hierarchy
The requirements review SHALL present one primary action for the current state. Saving changes SHALL be the primary editing action. Optional AI-assisted improvement SHALL become available after a reviewed version is saved and SHALL use secondary styling with explicit optional language. Green SHALL communicate success or completion and SHALL NOT style an optional next-step action.

The primary workspace SHALL avoid nested bordered-card treatment for every structural level. Repeated edit and delete actions MAY be contextual or grouped, provided they remain keyboard accessible and have meaningful accessible names.

#### Scenario: Requirements contain unsaved changes
- **WHEN** edited requirements differ from the persisted reviewed version
- **THEN** «Сохранить изменения» is the single visually primary action and AI-assisted improvement is unavailable until saving completes

#### Scenario: Reviewed requirements are saved
- **WHEN** the reviewed version is persisted and no edits are pending
- **THEN** the saved state is communicated with success styling, «Улучшить требования с помощью AI» is available as an explicitly optional secondary action, and «Перейти к финальной версии» is the clear direct completion action

#### Scenario: Linked AI research is starting or active
- **WHEN** the user starts «Улучшить требования с помощью AI» and the linked research request is pending, accepted, queued, running, waiting for retry, or awaiting cancellation
- **THEN** the action remains disabled, displays a spinner with «AI-исследование выполняется…», and further activation cannot create another linked research job

#### Scenario: Job admission limit rejects linked research
- **WHEN** the server rejects linked research because the user's active-job limit is reached
- **THEN** the interface restores the eligible action state and explains in Russian that another task is already running and the user should wait for it to finish

#### Scenario: User scans requirement items
- **WHEN** no item is being edited and no add composer is open
- **THEN** structural borders and repeated controls do not compete visually with the requirement wording

### Requirement: Consistent product terminology
User-facing copy SHALL use consistent Russian product language across the primary workflow and standalone tools. The interface SHALL use «AI-исследование» or «Улучшить требования с помощью AI» according to context and SHALL use «Соответствие требованиям» instead of the English `compliance` label. Raw technical terms MAY remain in technical details.

#### Scenario: User navigates between workflow and tools
- **WHEN** headings, actions, tabs, or requirement-type descriptions are displayed
- **THEN** equivalent concepts use the same Russian terminology and capitalization

### Requirement: User-facing status language
The frontend SHALL display one localized primary status for each job and result. Raw lifecycle values, model attempts, and provider metadata SHALL appear only inside an optional technical-details disclosure.

For an active decomposition or research job, the frontend SHALL present progress messaging only once in the disabled primary action, with cancellation available beside it. A separate state card SHALL be reserved for failure, retry-wait, cancellation-requested, or cancelled states.

#### Scenario: Job is actively running
- **WHEN** a decomposition or research job is accepted, queued, or running
- **THEN** the primary action shows a spinner and one localized activity label, cancellation remains available beside it, and no duplicate activity card is rendered below

#### Scenario: Job enters an exceptional state
- **WHEN** a job fails, waits for retry, has cancellation requested, or is cancelled
- **THEN** a dedicated state card explains that exceptional state without duplicating a normal running message

#### Scenario: Completed result is displayed
- **WHEN** a job succeeds with a complete result
- **THEN** the primary status reads «Готово» and does not simultaneously display raw `SUCCEEDED` or `COMPLETE` identifiers

#### Scenario: Partial or failed result is displayed
- **WHEN** a job completes partially or fails
- **THEN** the primary status communicates that outcome in Russian and technical diagnostics remain available separately

### Requirement: Responsive and accessible interaction
The workflow indicator, secondary navigation, history drawer, result sections, disclosures, and decision controls SHALL remain operable at narrow and desktop widths and SHALL expose meaningful accessible names, focus behavior, and selected/expanded states.

#### Scenario: Narrow viewport
- **WHEN** the viewport is narrower than the desktop layout
- **THEN** controls wrap or stack without horizontal page overflow and primary actions remain reachable

#### Scenario: Keyboard navigation
- **WHEN** a keyboard user traverses interactive workflow controls
- **THEN** focus is visible, controls are reachable in logical order, and drawers or section navigation can be operated without pointer input

### Requirement: Durable behavior compatibility
The redesign SHALL preserve existing durable job submission, active-job restoration, cancellation, artifact download, requirements-version lineage, and completed-result restoration behavior. A final version SHALL remain manually editable. Each saved manual revision SHALL reference its immediate base version and preserve the decisions and research-enhancement lineage of the final version it revises.

#### Scenario: Page reloads during a job
- **WHEN** the page reloads with a persisted active job identifier
- **THEN** the correct workspace and workflow stage are restored from authoritative job state

#### Scenario: User returns to an older result
- **WHEN** a completed history entry is selected
- **THEN** the result and any persisted reviewed requirements versions are restored without a new provider call

#### Scenario: User edits research-assisted final requirements
- **WHEN** the user edits and saves a final version produced from AI-research decisions
- **THEN** a new immutable requirements version is created from the current final version without losing accepted or rejected decision lineage

#### Scenario: User edits a direct final version
- **WHEN** the user skipped AI research and edits the final requirements
- **THEN** a new immutable requirements version is created with the direct-final marker preserved and the final editor remains available after reload
