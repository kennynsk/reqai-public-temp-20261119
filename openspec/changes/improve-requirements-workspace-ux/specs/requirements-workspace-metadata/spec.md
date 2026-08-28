## Purpose

Make authorized business workflows recognizable and searchable across sessions while retaining existing job identity and decomposition-to-research lineage.

## ADDED Requirements

### Requirement: Persistent human-readable workflow titles
Each workflow SHALL display an editable title derived from context or the primary filename without an extra model call. Changes SHALL persist server-side independently of immutable source artifacts. Trimmed titles SHALL be 1 to 120 characters; invalid changes SHALL be rejected. Older workflows without usable context SHALL receive a localized type-and-date fallback.

#### Scenario: Room-booking task is created
- **WHEN** a task is submitted with a room-booking brief
- **THEN** history displays a meaningful context-derived title rather than only the generic workspace name

#### Scenario: Title is renamed and reopened elsewhere
- **WHEN** the user renames a workflow and opens it in another authorized browser
- **THEN** the saved title appears for the parent and research without changing job IDs or URLs

#### Scenario: Conflicting metadata edit occurs
- **WHEN** two clients update a title using the same metadata revision
- **THEN** the stale update is rejected with a recoverable conflict

### Requirement: Searchable grouped workflow history
History SHALL group decomposition, linked research and saved final versions under the existing parent workflow while retaining direct stage navigation. Search SHALL match authorized titles or summaries across full server-side history, not only the loaded page. Filters and pagination SHALL preserve the query and avoid duplicate or missing entries within a stable dataset.

#### Scenario: User searches an older workflow
- **WHEN** the user searches for «переговорные» and the matching workflow is outside the loaded page
- **THEN** it appears with its saved title and stage status

#### Scenario: User expands a workflow
- **WHEN** a grouped entry contains research and saved versions
- **THEN** the user can explicitly navigate to parent, research or final version and existing canonical URLs remain valid

#### Scenario: Parent is no longer available
- **WHEN** an accessible research job has no accessible retained parent
- **THEN** the child remains discoverable without displaying unavailable or unauthorized parent information

### Requirement: Authorized and compatible history metadata
Metadata reads, writes and searches SHALL retain tenant/owner boundaries and role permissions. New grouping and search options SHALL be additive; existing job-list clients SHALL keep their ungrouped contract. The system MUST NOT introduce a second task identity for titles or grouping.

#### Scenario: Search could match another tenant
- **WHEN** a search matches another tenant's workflow title
- **THEN** neither that workflow nor its title, counts or lineage appears in results

#### Scenario: Existing MCP client lists jobs
- **WHEN** a client uses the existing job-list request without new options
- **THEN** its response preserves the existing shape and canonical job identifiers
