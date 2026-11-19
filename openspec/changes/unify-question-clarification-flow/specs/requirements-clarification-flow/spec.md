## Purpose

Provide one understandable clarification journey for questions shared across requirements, while preserving the existing product design, review draft, explicit resolution rules and immutable version saving.

## ADDED Requirements

### Requirement: Two entry points to one clarification workspace
The editable stage-two BABOK workspace SHALL retain «Реестр» for requirements and «Вопросы» for task-wide GAPs. Both SHALL open the same question panel and share one GAP identity, answer, state, discussion history and set of per-requirement confirmations.

#### Scenario: A question is opened from either section
- **WHEN** GAP-006 is opened from BR-001 in the registry and later from «Вопросы»
- **THEN** both entries display the same current answer, state, linked requirements, confirmations and GAP-scoped discussion history
- **AND** opening either entry causes no generation or version save
- **AND** opening the panel does not mutate review decisions

#### Scenario: Several requirements share a question
- **WHEN** GAP-006 is linked to ten requirements
- **THEN** the task-wide list contains one GAP-006, each applicable requirement exposes that same question, and the answer is entered once
- **AND** confirmation progress counts linked requirements rather than duplicate appearances of the question

#### Scenario: A GAP has several associated questions
- **WHEN** the selected GAP contains more than one question
- **THEN** the panel displays them under that single GAP with one answer and closure state

### Requirement: Requirement detail exposes actionable information first
Requirement detail SHALL show complete wording, applicable substantive fields, labelled quality and concise summaries of linked open GAPs before source evidence. Each summary SHALL identify the GAP, show its state and offer «Разобрать вопрос». The common question panel SHALL own answer editing, the cross-requirement checklist and closure.

#### Scenario: Business requirement needs clarification
- **WHEN** BR-001 has a populated success indicator and GAP-008 concerning the meaning and measurement of incomplete applications
- **THEN** the wording, success indicator and a concise GAP-008 summary are visible together
- **AND** the user can open GAP-008 without first expanding source evidence or reading confirmations for unrelated requirements

#### Scenario: Ready wording has an open linked question
- **WHEN** a requirement has quality «Готово» and a linked GAP remains open
- **THEN** both facts are shown independently, without hiding the question or automatically downgrading quality
- **AND** GAP summaries use existing analysis and do not invent reasons for quality assessments or imply that every linked GAP makes the wording defective

#### Scenario: Structured fields differ by requirement type
- **WHEN** BR, SR, FR, NFR, TR or CON is selected
- **THEN** only its supported substantive fields appear, original evidence remains available, and FR does not acquire a BR success-indicator field or an SR role field

#### Scenario: Source evidence is initially collapsed
- **WHEN** the user selects a requirement
- **THEN** citations, provenance and detailed relationships are available in an initially collapsed disclosure
- **AND** missing or unavailable source warnings stay visible

### Requirement: Task-wide question list is a work queue
«Вопросы» SHALL show one summary per GAP with the existing open and closed filters and counts. «Разобрать вопрос» SHALL open the same panel as the registry. The panel SHALL contain manual forms, AI discussion, checklist and closure actions. Full question text and evidence SHALL remain reachable.

#### Scenario: User scans all outstanding work
- **WHEN** «Вопросы» contains eight open GAPs
- **THEN** eight summaries are available without eight permanently expanded answer/checklist workflows
- **AND** opening a summary exposes its associated questions and required review work in the panel
- **AND** each summary briefly identifies the missing decision and shows priority and addressee when available, linked-requirement count and current next-step status

#### Scenario: A closed question is reopened
- **WHEN** a user finds a closed GAP through the existing closed filter and explicitly reopens it in the panel
- **THEN** its common state updates and it appears in the open queue without creating a new GAP

### Requirement: One panel supports the whole question journey
The common question panel SHALL use the shared review draft for manual answers, explicit AI clarification, reviewing and editing linked requirements, individual confirmations, resolution, dismissal with a reason and reopening. Linked edits SHALL stay in recoverable subviews and preserve drafts on return.

#### Scenario: Manual clarification without AI
- **WHEN** AI is disabled and a user opens an outstanding GAP
- **THEN** the user can enter an answer, inspect and edit linked requirements, confirm dispositions and close the GAP under the existing resolution conditions
- **AND** no AI step or new completeness check is required

#### Scenario: Edit a linked requirement
- **WHEN** a user enters an answer and opens «Редактировать FR-004» from the question panel
- **THEN** FR-004 opens for editing within that workspace and the answer and all other pending edits remain intact
- **AND** returning to the question retains the selected GAP and current confirmation progress

