## Purpose

Обеспечить контекстное обсуждение требований и пробелов с AI с сохранением истории и явным принятием проверяемых предложений в пользовательский черновик.

## ADDED Requirements

### Requirement: Contextual discussion entry points
The system SHALL provide «Обсудить с AI» for an existing requirement and «Помочь уточнить» for an open GAP in an editable task, identify the selected record in the discussion panel, and preserve navigation and unsent messages when switching records. Opening the panel MUST NOT start generation. Read-only task views SHALL NOT allow generation or applying edits.

#### Scenario: Open and switch discussion
- **WHEN** the user opens discussion from GAP-001 and then BR-001
- **THEN** each panel identifies its anchor and shows its own history and unsent message without mixing conversations
- **AND** no LLM request starts until the user sends a message

#### Scenario: Accessible narrow-screen panel
- **WHEN** the panel opens on a narrow screen or through keyboard navigation
- **THEN** its title and close action remain accessible, focus enters the panel and returns to its trigger on close, and the editor remains recoverable without horizontal page overflow

### Requirement: Explicit current context
The system SHALL ground each turn in a snapshot of the selected record, current draft values, directly related requirements, associated GAP questions and answers, and available source evidence. It MUST identify unsaved content and omitted context and MUST NOT silently substitute a saved version for invalid in-progress edits.

#### Scenario: Discuss unsaved edits
- **WHEN** a user sends a message with valid unsaved requirement edits and an updated GAP answer
- **THEN** the turn uses those edits and that answer and identifies their unsaved status

#### Scenario: Context exceeds budget
- **WHEN** related materials exceed the configured context budget
- **THEN** the user can see which context was omitted
- **AND** if the selected record and mandatory question context cannot fit, the request is blocked with an actionable explanation instead of silent truncation

### Requirement: Durable scoped history
The system SHALL persist discussion history per task and anchor record across reloads and requirement versions, preserving the context version for each turn. Access MUST follow task tenant and owner permissions. Deleting a task SHALL apply its data-retention policy to discussion history.

#### Scenario: Resume after saving a version
- **WHEN** the user reopens a discussion after saving another requirement version
- **THEN** earlier messages remain visible with their original context and the next message uses the current draft

#### Scenario: Foreign task access
- **WHEN** a caller attempts to read or generate in another tenant's or inaccessible owner's discussion
- **THEN** access is denied without disclosing messages, source fragments or record content

### Requirement: Discussion and proposed edits remain separate
The system SHALL distinguish explanatory messages from validated edit proposals. Proposals SHALL identify existing target requirements, changed fields, rationale and a before/after comparison. They MUST NOT invent source citations, directly mutate requirements, change record identifiers or evidence, or close GAPs without explicit user acceptance of a guided resolution package.

#### Scenario: Insufficient information
- **WHEN** the user provides only a one-year horizon for a missing success metric
- **THEN** AI can request the missing metric instead of presenting an invented target as a confirmed fact
- **AND** no requirement or GAP state changes from the conversational response

#### Scenario: Unsupported proposal
- **WHEN** AI proposes an unknown record, an unsupported field, or malformed changes
- **THEN** the proposal cannot be applied and the user can continue discussion or retry

### Requirement: Explicit atomic acceptance into draft
The system SHALL apply a validated proposal only after the user reviews and accepts the entire proposed package. All targeted changes SHALL enter the shared draft atomically, preserve source evidence and unrelated edits, and remain unsaved until the normal version-save action. GAP closure SHALL remain an explicit user decision, which may be included in acceptance of a guided resolution package.

#### Scenario: Multiple target requirements
- **WHEN** a proposal modifies BR-001 and FR-002 and the user accepts it
- **THEN** both proposed changes are applied together, unrelated records are unchanged, and affected GAPs retain their existing states

#### Scenario: Reject or discard
- **WHEN** a user rejects a proposal or discards a draft containing accepted changes
- **THEN** rejection leaves requirements unchanged and discarding restores the normal draft baseline without deleting discussion history
- **AND** the UI no longer labels discarded changes as applied in the current draft

