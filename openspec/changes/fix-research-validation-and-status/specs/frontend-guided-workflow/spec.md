## ADDED Requirements

### Requirement: Communicate the outcome and actual version state

Grouped task history SHALL show partial research as partial. A finalization editor using saved input SHALL distinguish that input from a final version saved for the current run.

#### Scenario: Reopen a partial research run
- **WHEN** a user opens grouped history or the final editor for partial research
- **THEN** history indicates the partial outcome and the editor indicates whether a final version has been saved
- **AND** after the first final save the warning stops asking the user to save the final version
