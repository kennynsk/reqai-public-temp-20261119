## Purpose

Make research suggestions distinguish new requirements from edits so users can review the exact effect before applying it to their draft.

## ADDED Requirements

### Requirement: Explicit proposal intent
New research proposals SHALL declare add or replace. Replacement SHALL identify one existing requirement of the same type. Related requirements SHALL NOT imply replacement. Replacement wording MUST retain original obligations and incorporate the improvement.

#### Scenario: Existing requirement improvement
- **WHEN** research improves an existing requirement
- **THEN** the result identifies that requirement and supplies a complete replacement wording and rationale

#### Scenario: Invalid target
- **WHEN** a replacement names an unknown target or a different requirement type
- **THEN** the response is rejected instead of converted into an addition

### Requirement: Visible exact change
Cards SHALL identify new requirements or changes to a specific ID. Changes SHALL show original and proposed wording before acceptance. Review SHALL default to the declared action and target while allowing explicit user override.

#### Scenario: Review replacement
- **WHEN** a user reviews a replacement
- **THEN** the card displays Было and Стало and the dialog selects replacement with the specified target

### Requirement: Reversible application
Replacement SHALL preserve record ID, links and untouched fields, and store the previous record for reversal. A missing target SHALL block application. Addition SHALL allocate a new ID.

#### Scenario: Undo replacement
- **WHEN** the user applies and then reverses a replacement
- **THEN** the original record is restored without creating a duplicate

### Requirement: Historical compatibility
Proposals without explicit intent SHALL remain readable with a visible indication that the action is unspecified. The user SHALL review the action; the default remains addition. Previously saved decisions SHALL take precedence over model intent.

#### Scenario: Historical related IDs
- **WHEN** an old proposal names related IDs but has no operation
- **THEN** the system does not infer a replacement from those IDs
