## MODIFIED Requirements

### Requirement: Persistent guided workflow
The frontend SHALL present four stages: business context, requirements, optional AI research and final version. The indicator SHALL distinguish completed, current, available, skipped and unavailable stages. Processing completion, unsaved edits, saved review and saved final version SHALL have distinct labels; saving a document MUST NOT imply semantic approval.

#### Scenario: New user starts with business context
- **WHEN** no decomposition or saved requirements are selected
- **THEN** context is current, later stages are unavailable, and no empty result card appears below the form

#### Scenario: Reviewed requirements are available
- **WHEN** a completed decomposition is selected
- **THEN** requirements is current and research becomes available only after the current draft is saved

#### Scenario: Final requirements are saved
- **WHEN** final requirements are persisted
- **THEN** the final stage is complete, the version/date are shown, no instruction to save the already saved document remains, and reload restores it

#### Scenario: User skips optional AI research
- **WHEN** a clean saved review is finalized directly
- **THEN** research is labelled skipped, final is complete, and the direct-final decision survives reload

#### Scenario: User starts a new task after viewing a result
- **WHEN** the user activates New task and resolves any unsaved changes
- **THEN** the workspace returns to an empty context form without deleting completed history

### Requirement: Progressive disclosure of AI settings
Recommended settings SHALL remain outside the primary action path behind a labelled disclosure. Available controls SHALL reflect actual model capabilities. Settings for the next run SHALL persist for the current user across reloads and remain separate from the immutable settings of an opened result.

#### Scenario: User accepts defaults
- **WHEN** a valid context is submitted without opening settings
- **THEN** the job uses configured recommended defaults

#### Scenario: Expert changes settings
- **WHEN** a supported setting changes
- **THEN** it is reviewable before submission and used for the next eligible job

#### Scenario: Model cannot disable reasoning
- **WHEN** the selected provider interprets disabled reasoning as low
- **THEN** the UI labels that effective option as minimum rather than falsely offering disabled reasoning

#### Scenario: User views a historical run
- **WHEN** next-run settings differ from the opened result
- **THEN** historical settings are labelled separately and remain unchanged by editing the next-run controls

### Requirement: Requirements-focused review stage
After successful decomposition, the generated registry SHALL be the dominant content. The context form SHALL collapse into an expandable summary without losing review edits. Requirements, questions and relationships SHALL have distinct discoverable review sections; analysis MUST NOT appear as confirmed requirements. The heading SHALL provide a sticky responsive save/action area, with optional research and direct finalization available only for a clean saved version.

#### Scenario: User enters requirements review
- **WHEN** decomposition completes
- **THEN** the full form collapses and the registry heading and a concise summary of counts and review needs appear immediately

#### Scenario: User needs to change context
- **WHEN** the context summary is expanded
- **THEN** original context, materials and re-decomposition controls are accessible without discarding review state; re-decomposition requires explicit handling of unsaved changes

#### Scenario: User reviews generated requirements
- **WHEN** records are displayed
- **THEN** save and next-step controls remain reachable without scrolling through all registry sections

#### Scenario: Reviewed version has not been saved
- **WHEN** there is no saved review or any pending field/decision edit
- **THEN** research and direct-final actions are unavailable with an explanation that the current draft must be saved

#### Scenario: Reviewed version is ready to finish
- **WHEN** a reviewed version is saved and clean
- **THEN** the user can start optional research or finalize, acknowledging remaining review items when present

### Requirement: Familiar linked-research result cards
Completed requirements-linked research SHALL open directly on filterable cards, without a context form or standalone report shell. Cards SHALL show category, title, summary, related requirement IDs and expandable details. Applicability SHALL retain its five-segment scale and numeric value with an explicit model-estimate label and accessible name. A responsive grid SHALL support three columns when space permits. The sticky final-save action and BABOK/legacy decision lineage SHALL remain intact.

#### Scenario: Applicability is readable visually and numerically
- **WHEN** an insight has an applicability score
- **THEN** proportional segments and the exact percentage are visible and accessible, labelled as a model estimate rather than probability

#### Scenario: Linked AI research result opens
- **WHEN** a completed research job is selected or finishes
- **THEN** filters and cards are immediately visible without the stage-one form above them

#### Scenario: User reviews linked-research cards on desktop
- **WHEN** the viewport supports three readable columns
- **THEN** cards use three columns and accepting an enhancement opens its exact-outcome review

