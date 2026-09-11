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
