## Purpose

Обеспечить контекстное обсуждение требований и пробелов с AI с сохранением истории и явным принятием проверяемых предложений в пользовательский черновик.

## ADDED Requirements

### Requirement: Contextual discussion entry points
The system SHALL provide «Обсудить с AI» for an existing requirement or GAP in an editable task, identify the selected record in the discussion panel, and preserve navigation and unsent messages when switching records. Opening the panel MUST NOT start generation. Read-only task views SHALL NOT allow generation or applying edits.

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
The system SHALL distinguish explanatory messages from validated edit proposals. Proposals SHALL identify existing target requirements, changed fields, rationale and a before/after comparison. They MUST NOT invent source citations, directly mutate requirements, change record identifiers or evidence, or close GAPs.

#### Scenario: Insufficient information
- **WHEN** the user provides only a one-year horizon for a missing success metric
- **THEN** AI can request the missing metric instead of presenting an invented target as a confirmed fact
- **AND** no requirement or GAP state changes from the conversational response

#### Scenario: Unsupported proposal
- **WHEN** AI proposes an unknown record, an unsupported field, or malformed changes
- **THEN** the proposal cannot be applied and the user can continue discussion or retry

### Requirement: Explicit atomic acceptance into draft
The system SHALL apply a validated proposal only after the user reviews and accepts the entire proposed package. All targeted changes SHALL enter the shared draft atomically, preserve source evidence and unrelated edits, and remain unsaved until the normal version-save action. GAP closure SHALL remain a separate user decision.

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
The system SHALL present a shared, deduplicated checklist of every requirement linked to a GAP, through either direction of the relationship, in manual and AI-assisted review. Each item SHALL require explicit user confirmation of «Ответ учтён» or «Изменение не требуется»; the latter MUST include a reason. Accepting AI edits MUST NOT automatically confirm checklist items. Closing a GAP as resolved SHALL require a nonempty answer and current confirmations for all linked requirements. This behavior SHALL work with AI disabled.

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

### Requirement: Resolution confirmations track their basis
The system SHALL bind each confirmation to the current GAP question, answer and checked requirement. Changing the question or answer SHALL invalidate all confirmations; changing a requirement SHALL invalidate its own confirmation. Added links SHALL require review and unresolved deleted references MUST NOT silently count as completed. A resolved GAP with invalidated confirmations SHALL return to answered or open state while retaining its prior resolution in history. Client and server SHALL enforce these rules and save confirmations with requirement changes atomically.

#### Scenario: Answer changes after resolution
- **WHEN** the answer to a resolved GAP-002 changes
- **THEN** both SR-003 and FR-005 confirmations become pending and the GAP reopens with an explanation

#### Scenario: One requirement changes
- **WHEN** FR-005 changes after its confirmation while SR-003 remains unchanged
- **THEN** FR-005 requires another review while the SR-003 confirmation remains current

#### Scenario: Linked requirement disappears
- **WHEN** a checked requirement is deleted but its GAP reference remains
- **THEN** the unresolved reference blocks resolution until the user explicitly repairs the relationship

### Requirement: Resolution differs from dismissal and legacy closure
The system SHALL distinguish checklist-based resolution from dismissing a question with a mandatory reason. A GAP with no linked requirements SHALL NOT qualify for automatic checklist completion. Previously closed GAPs without checklist data SHALL remain readable as legacy decisions and MUST NOT receive fabricated confirmations.

#### Scenario: Explicit dismissal
- **WHEN** a user removes a question from consideration with a reason
- **THEN** the decision is recorded as dismissed and does not claim that its answer was incorporated into requirements

#### Scenario: Legacy saved version
- **WHEN** an older saved version contains a closed GAP without confirmations
- **THEN** the interface preserves that decision and identifies the missing per-requirement review history
