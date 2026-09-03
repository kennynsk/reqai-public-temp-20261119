## Purpose

Let users assess AI research with honest evidence labels and deliberately transform suggestions into traceable, editable requirements before saving a final version.

## ADDED Requirements

### Requirement: Exact proposal preview before acceptance
Acceptance SHALL require a review surface showing target type, related records, rationale, exact final wording and whether the operation adds or changes a requirement. Users SHALL be able to edit supported fields before confirmation. Existing target references MUST NOT be interpreted as permission to overwrite records. The exact comparison SHALL remain readable without clipped labels or per-character wrapping and SHALL adapt from a multi-column diff to grouped before/after fields when the available width is insufficient.

#### Scenario: Suggestion contains an instruction to the analyst
- **WHEN** proposed text contains wording such as «Предложить уточнить…»
- **THEN** the user is prompted to review its suitability and can edit the exact text before accepting

#### Scenario: User chooses to change an existing requirement
- **WHEN** a user selects an existing target for replacement
- **THEN** old and new fields are shown as a diff and replacement requires explicit confirmation

#### Scenario: Collapsed enhancement is selected
- **WHEN** acceptance is activated from a collapsed card
- **THEN** proposal review opens and no requirement is accepted until the exact outcome is confirmed

#### Scenario: Proposal diff opens on a narrow viewport
- **WHEN** proposal review opens at 390 CSS pixels wide or at 200 percent zoom
- **THEN** each changed field presents its label, previous value and proposed value together in a readable vertical comparison, all text remains available without per-character wrapping, and cancel/confirm actions remain reachable within the dialog

### Requirement: Deterministic and reversible proposal decisions
Saved decisions SHALL retain the original suggestion, edited wording, decision, affected IDs and research/base-version lineage. Repeated acceptance or saving SHALL NOT duplicate an enhancement. Reversing a saved decision SHALL preview its impact; manually changed records MUST NOT be silently deleted or reset.

#### Scenario: Edited suggestion is saved and reloaded
- **WHEN** the user accepts edited wording and saves a final version
- **THEN** the exact wording and lineage are restored and later saves do not append a duplicate

#### Scenario: Accepted requirement has manual revisions
- **WHEN** the user reverses acceptance after manually editing the resulting requirement
- **THEN** affected content is shown and removal requires confirmation or an explicit decision to retain it as a manual record

### Requirement: Honest applicability and evidence labels
Applicability percentages SHALL be labelled as model estimates, not calibrated probabilities or verified measurements. Available rationale SHALL be shown; absence SHALL be stated. Source type labels SHALL remain distinct from citations. Citations SHALL show title, safe HTTP(S) URL, publication date when known and verification status; missing fields MUST NOT be invented.

#### Scenario: Legacy result has only source types
- **WHEN** an insight contains «Кейс» or «Исследования» but no citation
- **THEN** the UI states that sources were not supplied and does not imply these labels verify the claims

#### Scenario: A model supplies a citation
- **WHEN** a result includes a source URL
- **THEN** it is initially labelled unverified and model output alone cannot mark it checked

#### Scenario: User records a source check
- **WHEN** the user records manual source verification
- **THEN** the saved decision includes source reference, authenticated reviewer, time and note without implying automated validation

#### Scenario: Citation uses an unsafe URL
- **WHEN** a citation uses a non-HTTP(S) execution-capable scheme
- **THEN** it is not actionable and no automatic external request occurs

### Requirement: Output review warnings preserve original content
The UI SHALL surface suspicious mixed-language wording and unsuitable proposal phrasing as warnings without silently rewriting output, discarding legitimate citations or starting hidden provider calls. Original output SHALL remain available alongside edits.

#### Scenario: Unexpected language fragment is present
- **WHEN** a Russian title contains an unexpected fragment such as «каналы协作»
- **THEN** it is flagged for review while original text and manual correction remain distinguishable

### Requirement: Research provider independence
Review and evidence metadata SHALL extend the application contract without binding the UI to a specific provider. Old research results without new fields SHALL remain usable. This change MUST NOT require a new external research API or change the MCP tool set.

#### Scenario: Old research result is reopened
- **WHEN** a saved result has only currently supported enhancement and source-type fields
- **THEN** it remains reviewable with missing-evidence labels and no automatic re-research