#### Scenario: Insight preserves its requirement relationships
- **WHEN** an insight references BABOK or retained legacy requirement IDs
- **THEN** links remain visible on the collapsed card and navigate to the referenced records without losing decisions

#### Scenario: User reviews a compact enhancement
- **WHEN** an enhancement row is expanded
- **THEN** its target type, rationale, editable final wording and operation are shown before acceptance or rejection

#### Scenario: User inspects the requirements sent to research
- **WHEN** source requirements are opened
- **THEN** the exact immutable input version uses the type-aware read view and returning restores pending research decisions

### Requirement: Explicit improvement decisions
Users SHALL explicitly accept or reject improvements after reviewing the exact proposed outcome and rationale. They SHALL be able to edit final wording and see a persistent decision summary. Saving SHALL apply only accepted changes, preserve original suggestions and edited wording in lineage, and remain duplicate-safe.

#### Scenario: User reviews a proposal
- **WHEN** a proposal is opened
- **THEN** target type, affected IDs, rationale, final wording, operation and decision state appear together

#### Scenario: User saves selected improvements
- **WHEN** accepted changes are saved
- **THEN** only their confirmed outcomes enter the final version and accepted/rejected decisions and overrides survive reload through the version API

### Requirement: Compact history drawer
History SHALL use a dismissible side drawer with localized grouped workflow entries, meaningful titles, search and filters for all workflows, decompositions and research. Each group SHALL expose links to its stages and current saved state. History MUST NOT permanently occupy vertical workspace space.

#### Scenario: User opens history
- **WHEN** history is activated
- **THEN** the drawer opens, receives keyboard focus and displays recent accessible workflows

#### Scenario: User filters history
- **WHEN** a filter or search is applied
- **THEN** matching authorized workflows are shown without changing the currently loaded task

#### Scenario: User selects a history entry
- **WHEN** the user selects an explicit stage and resolves unsaved changes
- **THEN** its canonical task and saved state load and the drawer closes

### Requirement: Focused desktop requirements editor
The editor SHALL prioritize type-aware requirements with source context and the four-stage indicator. BABOK exposes BR, SR, FR, NFR, TR and CON; legacy results expose their supported categories. In «По типам», selection SHALL filter records; in «Все требования», selection SHALL move viewport and focus to the chosen section. The view choice SHALL persist and apply to review and final editors. All types and actions SHALL remain accessible at narrow widths.

#### Scenario: User begins reviewing a decomposition
- **WHEN** a completed decomposition is displayed
- **THEN** requirements dominate the workspace with direct source access and the persistent stage indicator

#### Scenario: User reviews decomposed categories
- **WHEN** the user selects any supported type
- **THEN** its title, count, records and add control are reachable and stable IDs remain individually addressable

#### Scenario: User switches to stacked rows
- **WHEN** the user selects «По типам», the successor of the prior row-focused view
- **THEN** only the selected type appears in a single-column list and the view choice is restored in later editors

#### Scenario: User navigates all requirements
- **WHEN** the user selects TR while «Все требования» is active
- **THEN** TR remains among all displayed sections and viewport/focus move to its heading without losing any draft

#### Scenario: User adds a requirement
- **WHEN** Add requirement is activated for a type
- **THEN** a type-specific composer opens, produces a valid unused stable ID, and can be dismissed without modifying requirements

### Requirement: User-facing status language
The frontend SHALL display one localized primary processing status. Infrastructure identifiers, hashes, raw lifecycle/material enums, chunk details, attempts and technical trace SHALL appear only in Debug. Human-readable material names, citations, useful requirement IDs and warnings about incomplete coverage SHALL remain in the user view. Active progress SHALL distinguish observed stage from estimated time; timers MUST NOT invent model activities.

#### Scenario: Job is actively running
- **WHEN** a job is accepted, queued or running
- **THEN** one progress area shows the confirmed stage, an optional explicitly approximate time estimate and a reachable cancellation control

#### Scenario: Job enters an exceptional state
- **WHEN** a job fails, waits for retry, awaits cancellation or is cancelled
- **THEN** one state card explains that condition and available recovery actions without duplicating normal running messages

#### Scenario: Completed result is displayed
- **WHEN** processing succeeds completely
- **THEN** the UI says processing is complete without raw enums or a claim that all requirements are semantically approved

