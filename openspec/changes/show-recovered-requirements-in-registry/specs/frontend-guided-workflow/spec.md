## ADDED Requirements

### Requirement: Recovered AI formulations in the requirements registry

The requirements stage SHALL show available typed formulations from an incomplete AI decomposition in the ordinary editable registry under their source types. One review notice SHALL explain that the user should check the draft against the business task. Explicitly linked questions SHALL be visible in the relevant requirement details and usable through the existing question workflow. The initial draft SHALL be editable and saveable as a whole.

#### Scenario: The result contains structured requirements and questions
- **WHEN** incomplete AI decomposition yields usable typed formulations
- **THEN** the registry contains the deduplicated formulations without individual acceptance
- **AND** only the relevant requirements show their explicitly linked questions

#### Scenario: Some response text has no usable type
- **WHEN** a response cannot be projected into typed requirements
- **THEN** the original response is available for inspection and the review notice explains that the user can consult it

#### Scenario: A draft or version is reopened
- **WHEN** the user edits, deletes, or saves recovered requirements and opens the same task again
- **THEN** those changes are retained and the response does not add the same requirements again

### Requirement: Typed traceability in recovered drafts

The recovered registry SHALL preserve the original relationship types and evidence for resolved endpoints.

#### Scenario: The result contains hierarchy edges
- **WHEN** recovered requirements include typed business, stakeholder, functional, or nonfunctional relationships
- **THEN** the traceability view uses the original relationships to display the applicable hierarchy

#### Scenario: An earlier saved draft omitted typed traceability
- **WHEN** the task reopens with a saved draft from the earlier recovery projection
- **THEN** the draft restores original typed edges for identifiable retained endpoints without replacing edited formulations
- **AND** the next save records the restored edges in a new version