### Requirement: Stale proposals cannot overwrite edits
The system MUST check proposal context against current target records and associated GAP answers before application. Changed or deleted targets, changed answers, or a conflicting saved version SHALL invalidate application and require a new proposal. Repeated acceptance MUST NOT duplicate effects.

#### Scenario: Edit while AI is responding
- **WHEN** a target field or associated GAP answer changes after generation started
- **THEN** the original proposal is marked stale and cannot overwrite current content

#### Scenario: Repeated acceptance
- **WHEN** acceptance is submitted twice for the same proposal and draft
- **THEN** the package is applied at most once

### Requirement: Recoverable bounded generation
The system SHALL expose generating, completed, failed and cancelled states, permit cancellation and explicit retry, enforce configurable request/context/output limits, and allow at most one active generation per discussion. Reconnection MUST NOT duplicate messages or produce applicable proposals from incomplete responses.

#### Scenario: Network interruption and retry
- **WHEN** the network disconnects during a response and the user reconnects or retries
- **THEN** the original attempt is recoverable by identifier and completed turns are not duplicated
- **AND** failed or cancelled partial output cannot be applied as a proposal

#### Scenario: Limit reached
- **WHEN** a message or generation exceeds a configured limit
- **THEN** the system explains the limit and preserves the user's message for revision

### Requirement: Auditable saving and untrusted content
The system SHALL record proposal identity and user acceptance when proposed changes are saved in a version, distinguish local acceptance from persisted acceptance, and retain existing server-side validation and authorization. Model output and supplied materials MUST be treated as untrusted content, not executable instructions or authorization.

#### Scenario: Save accepted changes
- **WHEN** the user saves a valid draft containing accepted AI changes
- **THEN** the saved version records the proposal reference and acceptance actor and the UI marks the changes as saved

#### Scenario: Embedded instructions in material
- **WHEN** an input fragment or AI response contains instructions to execute commands, access other tasks or modify unrelated records
- **THEN** those instructions do not execute and cannot bypass scope or acceptance controls

### Requirement: Per-requirement GAP resolution checklist
The system SHALL present one deduplicated GAP checklist in manual and AI-assisted review. Each linked requirement SHALL have an explicit «Ответ учтён» or «Изменение не требуется» confirmation. «Изменение не требуется» SHALL require a reason. Ordinary AI edits MUST NOT confirm checklist items. Resolution SHALL require a nonempty answer and current confirmations for all linked requirements.

#### Scenario: GAP-002 affects two requirements
- **WHEN** GAP-002 links SR-003 and FR-005 and the user confirms only SR-003
- **THEN** progress shows one of two requirements checked and closing as resolved remains unavailable
- **AND** after confirming FR-005, closing as resolved becomes available without another duplicate closure reason

#### Scenario: One requirement needs no change
- **WHEN** the user updates SR-003 and determines FR-005 already meets the answer
- **THEN** the user can confirm SR-003 as incorporated and FR-005 as no-change with a reason without editing FR-005 solely to complete the checklist

#### Scenario: Accepted AI package
- **WHEN** an AI package updating both linked requirements is accepted
- **THEN** their updated text is available for review but checklist confirmation and GAP closure remain explicit user actions

#### Scenario: Checklist membership is independent of link direction and AI
- **WHEN** a GAP links to requirements through either direction and also references existing context or analysis records
- **THEN** the same checklist lists each linked requirement once and excludes the context and analysis records
- **AND** the checklist and its resolution rules remain available with AI disabled

#### Scenario: Guided package includes checklist confirmation
- **WHEN** a guided resolution package displays per-requirement confirmations for the user to review
- **THEN** explicit acceptance may confirm the displayed checklist together with the package

### Requirement: Resolution confirmations track their basis
The system SHALL bind each confirmation to the current GAP question, answer and requirement. A changed question or answer SHALL invalidate all confirmations. An edited requirement SHALL invalidate its own. A resolved GAP with invalid confirmations SHALL reopen as answered or open and retain its prior resolution in history. Client and server SHALL enforce these rules and save confirmations with changes atomically.

#### Scenario: Answer changes after resolution
- **WHEN** the answer to a resolved GAP-002 changes
- **THEN** both SR-003 and FR-005 confirmations become pending and the GAP reopens with an explanation
- **AND** the prior resolution remains in history

