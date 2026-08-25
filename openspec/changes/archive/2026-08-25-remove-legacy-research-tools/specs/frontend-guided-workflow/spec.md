## MODIFIED Requirements

### Requirement: Primary and secondary navigation
The frontend SHALL make «Подготовка требований» the sole product workspace. It SHALL NOT expose «Дополнительные инструменты», standalone research launchers, model-comparison launchers, agent-comparison launchers, or prompt-testing launchers. AI research SHALL be available only as the optional requirements-linked stage after a reviewed requirements version has been saved.

#### Scenario: User opens the application
- **WHEN** the application loads without a task permalink
- **THEN** the requirements-preparation workspace is selected and no standalone tool navigation is rendered

#### Scenario: User deliberately opens an advanced tool
- **WHEN** the user follows stale client state or navigation that previously selected a standalone tool
- **THEN** the frontend does not render a standalone launcher and returns to the guided requirements workspace, unless the URL identifies a retained legacy job that must open read-only

#### Scenario: User reaches optional AI research
- **WHEN** the user has saved a reviewed requirements version from a completed decomposition
- **THEN** the guided workflow offers «Улучшить требования с помощью AI» and starts only requirements-linked research

### Requirement: Consistent product terminology
User-facing copy SHALL use consistent Russian product language across the guided requirements workflow. The interface SHALL use «AI-исследование» or «Улучшить требования с помощью AI» according to context and SHALL use «Соответствие требованиям» instead of the English `compliance` label. It SHALL NOT present removed standalone research, comparison, agent, or prompt-testing terminology as available product actions. Raw technical terms MAY remain in technical details and retained historical metadata.

#### Scenario: User navigates between workflow and tools
- **WHEN** headings, actions, stages, or requirement-type descriptions are displayed
- **THEN** equivalent concepts use the same Russian terminology and capitalization and no removed tool is advertised

### Requirement: Durable behavior compatibility
The guided workflow SHALL preserve durable task submission, URL-based active-task restoration, cancellation, artifact download, requirements-version lineage, and completed-result restoration for supported decomposition and requirements-linked research. A final version SHALL remain manually editable. Each saved manual revision SHALL reference its immediate base version and preserve the decisions and research-enhancement lineage of the final version it revises. Retained jobs created with a removed legacy mode SHALL remain read-only and SHALL NOT expose controls that retry, clone, or restart that mode.

#### Scenario: Page reloads during a job
- **WHEN** the page reloads at `/tasks/{jobId}` while a decomposition or requirements-linked research task is active
- **THEN** the correct workflow stage is restored from authoritative task state identified by the URL

#### Scenario: User returns to an older result
- **WHEN** a completed decomposition or requirements-linked research history entry is selected
- **THEN** its canonical task URL, result, and any persisted reviewed requirements versions are restored without a new provider call

#### Scenario: User opens a retained legacy result
- **WHEN** a retained history entry or task permalink references a removed standalone mode
- **THEN** the frontend presents its canonical status, safe result metadata, diagnostics access when authorized, and artifact download without rendering a creation or retry control for that mode

#### Scenario: User edits research-assisted final requirements
- **WHEN** the user edits and saves a final version produced from AI-research decisions
- **THEN** a new immutable requirements version is created from the current final version without losing accepted or rejected decision lineage

#### Scenario: User edits a direct final version
- **WHEN** the user skipped AI research and edits the final requirements
- **THEN** a new immutable requirements version is created with the direct-final marker preserved and the final editor remains available after reload

## REMOVED Requirements

### Requirement: Unified visual system for standalone tools
**Reason**: Standalone tools are removed from the supported product surface, so they no longer require a parallel visual contract.

**Migration**: Users perform decomposition and optional AI research in «Подготовка требований»; retained standalone jobs open in the read-only historical presentation defined by durable compatibility.

### Requirement: Summary-first research presentation
**Reason**: The requirement governs completed standalone research, which is no longer creatable or exposed as an interactive workspace.

**Migration**: Requirements-linked `REQUIREMENTS_INSIGHTS` continues to use the existing filterable insight-card presentation; retained standalone results use the read-only historical presentation and artifact download.
