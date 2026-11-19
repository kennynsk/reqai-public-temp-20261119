## MODIFIED Requirements

### Requirement: User-facing status language
The frontend SHALL display one localized primary status for each task and result. Raw lifecycle values, model attempts, provider metadata, and technical trace data SHALL appear only inside the separate optional Debug surface and SHALL NOT be rendered inline below the primary workflow.

For an active decomposition or research task, the frontend SHALL present progress messaging only once in the disabled primary action, with cancellation available beside it. A separate state card SHALL be reserved for failure, retry-wait, cancellation-requested, or cancelled states.

#### Scenario: Job is actively running
- **WHEN** a decomposition or research task is accepted, queued, or running
- **THEN** the primary action shows a spinner and one localized activity label, cancellation remains available beside it, and no duplicate activity card is rendered below

#### Scenario: Job enters an exceptional state
- **WHEN** a task fails, waits for retry, has cancellation requested, or is cancelled
- **THEN** a dedicated state card explains that exceptional state without duplicating a normal running message

#### Scenario: Completed result is displayed
- **WHEN** a task succeeds with a complete result
- **THEN** the primary status reads «Готово» and does not simultaneously display raw `SUCCEEDED` or `COMPLETE` identifiers

#### Scenario: Partial or failed result is displayed
- **WHEN** a task completes partially or fails
- **THEN** the primary status communicates that outcome in Russian and technical diagnostics remain available through Debug

### Requirement: Durable behavior compatibility
The redesign SHALL preserve existing durable task submission, URL-based active-task restoration, cancellation, artifact download, requirements-version lineage, and completed-result restoration behavior. A final version SHALL remain manually editable. Each saved manual revision SHALL reference its immediate base version and preserve the decisions and research-enhancement lineage of the final version it revises.

#### Scenario: Page reloads during a job
- **WHEN** the page reloads at `/tasks/{jobId}` while the task is active
- **THEN** the correct workspace and workflow stage are restored from authoritative task state identified by the URL

#### Scenario: User returns to an older result
- **WHEN** a completed history entry is selected
- **THEN** its canonical task URL, result, and any persisted reviewed requirements versions are restored without a new provider call

#### Scenario: User edits research-assisted final requirements
- **WHEN** the user edits and saves a final version produced from AI-research decisions
- **THEN** a new immutable requirements version is created from the current final version without losing accepted or rejected decision lineage

#### Scenario: User edits a direct final version
- **WHEN** the user skipped AI research and edits the final requirements
- **THEN** a new immutable requirements version is created with the direct-final marker preserved and the final editor remains available after reload