#### Scenario: The question panel prioritizes the decision
- **WHEN** the user opens a GAP
- **THEN** the panel identifies the selected GAP and displays the missing decision, associated question text, priority and addressee when available, and the current answer before detailed linked-requirement confirmations

### Requirement: Preserve existing confirmation and closure semantics
GAP resolution SHALL require a nonempty answer, a current explicit disposition for each uniquely linked requirement and no blocking partial clarification. A manual answer or ordinary accepted AI edit MUST NOT automatically resolve the GAP, confirm incorporation or change requirement quality. Dismissal and legacy closure SHALL remain distinct from resolution.

#### Scenario: Only one requirement has been checked
- **WHEN** a GAP links BR-001 and FR-004 and only BR-001 has a current confirmation
- **THEN** progress shows one of two requirements checked and resolution remains unavailable with the remaining action explained
- **AND** links from either direction are deduplicated before progress is counted

#### Scenario: Existing term is linked
- **WHEN** GAP-008 links BR-001 and an existing TERM-001
- **THEN** BR-001 requires confirmation while TERM-001 remains accessible evidence and does not add another required confirmation
- **AND** other existing context and analysis records are evidence as well, and truly missing references block resolution under existing validation

#### Scenario: Answer changes after confirmation
- **WHEN** the current answer changes after linked requirements have been confirmed
- **THEN** affected confirmations become pending and any existing resolution is invalidated according to the existing review rules
- **AND** changes to the question, linked requirements or linked set also invalidate confirmations according to the existing rules

#### Scenario: Question is dismissed instead of resolved
- **WHEN** the user explicitly removes a GAP from consideration with a reason
- **THEN** the decision is recorded as a dismissal and the UI does not claim that its answer was incorporated

#### Scenario: A requirement needs no change
- **WHEN** the reviewer chooses «Изменение не требуется» for a linked requirement
- **THEN** confirmation requires the existing reason

### Requirement: AI clarification has one explicit context
«Разобрать с AI» SHALL use the selected GAP’s discussion history and current draft, with generation starting only after an explicit start or send action. Clarification SHALL preserve validated proposals, before/after review, stale-context rejection and explicit acceptance.

#### Scenario: Open a question without generating
- **WHEN** the user opens GAP-006 and selects its AI clarification subview
- **THEN** GAP-006 and its history are identified and no new generation starts until the user explicitly starts or sends a turn
- **AND** switching to a different GAP likewise does not start generation

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
- **AND** the preview identifies the answer, edits, confirmations and selected GAP closure included in acceptance

#### Scenario: Proposal is stale or incomplete
- **WHEN** context changes before acceptance or a package leaves unresolved questions or linked requirements
- **THEN** stale changes are rejected without partial application and an incomplete accepted package does not falsely close the GAP
- **AND** accepting an ordinary proposal also leaves the GAP open

#### Scenario: User opens a general requirement discussion
- **WHEN** the user selects «Обсудить требование с AI» on a requirement
- **THEN** it opens the general requirement discussion separately from a particular GAP resolution

### Requirement: Content editing and quality assessment are distinct
A requirement SHALL offer visible «Редактировать» for wording and supported substantive fields and a separate «Пересмотреть оценку» for quality. Content edits MUST NOT change quality implicitly. A quality decision MUST NOT close a GAP or confirm an answer. Both actions SHALL follow the shared draft and global save. Original evidence SHALL remain read-only.

#### Scenario: Business success indicator is edited
- **WHEN** a user edits BR-001's wording and long success indicator and applies those edits
- **THEN** both values enter the draft, the success indicator is readable without horizontal field scrolling, and the previous quality remains unchanged
- **AND** BR success indicators use a full-width multiline field that shows the complete value

#### Scenario: User reconsiders quality
- **WHEN** a user selects «Готово» through «Пересмотреть оценку» while linked questions remain open
- **THEN** quality changes in the draft, questions retain their states, and the interface visibly distinguishes those facts
- **AND** the existing quality choices each explain their meaning concisely

#### Scenario: User saves an unfinished hidden edit
- **WHEN** a valid unfinished requirement edit is hidden by selecting another requirement or opening a question and global Save is activated
- **THEN** the existing draft assembler includes that edit; invalid required fields prevent saving and are revealed with focused errors

