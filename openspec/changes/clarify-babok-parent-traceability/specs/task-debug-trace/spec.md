## ADDED Requirements

### Requirement: Missing parent relationship in the task journal

The journal SHALL show a distinct message for a missing parent relationship and the affected requirement ID when the finding contains one.

#### Scenario: A repair is triggered by a traceability gap
- **WHEN** the semantic precheck flags a missing parent relationship
- **THEN** the journal shows the traceability issue with the requirement ID
