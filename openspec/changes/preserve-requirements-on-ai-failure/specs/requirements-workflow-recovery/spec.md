## Purpose

Keep the requirements workflow usable after recoverable AI generation and validation failures while preserving review and version history.

## ADDED Requirements

### Requirement: Continue after AI decomposition failure

After validated input, exhausted model execution or output validation SHALL yield a partial web result with a manual requirements editor. Available section responses SHALL be identified as unverified and SHALL require manual review and entry before they become requirements.

#### Scenario: Model yields no usable section
- **WHEN** every model call fails or yields no usable section
- **THEN** the user can add and save requirements manually with the original business context available

#### Scenario: Consolidation cannot be verified
- **WHEN** the contract or semantic checks reject consolidation after recovery attempts
- **THEN** the user can review available formulations one by one, edit their type and fields, and explicitly add selected items to the manual registry

#### Scenario: The draft contains plain text
- **WHEN** an available section response contains text without a requirement type
- **THEN** the user selects its type before adding the formulation to the registry

#### Scenario: Review queue is exhausted
- **WHEN** the user adds formulations of different types from the review queue
- **THEN** the registry shows all types and selects the newly added requirement
- **AND** the queue is hidden once no formulations remain to review

#### Scenario: Saved review is reopened
- **WHEN** the user edits and adds a formulation, saves the requirements version, and reopens the task
- **THEN** the saved requirement remains in the registry and its original formulation is excluded from the review queue

### Requirement: Continue after linked research failure

When AI research cannot produce a valid result after bounded recovery, the system SHALL offer the exact saved input version for editing and finalization and SHALL offer no unverified research proposals for acceptance.

#### Scenario: Persistent invalid research output
- **WHEN** the research response remains unusable after the correction budget
- **THEN** the web result is marked partial and the user can save a final version derived from the saved input

### Requirement: Repair the response at the failing stage

The system SHALL apply the existing response repair budget to invalid research JSON and the existing audit response repair budget to missing or invalid audit coverage.

#### Scenario: Audited revision does not match
- **WHEN** the auditor returns coverage for a different revision
- **THEN** the system requests a corrected audit for the same candidate before using any substantive audit findings to change the candidate