### Requirement: Return to the exact entry context
The question panel SHALL preserve its entry context and pending edits. Close, Escape and back-to-question actions SHALL restore focus to an available originating control, or an appropriate nearby control if the origin is gone. Saving and rejecting edits SHALL remain explicit. Task switches SHALL retain the existing dirty-draft guard.

#### Scenario: Open from a filtered registry
- **WHEN** a user opens a GAP from FR-004 under an FR filter and search, edits a linked requirement and closes the panel
- **THEN** the original registry view, selection, filters and scroll are restored with pending edits intact and focus returns to the entry action
- **AND** the restored registry keeps the originating review section and search, type and clarification filters

#### Scenario: Open from a filtered question queue
- **WHEN** a user opens a question midway through the open queue and closes it
- **THEN** the queue retains its filter and scroll position without jumping to the first GAP

#### Scenario: Entry disappears after resolution
- **WHEN** the panel was opened from the open queue and its GAP closes before the panel is dismissed
- **THEN** the closed GAP leaves that filtered queue and focus returns to an available queue control without losing other pending work
- **AND** focus returns to the nearest available control in the appropriate section

#### Scenario: A task question link is followed
- **WHEN** a supported task link targets an existing GAP or associated QUESTION without a previous UI origin
- **THEN** the task's question context and corresponding GAP panel open, while a missing target produces a recoverable explanation
- **AND** the links work without an in-memory origin, and invalid targets are explained without discarding edits

#### Scenario: Return from a question subview
- **WHEN** the user goes back to the question after opening a linked editing or AI subview
- **THEN** draft changes are preserved and focus returns to an available originating control

#### Scenario: User switches to a different task
- **WHEN** the user selects another task while a question panel is open
- **THEN** the existing dirty-draft guard still applies and the previous task’s selection and panel context do not carry over

### Requirement: Saved state and semantic completion remain separate
The UI SHALL distinguish «Ответ добавлен», «Ответ учтён», «Вопрос закрыт», requirement quality and version saving. Panel changes SHALL stay in the shared unsaved draft until the global save succeeds. Save failures and remote conflicts SHALL preserve the draft and existing recovery actions.

#### Scenario: Panel is closed before saving
- **WHEN** a user answers and resolves a GAP and closes its panel without a global save
- **THEN** the resolution is reflected in both entry points as draft state and the workspace indicates unsaved changes

#### Scenario: Save fails or conflicts
- **WHEN** a version save fails or another client has saved a newer version
- **THEN** panel-related edits remain available and saved status is not falsely displayed

#### Scenario: Saved review is reopened and exported
- **WHEN** a user saves a valid clarification, reloads the task and exports its saved version
- **THEN** the answer, dispositions and GAP decision restore consistently and the export contains the complete saved registry
- **AND** existing task/version loading restores saved questions and confirmations, and export includes all authoritative saved decisions and records regardless of question selection or filtering

#### Scenario: Finalization has unresolved work
- **WHEN** the user finalizes a version that still contains unresolved work
- **THEN** the existing acknowledgment is required and closing every question is not an additional precondition

### Requirement: Preserve current visual language and accessible operation
Changes SHALL be limited to editable stage-two BABOK and required shared components. They SHALL reuse product styles and preserve the contracts of final, read-only, legacy and linked-research views. New controls SHALL support keyboard use with visible focus and meaningful Russian names. Only one modal interaction surface SHALL own focus at a time.

#### Scenario: Existing design is retained
- **WHEN** the updated registry, question queue and question panel are compared with the application's current appearance in the same viewport
- **THEN** existing palette, type styles, controls and panel treatments remain consistent and only the specified content hierarchy and flow differ
- **AND** the demo prototype informs information hierarchy and interactions only, while the product retains its palette, typography, spacing, radii, buttons, status colors and panel styling

#### Scenario: Keyboard and narrow-screen operation
- **WHEN** a user opens the panel, enters a linked editor or AI subview and returns using the keyboard on a narrow screen
- **THEN** focus remains within the active interaction surface, controls and long text fit without horizontal page overflow, and closing restores focus to the entry context
- **AND** only one modal surface owns focus even in the AI and linked-requirement editing subviews

#### Scenario: Other workflow surfaces are opened
- **WHEN** the user views a final editor, read-only research snapshot, legacy result or linked-research stage
- **THEN** their existing presentation and actions remain available without accidental introduction of the new editable question workflow

#### Scenario: Question workspace reflows at supported widths and zoom
- **WHEN** the user opens the question workspace at 320, 390, 768, 1024 or 1440 CSS pixels or at 200 percent browser zoom
- **THEN** content reflows without horizontal page overflow
