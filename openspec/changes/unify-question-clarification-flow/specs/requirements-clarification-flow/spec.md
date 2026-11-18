## Purpose

Provide one understandable clarification journey for questions shared across requirements, while preserving the existing product design, review draft, explicit resolution rules and immutable version saving.

## ADDED Requirements

### Requirement: Two entry points to one clarification workspace
The editable stage-two BABOK workspace SHALL retain «Реестр» for requirements and «Вопросы» for the task-wide list of GAPs. Both entry points SHALL open the same question panel for a selected GAP. A GAP SHALL retain one identity, answer, state, discussion history and set of per-requirement confirmations across all entry points. A GAP with several associated questions SHALL display those questions under that single GAP rather than create independent answers or closure states. Opening the panel MUST NOT generate AI output, save a version or mutate review decisions.

#### Scenario: A question is opened from either section
- **WHEN** GAP-006 is opened from BR-001 in the registry and later from «Вопросы»
- **THEN** both entries display the same current answer, state, linked requirements, confirmations and GAP-scoped discussion history
- **AND** opening either entry causes no generation or version save

#### Scenario: Several requirements share a question
- **WHEN** GAP-006 is linked to ten requirements
- **THEN** the task-wide list contains one GAP-006, each applicable requirement exposes that same question, and the answer is entered once
- **AND** confirmation progress counts linked requirements rather than duplicate appearances of the question

### Requirement: Requirement detail exposes actionable information first
The selected requirement SHALL expose its complete wording, applicable substantive type-specific fields, labelled quality and concise summaries of associated open GAPs without expanding source evidence. Each summary SHALL identify the GAP, expose its current state and offer «Разобрать вопрос». Full answer editing, the complete cross-requirement checklist and GAP resolution controls SHALL belong to the common question panel rather than be duplicated inside the requirement card. Source citations, provenance and detailed relationship lists SHALL remain available in a disclosure collapsed on initial selection. Missing or unavailable source warnings MUST remain visible. Summaries MUST derive from existing analysis and MUST NOT invent a reason for a quality assessment or claim that every linked GAP makes the wording defective.

#### Scenario: Business requirement needs clarification
- **WHEN** BR-001 has a populated success indicator and GAP-008 concerning the meaning and measurement of incomplete applications
- **THEN** the wording, success indicator and a concise GAP-008 summary are visible together
- **AND** the user can open GAP-008 without first expanding source evidence or reading confirmations for unrelated requirements

#### Scenario: Ready wording has an open linked question
- **WHEN** a requirement has quality «Готово» and a linked GAP remains open
- **THEN** both facts are shown independently, without hiding the question or automatically downgrading quality

#### Scenario: Structured fields differ by requirement type
- **WHEN** BR, SR, FR, NFR, TR or CON is selected
- **THEN** only its supported substantive fields appear, original evidence remains available, and FR does not acquire a BR success-indicator field or an SR role field

### Requirement: Task-wide question list is a work queue
The «Вопросы» section SHALL provide one summary per GAP, existing open/closed filtering and counts, concise missing-decision information, priority and addressee when available, linked-requirement count and current next-step status. «Разобрать вопрос» SHALL open the same question panel used by the registry. Full manual forms, AI discussion, checklist actions and closure controls SHALL be presented in that panel rather than repeated on every queue row. Existing full question text and source evidence SHALL remain reachable.

#### Scenario: User scans all outstanding work
- **WHEN** «Вопросы» contains eight open GAPs
- **THEN** eight summaries are available without eight permanently expanded answer/checklist workflows
- **AND** opening a summary exposes its associated questions and required review work in the panel

#### Scenario: A closed question is reopened
- **WHEN** a user finds a closed GAP through the existing closed filter and explicitly reopens it in the panel
- **THEN** its common state updates and it appears in the open queue without creating a new GAP

### Requirement: One panel supports the whole question journey
The common panel SHALL identify the selected GAP and show its missing decision, associated question text, priority/addressee when available and current answer before detailed cross-requirement confirmations. It SHALL support manual answering, explicit AI-assisted clarification, reviewing and editing linked requirements, per-requirement confirmation, resolution, dismissal with a reason and reopening. These operations SHALL use the existing shared review draft. Editing linked requirements SHALL stay within the question workspace through recoverable subviews; the user SHALL be able to return to the question without losing the answer or any requirement draft.

#### Scenario: Manual clarification without AI
- **WHEN** AI is disabled and a user opens an outstanding GAP
- **THEN** the user can enter an answer, inspect and edit linked requirements, confirm dispositions and close the GAP under the existing resolution conditions
- **AND** no AI step or new completeness check is required