#### Scenario: One requirement changes
- **WHEN** FR-005 changes after its confirmation while SR-003 remains unchanged
- **THEN** FR-005 requires another review while the SR-003 confirmation remains current

#### Scenario: Linked requirement disappears
- **WHEN** a checked requirement is deleted but its GAP reference remains
- **THEN** the unresolved reference blocks resolution until the user explicitly repairs the relationship

#### Scenario: A requirement is newly linked
- **WHEN** the GAP gains a new linked requirement
- **THEN** the new requirement needs its own current confirmation before resolution

### Requirement: Resolution differs from dismissal and legacy closure
The system SHALL distinguish checklist-based resolution from dismissing a question with a mandatory reason. A GAP with no linked requirements SHALL NOT qualify for automatic checklist completion. Previously closed GAPs without checklist data SHALL remain readable as legacy decisions and MUST NOT receive fabricated confirmations.

#### Scenario: Explicit dismissal
- **WHEN** a user removes a question from consideration with a reason
- **THEN** the decision is recorded as dismissed and does not claim that its answer was incorporated into requirements

#### Scenario: Legacy saved version
- **WHEN** an older saved version contains a closed GAP without confirmations
- **THEN** the interface preserves that decision and identifies the missing per-requirement review history

### Requirement: Guided clarification of a GAP
A GAP discussion SHALL offer a ready-to-send starting action and accept plain-language answers. The model SHALL explain the missing decision, ask at most one concrete next question per turn and use the current GAP, associated questions, answers, linked requirements and available context records. It SHALL not invent business decisions. Opening the panel SHALL not start generation.

#### Scenario: User starts without knowing what to ask
- **WHEN** a user opens «Помочь уточнить» and activates «Начать уточнение»
- **THEN** a prepared request starts the contextual analysis and the user can answer the next question in the same panel

### Requirement: Explicit guided resolution package
A validated proposal MAY include a guided clarification. The UI SHALL show what acceptance applies and whether it closes the selected GAP. Acceptance SHALL atomically apply the answer, edits and displayed confirmations to the shared draft. A complete package SHALL close only the selected GAP. Persistence SHALL remain a separate normal save. Ordinary proposals SHALL retain their existing behavior.

#### Scenario: Complete multi-requirement answer
- **WHEN** the user accepts a current package covering every linked requirement with no remaining questions
- **THEN** the answer, edits and confirmations appear together in the draft and the GAP is resolved, with source evidence preserved

#### Scenario: Partial or stale package
- **WHEN** some questions or requirements remain unhandled, or context was omitted
- **THEN** acceptance SHALL NOT close the GAP
- **AND WHEN** the relevant answer, GAP, requirement or linked set changed after generation
- **THEN** the package SHALL be rejected as stale without partial application

#### Scenario: Context record referenced by a GAP
- **WHEN** a GAP references an existing TERM or CTX alongside requirements
- **THEN** that record remains accessible context and does not require a requirement confirmation
- **AND** a truly missing reference still prevents falsely completing the GAP

#### Scenario: Several accepted clarifications before saving
- **WHEN** the user accepts a partial clarification and then a complete clarification, or manually edits the accepted result before saving
- **THEN** saving SHALL preserve the final draft and earlier acceptance history without treating a superseded receipt as proof of the current answer or closure

#### Scenario: Completing a saved partial clarification
- **WHEN** the user explicitly accepts a fresh complete package after saving a partial answer
- **THEN** the server SHALL validate the new answer, changes and dispositions together, refresh their confirmation bases, and allow a fully checked question to be saved as resolved

#### Scenario: User previews a guided package
- **WHEN** a validated proposal contains a guided clarification
- **THEN** the before/after view shows the summarized answer, per-requirement dispositions and reasons, remaining questions and server-captured record bases
- **AND** the acceptance action identifies whether it closes the selected GAP or leaves it open

#### Scenario: A package proposes no edits
- **WHEN** a guided clarification will apply an answer without editing requirements
- **THEN** the package is allowed only if it includes explicit no-change reasons
