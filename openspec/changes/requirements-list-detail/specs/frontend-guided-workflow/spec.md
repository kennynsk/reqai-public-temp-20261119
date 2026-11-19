## MODIFIED Requirements

### Requirement: Focused desktop requirements editor
The stage-two requirements review SHALL prioritize reading and editing with a compact four-stage indicator, a single «Требования» heading, save status, source-context access and grouped actions. The editable BABOK registry SHALL use type filters, a searchable requirement selector and the details of one selected record, as specified by `requirements-list-detail`. It SHALL NOT expose a second layout selector on stage two. All six BABOK types SHALL remain accessible including adding to empty types. The legacy stage-two editor SHALL retain its existing compact type-filtered presentation. Existing final-editor layout controls, persisted preferences and read-only source snapshots SHALL remain unchanged.

#### Scenario: User begins reviewing a decomposition
- **WHEN** a completed decomposition is displayed on a desktop viewport
- **THEN** the user sees the persistent stage-two indicator, source access and requirements as the dominant content; BABOK records appear as a selector beside the selected detail

#### Scenario: User reviews decomposed categories
- **WHEN** the editable BABOK registry opens with all types included
- **THEN** all nonempty categories are represented in the selector and every requirement remains editable and removable through its detail

#### Scenario: User switches to stacked rows
- **WHEN** the user selects «По типам» in the final editor
- **THEN** the existing final-editor layout and stored preference are preserved independently of the stage-two selection and filters

#### Scenario: User adds a requirement
- **WHEN** the user activates «Добавить требование» on stage two
- **THEN** the user can select any supported type, open its composer and dismiss it without changing the registry

#### Scenario: Historical format or immutable input
- **WHEN** the user opens a legacy registry or a read-only research input snapshot
- **THEN** the existing format-specific view and mutation restrictions remain in force

## ADDED Requirements

### Requirement: Skill-driven requirements review
Editable stage-two and final BABOK views SHALL present the existing skill’s decomposition and checks for editing requirements and deciding GAPs. They MUST NOT require separate completeness review, expose a coverage-check launcher, show unchecked completeness or infer semantic completeness from successful processing.

#### Scenario: Work with a decomposition
- **WHEN** a user opens a saved BABOK decomposition or its editable final version
- **THEN** they can work with requirements and questions without a manual completeness widget or checkbox, and saving/finalization does not depend on a completeness mark

#### Scenario: Historical manual review
- **WHEN** a saved version contains earlier manual review marks or omission notes
- **THEN** those values survive subsequent edits under the existing versioning rules and remain available in the exported history

#### Scenario: Version has no manual review history
- **WHEN** a new version has no recorded manual checks or omissions and is exported
- **THEN** the export includes only recorded review history and adds no unchecked completeness status

#### Scenario: Limited source processing
- **WHEN** processing is partial or an input material is unavailable
- **THEN** the workspace still exposes that limitation without asking every user to manually compare the entire registry

#### Scenario: User reviews or edits skill output
- **WHEN** the user opens an editable BABOK review or final view
- **THEN** source access, evidence, manual requirement creation and GAP handling remain available
