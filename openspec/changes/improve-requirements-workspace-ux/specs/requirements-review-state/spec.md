## Purpose

Protect requirement edits and review decisions throughout navigation, saving, restoration and finalization while preserving authoritative immutable versions.

## ADDED Requirements

### Requirement: Unified unsaved review state
The workspace SHALL track changes to text, fields, additions, removals, GAP answers and improvement decisions in one draft. Switching type, layout or review section or opening source details SHALL retain the draft. Unsaved changes MUST NOT be marked saved, sent to research or used to navigate to a final version.

#### Scenario: Changed card survives category switching
- **WHEN** the user edits BR-001 without closing the card editor and switches BR to FR and back
- **THEN** the edited wording is retained, the workspace indicates unsaved changes, and research and finalization remain unavailable

#### Scenario: Local editor is closed
- **WHEN** the user confirms a valid field edit within a card
- **THEN** the field becomes part of the working draft without implying that a server version has been saved

#### Scenario: User cancels one editing session
- **WHEN** the user cancels editing a card
- **THEN** only changes from that editing session are reverted and other pending edits remain intact

#### Scenario: User saves the final version from a research draft
- **WHEN** the user explicitly saves the final version with pending research decisions or edits
- **THEN** the system validates and persists the decisions and edits atomically before showing completion

### Requirement: Atomic validated version save
Global save SHALL include every valid pending field and review decision in one immutable version. Validation failure SHALL prevent submission and identify the invalid field. Save failure SHALL retain the draft. The new web client SHALL use replay-safe saves and an expected latest version precondition; a stale precondition MUST NOT silently supersede the current server revision. Existing clients omitting the optional fields SHALL remain supported.

#### Scenario: Multiple cards have pending edits
- **WHEN** the user saves while valid edits exist in multiple types
- **THEN** one persisted version includes all of them and saved status appears only after successful server confirmation

#### Scenario: One required field is empty
- **WHEN** the user attempts to save an invalid draft
- **THEN** no version is created and the affected editor opens with a focused validation error

#### Scenario: Save response is lost
- **WHEN** an acknowledged-or-unknown save is retried with the same mutation identity and content
- **THEN** at most one new version exists and the client can recover its authoritative result

#### Scenario: Another client saved a newer revision
- **WHEN** the expected latest version differs from the server's current revision
- **THEN** saving returns a conflict, preserves local edits and offers explicit comparison and reconciliation

### Requirement: Safe navigation and session restoration
Application navigation away from a dirty review SHALL offer save, discard or stay. Browser reload/close SHALL warn when unsaved changes remain. A same-tab reload SHALL offer restoration of a non-expired session draft without marking it saved. Restoration SHALL be scoped to the authenticated user and job, expire after 24 hours, and be cleared on sign-out or explicit discard. Cross-client restoration SHALL load server versions only.

#### Scenario: User selects another task
- **WHEN** the user selects history or New task while dirty
- **THEN** the transition requires save, explicit discard or staying on the current task

#### Scenario: Page reloads with a recoverable draft
- **WHEN** the same user reloads the task in the same tab
- **THEN** the workspace offers the draft against its recorded base without overwriting a newer server version automatically

#### Scenario: Session storage cannot be used
- **WHEN** browser policy or quota prevents storing the draft
- **THEN** edits remain in memory, a recovery limitation is shown, and leaving still warns about unsaved data

#### Scenario: Account changes
- **WHEN** the user signs out or another account becomes active
- **THEN** the previous account's draft is cleared and cannot appear in the new account's workspace

### Requirement: Structured requirement editing and safe deletion
Users SHALL be able to edit supported type-specific fields, quality and valid relationships, while original source citations remain read-only evidence. Manual changes SHALL preserve stable IDs and record their provenance. Deletion SHALL disclose affected references, leave no dangling links after confirmation, and allow undo before save without reusing the deleted ID.

#### Scenario: User edits a transition requirement
- **WHEN** the user changes TR wording and its completion criterion
- **THEN** both fields are persisted together, retaining the TR ID and original evidence

#### Scenario: Related record is deleted then restored
- **WHEN** the user confirms deletion after reviewing incoming links and then chooses Undo
- **THEN** the record and affected relationships return to the pre-deletion draft state

### Requirement: Explicit gap review decisions
Each GAP SHALL expose related requirements, questions, priority and addressee where available. Users SHALL be able to answer and explicitly close or reopen a gap with a reason. Answering alone MUST NOT close a gap or alter a requirement. Answers and decisions SHALL be saved with the version and remain distinct from original model analysis.

#### Scenario: User answers a clarification
- **WHEN** an answer is entered for a GAP
- **THEN** the answer is pending save, related requirements are reachable, and the gap remains open until explicitly closed

#### Scenario: User closes a gap
- **WHEN** the user provides a closure reason and saves
- **THEN** the version records the answer, decision, affected IDs and authoritative actor/time and restores them after reload

### Requirement: Finalization acknowledges remaining review work
Finalization SHALL distinguish document saving from semantic approval. If open gaps or requirements marked as needing clarification, conflicting or not testable remain, the user SHALL acknowledge their current list before finalizing. The acknowledgment SHALL be tied to the saved review revision and invalidated by relevant edits.

#### Scenario: User finalizes with open questions
- **WHEN** open review items remain at finalization
- **THEN** the user can deliberately retain them, and the final version and export include them without claiming all requirements are approved

#### Scenario: Acknowledged questions change
- **WHEN** a new revision changes the open review items
- **THEN** previous acknowledgment is not treated as approval of the changed list

### Requirement: Honest completeness review
The workspace SHALL allow side-by-side inspection of available source text and requirements and record whether completeness was checked by the user. Processing success MUST NOT be presented as proof that every source obligation is covered. Users SHALL be able to flag an omission and add a manual requirement without rewriting the original AI result.

#### Scenario: Room reopening is missing
- **WHEN** the source asks for closing and reopening rooms but the registry only contains closing
- **THEN** the user can inspect both statements, flag the omission and add a traceable requirement; processing success does not mark completeness as checked

#### Scenario: Reviewed content changes
- **WHEN** source context or requirements change after a manual completeness check
- **THEN** the prior check remains in history but the changed revision is marked as requiring a new check

### Requirement: Compatible version review metadata
New review metadata SHALL be versioned, validated and authorized server-side. Revisions SHALL preserve enhancement decisions, direct-final markers, material lineage and compatible review metadata inherited from their base. Existing artifacts and API/MCP consumers SHALL remain readable without new required fields.

#### Scenario: Older client saves from a reviewed base
- **WHEN** an older client creates a revision without new review metadata
- **THEN** inherited review evidence is not discarded, while acknowledgments invalidated by content changes are marked stale

#### Scenario: Review references an inaccessible record
- **WHEN** review references are outside the authorized base and research lineage
- **THEN** the request is rejected without revealing unrelated records or creating a version
