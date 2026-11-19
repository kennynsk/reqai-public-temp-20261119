## ADDED Requirements

### Requirement: Targeted repair of missing parent traceability

BABOK decomposition SHALL distinguish typed hierarchy edges from functional constraint edges. If a requirement lacks a qualifying parent relation and a linked gap, semantic repair SHALL receive a dedicated finding for the affected requirement.

#### Scenario: An NFR constrains a function and refines a need
- **WHEN** available evidence supports both relations
- **THEN** the generation example guides the model to express both types in the traceability array

#### Scenario: The parent relationship is missing
- **WHEN** there is no qualifying parent edge or linked gap
- **THEN** repair guidance requests a supported typed edge or a gap explaining the missing context
- **AND** the finding alone does not permit removing the requirement