#### Scenario: Partial or failed result is displayed
- **WHEN** processing is partial or failed
- **THEN** the UI explains the consequence in Russian and keeps useful coverage warnings visible with optional Debug access

#### Scenario: Baseline was not provided
- **WHEN** a registry has no baseline
- **THEN** the UI explains that comparison is unavailable without showing NOT_PROVIDED, hashes or artifact UUIDs

### Requirement: Responsive and accessible interaction
Workflow controls, history, editors, disclosures and decisions SHALL be usable by keyboard and at narrow/desktop widths and 200 percent zoom. They SHALL expose meaningful names, selected/expanded states and visible focus. Modals SHALL receive and contain focus, close with Escape when safe, and return focus to the trigger. Controls MUST NOT rely solely on color; text contrast SHALL be at least 4.5:1 for normal text and 3:1 for large text, with interactive targets at least 24 by 24 CSS pixels.

#### Scenario: Narrow viewport
- **WHEN** the workspace is tested at 390 or 839 CSS pixels wide
- **THEN** types, filters and primary actions are reachable without page-level horizontal overflow or clipped content

#### Scenario: Keyboard navigation
- **WHEN** a keyboard user traverses the workspace
- **THEN** focus order is logical, tabs support keyboard selection and all actions are available without a pointer

#### Scenario: History dialog opens and closes
- **WHEN** history opens and is later dismissed
- **THEN** focus moves into and stays within the dialog while open and returns to its trigger after closing

#### Scenario: Sticky actions overlap content
- **WHEN** content scrolls beneath a sticky action area at 200 percent zoom
- **THEN** focused controls and final rows can be scrolled fully into view and are not obscured

### Requirement: Cross-client realtime synchronization
The system SHALL publish ordered durable lifecycle, linked-research and version events. Viewing clients SHALL retain their job subscription after completion, resume after disconnect and reconcile saved state. Remote changes SHALL NOT replace unsaved edits or automatically change an explicitly selected task route. Linked research created elsewhere SHALL appear as an available navigation action.

#### Scenario: Active job changes state in two clients
- **WHEN** two clients view the same active job
- **THEN** ordered events update both clients' displayed authoritative lifecycle state

#### Scenario: Requirements version is saved in another client
- **WHEN** a new reviewed or final revision is saved
- **THEN** other clients refresh version availability automatically without overwriting local drafts

#### Scenario: Linked research is started in another client
- **WHEN** a parent viewer receives a linked-research creation event
- **THEN** it shows the child status/link and stays on the parent URL until the user chooses to follow it

#### Scenario: Remote version arrives during local editing
- **WHEN** local edits coexist with a newer remote version
- **THEN** the client preserves the draft and offers explicit comparison and reconciliation

#### Scenario: SSE connection is temporarily interrupted
- **WHEN** the client reconnects after event sequence N
- **THEN** it requests subsequent events and reconciles current state without losing edits

#### Scenario: Event belongs to a different job
- **WHEN** a stale callback references a previously selected task
- **THEN** it cannot change the current route or draft

## ADDED Requirements

### Requirement: Guided context and material input
The context form SHALL offer an expanding text field and a non-mandatory structure for goals, roles, behavior and constraints. The structure helper MUST NOT replace existing text without confirmation. Primary input, previous requirements and reference materials SHALL have distinct labels, limits and upload error states and retain their roles in submitted input.

#### Scenario: User has already entered a brief
- **WHEN** the user opens the structure helper
- **THEN** existing text is preserved until an explicit insertion or replacement decision

#### Scenario: Baseline and reference are attached
- **WHEN** the user supplies previous requirements and a reference document
- **THEN** the UI shows their distinct roles and the request passes the corresponding material descriptors without merging them into the primary source

#### Scenario: Upload fails
- **WHEN** a file exceeds limits or cannot be uploaded
- **THEN** the form preserves entered context and valid attachments and shows a per-file recoverable error

### Requirement: Useful background workflow
While processing continues, users SHALL be able to browse saved results or prepare an unsent context draft and return to the running job. The UI SHALL preserve server admission limits and MUST NOT imply that background mode allows an otherwise forbidden concurrent launch.

#### Scenario: User continues in background
- **WHEN** the user chooses background mode
- **THEN** the running task remains reachable with status while history reading and draft preparation remain available