#### Scenario: Edit a linked requirement
- **WHEN** a user enters an answer and opens «Редактировать FR-004» from the question panel
- **THEN** FR-004 opens for editing within that workspace and the answer and all other pending edits remain intact
- **AND** returning to the question retains the selected GAP and current confirmation progress

### Requirement: Preserve existing confirmation and closure semantics
One GAP SHALL require a current explicit disposition for each linked requirement, deduplicated across relationship directions. Existing context and analysis records SHALL remain evidence rather than mandatory requirement confirmations; truly missing references SHALL remain blocking under existing validation. A manual answer or ordinary accepted AI edit MUST NOT close the GAP, confirm incorporation or change requirement quality automatically. Manual resolution SHALL require a nonempty answer, current confirmations for every linked requirement and no blocking partial clarification. «Изменение не требуется» SHALL require its existing reason. Changes to the question, answer, requirements or linked set SHALL invalidate confirmations according to current rules. Dismissal and legacy closure SHALL remain distinguishable from resolution.

#### Scenario: Only one requirement has been checked
- **WHEN** a GAP links BR-001 and FR-004 and only BR-001 has a current confirmation
- **THEN** progress shows one of two requirements checked and resolution remains unavailable with the remaining action explained

#### Scenario: Existing term is linked
- **WHEN** GAP-008 links BR-001 and an existing TERM-001
- **THEN** BR-001 requires confirmation while TERM-001 remains accessible evidence and does not add another required confirmation

#### Scenario: Answer changes after confirmation
- **WHEN** the current answer changes after linked requirements have been confirmed
- **THEN** affected confirmations become pending and any existing resolution is invalidated according to the existing review rules

#### Scenario: Question is dismissed instead of resolved
- **WHEN** the user explicitly removes a GAP from consideration with a reason
- **THEN** the decision is recorded as a dismissal and the UI does not claim that its answer was incorporated

### Requirement: AI clarification has one explicit context
The question panel SHALL offer «Разобрать с AI» for its selected GAP and use that GAP's existing discussion history and current draft context. Opening or switching the question panel MUST NOT start generation. The first generated turn SHALL require an explicit starting or send action. General requirement discussion SHALL remain available as «Обсудить требование с AI», distinct from resolving a particular GAP. Question clarification SHALL preserve existing validated proposals, before/after review, stale-context rejection and explicit acceptance. A complete guided resolution package SHALL display that acceptance includes its answer, edits, confirmations and selected GAP closure; partial or ordinary packages SHALL retain their existing non-closing behavior.

#### Scenario: Open a question without generating
- **WHEN** the user opens GAP-006 and selects its AI clarification subview
- **THEN** GAP-006 and its history are identified and no new generation starts until the user explicitly starts or sends a turn

#### Scenario: A user chooses a quick command with unsent text

- **WHEN** the user types a draft in the composer and sends a quick command
- **THEN** the command is sent separately and the draft stays in the composer, including after recovery from a persisted failed turn

#### Scenario: User opens a question without an answer

- **WHEN** the selected GAP has no answer draft
- **THEN** the panel shows the question and reply controls before a collapsed list of related requirements
- **AND** the list can be opened on demand and opens by default once the user enters an answer

#### Scenario: Complete guided package is accepted
- **WHEN** a current guided package covers every linked requirement with no remaining question and the user accepts its displayed resolution action
- **THEN** its answer, edits and confirmations enter the shared draft atomically and only the selected GAP closes
- **AND** the chat highlights «Сохранить версию» after the draft changes

#### Scenario: Proposal is stale or incomplete
- **WHEN** context changes before acceptance or a package leaves unresolved questions or linked requirements
- **THEN** stale changes are rejected without partial application and an incomplete accepted package does not falsely close the GAP

### Requirement: Content editing and quality assessment are distinct
The requirement SHALL offer a visible «Редактировать» action for wording and supported substantive fields. BR success indicators SHALL be editable in a full-width multiline field with their complete values readable. «Пересмотреть оценку» SHALL separately expose the existing quality choices with concise explanations of their meaning. Editing content MUST NOT silently change quality. Changing quality MUST NOT close a GAP or confirm an answer. Both actions SHALL retain existing draft and global-save behavior, including valid unfinished edits assembled by global saving and errors that identify invalid fields. Original evidence SHALL remain read-only.

#### Scenario: Business success indicator is edited
- **WHEN** a user edits BR-001's wording and long success indicator and applies those edits
- **THEN** both values enter the draft, the success indicator is readable without horizontal field scrolling, and the previous quality remains unchanged

#### Scenario: User reconsiders quality
- **WHEN** a user selects «Готово» through «Пересмотреть оценку» while linked questions remain open
- **THEN** quality changes in the draft, questions retain their states, and the interface visibly distinguishes those facts

