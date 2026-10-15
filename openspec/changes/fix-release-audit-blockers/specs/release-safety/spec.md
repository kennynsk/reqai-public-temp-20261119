## Purpose

Ensure a release candidate preserves user decisions and source text and obeys diagnostic and deployment security boundaries.

## ADDED Requirements

### Requirement: Build dependencies preserve interface behavior without known advisories
The frontend build SHALL use dependency versions without known npm audit findings at qualification time and SHALL preserve readable responsive layouts, form controls, focus indicators and review actions during the Tailwind migration.

#### Scenario: Tailwind dependency migration
- **WHEN** the migrated frontend is built and opened against the existing local API
- **THEN** dependency audits report no findings and the context, requirements, research and final-version screens remain usable at desktop and narrow widths

### Requirement: Cancelling a field edit preserves review decisions
The application SHALL leave the requirement and its review decisions unchanged when the user cancels only a provisional field edit, while retaining unrelated accepted changes.

#### Scenario: Cancel after a saved clarification
- **WHEN** a user edits a requirement with incorporated clarification evidence and cancels the edit
- **THEN** the original evidence remains incorporated and the cancelled edit does not make the workspace dirty

### Requirement: Materials retain valid text without unsupported binary admission
The system SHALL preserve multibyte UTF-8 characters across storage boundaries and SHALL reject empty, malformed or unsupported binary materials before LLM execution.

#### Scenario: Multibyte storage boundary
- **WHEN** a Russian character or emoji spans storage chunks
- **THEN** source text is reconstructed without replacement characters

#### Scenario: Unsupported file
- **WHEN** a user submits PDF, DOCX, invalid UTF-8 or whitespace-only input as a material
- **THEN** the system rejects it with an actionable error before a model job is accepted

### Requirement: Non-obligation text does not block source coverage
The system SHALL allow explicitly justified source fragments that contain no product obligation while still requiring coverage of every substantive condition.

#### Scenario: Dated audit heading
- **WHEN** context includes a dated heading followed by business requirements
- **THEN** the heading can be classified as non-obligation and the business requirements are independently checked

### Requirement: Ordinary diagnostics do not carry artifact text
The system SHALL expose only controlled structural metadata in ordinary diagnostics, including historical reads; free-form model explanations SHALL NOT be copied into ordinary workflow metadata.

#### Scenario: Semantic failure quotes source
- **WHEN** a validator returns a free-form reason containing source text
- **THEN** base trace and workflow metadata omit that reason while retaining safe codes and record identifiers

### Requirement: Role-scoped production credentials and writable runtime paths
Deployment manifests SHALL give LLM credentials only to API/discussion and workflow workers and SHALL provide writable Nginx runtime paths under its non-root read-only security context.

#### Scenario: Event and maintenance credentials
- **WHEN** production worker manifests are rendered
- **THEN** event and maintenance roles cannot receive LLM credentials through env or shared secret imports

#### Scenario: Read-only frontend
- **WHEN** the production frontend starts as uid 101 with read-only root
- **THEN** its configured temporary and PID directories are writable without relaxing root filesystem protections
