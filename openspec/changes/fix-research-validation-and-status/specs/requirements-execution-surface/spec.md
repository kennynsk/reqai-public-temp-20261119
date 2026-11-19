## ADDED Requirements

### Requirement: Diagnose research contract rejection safely

Research SHALL record a predefined error code and structural location for rejected model output without persisting any of that output in ordinary diagnostics. Only proposals passing existing checks SHALL be offered for acceptance.

#### Scenario: Generation or repair does not meet the research contract
- **WHEN** the activity rejects the generation or repair at the output contract boundary
- **THEN** the diagnostic trace identifies the check and the phase that failed
- **AND** the reviewed version remains available if bounded repair cannot recover the result

#### Scenario: An explained finding has no proposed change
- **WHEN** a finding contains a nonempty explanation and omits the proposals array or returns null
- **THEN** the activity represents the finding with an empty proposals array and applies the existing checks to the whole result
- **AND** an invalid proposal object or unexplained missing field triggers bounded repair

#### Scenario: A research audit finds defects in both a proposal and a finding
- **WHEN** the independent auditor flags both sections of the same revision
- **THEN** bounded correction receives findings from both sections
- **AND** a fresh audit checks the revised proposals and narratives against their respective keys before publication

#### Scenario: Proposal justification and confirmation conditions both violate the contract
- **WHEN** a proposal lacks its own nonempty rationale and its confirmation conditions are missing or have the wrong type
- **THEN** the existing bounded format repair receives both field paths and their requirements
- **AND** publication requires validation of the corrected result and independent review when enabled

#### Scenario: A semantic correction proposes changes to unrelated research cards
- **WHEN** a research correction includes existing cards outside the scope of the findings
- **THEN** only cards in scope can change
- **AND** the resulting revision goes through independent review before publication

#### Scenario: The latest actionable research profile exhausts draft repair
- **WHEN** correction cannot recover the draft format or the independent semantic review rejects the corrected draft
- **THEN** the worker requests one compact new draft from the saved input within the job deadline
- **AND** the new draft must meet the same output, coverage and enabled audit checks before publication
- **AND** exhaustion of that recovery leaves the reviewed input available for manual finalization