#### Scenario: User saves an unfinished hidden edit
- **WHEN** a valid unfinished requirement edit is hidden by selecting another requirement or opening a question and global Save is activated
- **THEN** the existing draft assembler includes that edit; invalid required fields prevent saving and are revealed with focused errors

### Requirement: Return to the exact entry context
Opening and closing the panel SHALL preserve the originating review section, selected requirement, search/type/clarification filters, question-list filter, relevant scroll position and unfinished edits. Close, Escape and explicit back-to-question controls SHALL preserve draft changes and restore focus to an available originating control. Saving or rejecting edits SHALL remain explicit existing operations rather than side effects of closing. If an origin is removed or no longer available, focus SHALL return to the appropriate section's nearest available control. Supported task/GAP/QUESTION links SHALL reveal the question panel in the task's question context without requiring an in-memory origin. Invalid targets SHALL be explained without discarding edits. Switching tasks SHALL retain existing dirty-draft guards and MUST NOT carry the former task's panel context into the new task.

#### Scenario: Open from a filtered registry
- **WHEN** a user opens a GAP from FR-004 under an FR filter and search, edits a linked requirement and closes the panel
- **THEN** the original registry view, selection, filters and scroll are restored with pending edits intact and focus returns to the entry action

#### Scenario: Open from a filtered question queue
- **WHEN** a user opens a question midway through the open queue and closes it
- **THEN** the queue retains its filter and scroll position without jumping to the first GAP

#### Scenario: Entry disappears after resolution
- **WHEN** the panel was opened from the open queue and its GAP closes before the panel is dismissed
- **THEN** the closed GAP leaves that filtered queue and focus returns to an available queue control without losing other pending work

#### Scenario: A task question link is followed
- **WHEN** a supported task link targets an existing GAP or associated QUESTION without a previous UI origin
- **THEN** the task's question context and corresponding GAP panel open, while a missing target produces a recoverable explanation

### Requirement: Saved state and semantic completion remain separate
The UI SHALL consistently distinguish «Ответ добавлен», «Ответ учтён», «Вопрос закрыт», requirement quality and version saving. Panel edits SHALL remain part of the shared unsaved review until the existing global save succeeds. Closing the panel MUST NOT imply server persistence. Save failures and remote-version conflicts SHALL preserve the draft and provide the existing recovery actions. Saved questions and confirmations SHALL be restored through existing task/version loading. Export SHALL include the authoritative complete saved registry and decisions rather than just the selected question or filtered records. Existing finalization with unresolved work SHALL continue to require its normal acknowledgment, without a new mandatory all-questions-closed gate.

#### Scenario: Panel is closed before saving
- **WHEN** a user answers and resolves a GAP and closes its panel without a global save
- **THEN** the resolution is reflected in both entry points as draft state and the workspace indicates unsaved changes

#### Scenario: Save fails or conflicts
- **WHEN** a version save fails or another client has saved a newer version
- **THEN** panel-related edits remain available and saved status is not falsely displayed

#### Scenario: Saved review is reopened and exported
- **WHEN** a user saves a valid clarification, reloads the task and exports its saved version
- **THEN** the answer, dispositions and GAP decision restore consistently and the export contains the complete saved registry

### Requirement: Preserve current visual language and accessible operation
Implementation SHALL reuse the existing application's palette, typography, spacing scale, radii, button treatments, status colors and panel appearance. The demo prototype SHALL be a reference for information hierarchy and interactions only; its colors, typography and shell styling MUST NOT replace product styles. Changes SHALL be confined to the editable stage-two BABOK surface and required shared-component adaptations. Final, read-only, legacy and linked-research surfaces SHALL preserve their existing contracts. New controls SHALL be keyboard reachable with visible focus and meaningful Russian names. At 320, 390, 768, 1024 and 1440 CSS pixels and 200 percent zoom, content SHALL reflow without horizontal page overflow. Only one modal interaction surface SHALL own focus at a time, including when AI or requirement-editing subviews are open.

#### Scenario: Existing design is retained
- **WHEN** the updated registry, question queue and question panel are compared with the application's current appearance in the same viewport
- **THEN** existing palette, type styles, controls and panel treatments remain consistent and only the specified content hierarchy and flow differ

#### Scenario: Keyboard and narrow-screen operation
- **WHEN** a user opens the panel, enters a linked editor or AI subview and returns using the keyboard on a narrow screen
- **THEN** focus remains within the active interaction surface, controls and long text fit without horizontal page overflow, and closing restores focus to the entry context

#### Scenario: Other workflow surfaces are opened
- **WHEN** the user views a final editor, read-only research snapshot, legacy result or linked-research stage
- **THEN** their existing presentation and actions remain available without accidental introduction of the new editable question workflow
