## Purpose

Provide a durable, evidence-based BABOK requirements registry that preserves
requirement types, provenance, quality, gaps, hypotheses, terminology and
traceability from the original business context through user-reviewed versions.

## ADDED Requirements

### Requirement: Released BABOK skill profile

The decomposition operation SHALL execute a released immutable BABOK skill
profile that includes the skill instructions and its required reference
materials, and SHALL record the selected profile and output schema version with
the durable job result.

#### Scenario: New decomposition uses the released BABOK profile

- **WHEN** an authorized client submits a valid decomposition request without
  selecting a prompt version
- **THEN** the job uses the active released BABOK profile and the result records
  its profile version and structured output schema version

#### Scenario: Historical decomposition remains readable after a new release

- **WHEN** a client opens a completed decomposition created with an older
  released profile
- **THEN** the system renders that result using its recorded schema and does not
  reinterpret it with the active profile

### Requirement: Structured BABOK decomposition result

The decomposition result SHALL contain a versioned structured registry with
`summary`, `context`, requirement groups `BR`, `SR`, `FR`, `NFR`, `TR`, `CON`,
and analysis groups `GAP`, `HYP`, `TERM`, `traceability` and `questions`.
Each requirement record SHALL have a stable type-specific identifier and one
independently reviewable requirement text.

#### Scenario: Complete source produces a structured registry

- **WHEN** the model can analyze the supplied business context
- **THEN** the result contains the required registry groups, valid identifiers,
  and no Markdown parsing is required to access individual records

#### Scenario: Incomplete source still produces a useful result

- **WHEN** the source supports only a partial decomposition
- **THEN** the result contains the supported records and explicit `GAP` and
  `questions` entries for material missing information instead of fabricating
  requirements

### Requirement: Bounded model output and contract recovery

Decomposition SHALL snapshot and enforce per-model output budgets. Deterministic JSON or BABOK contract violations MUST NOT retry the full Temporal activity. The workflow MAY make one separately traced repair using trusted context. The adapter MAY apply narrow deterministic defaults to non-semantic fields without inventing requirements, citations or relationships.

#### Scenario: Valid response completes within the output budget

- **WHEN** the provider returns a valid BABOK JSON response within the configured
  budget
- **THEN** the response is validated and persisted without an additional retry
- **AND** every extraction, repair and consolidation call passes the snapshotted output budget to the provider
- **AND** the BABOK default is `32 000` output tokens unless an explicitly configured per-model value is higher or lower within the supported limit

#### Scenario: Contract violation is repaired once

- **WHEN** the provider returns JSON that violates an enum, shape or reference
  rule after the initial extraction call
- **THEN** the workflow makes at most one separately traced repair call and
  persists the repaired response only after the same deterministic validator
  accepts it
- **AND** the repair uses the original trusted context

#### Scenario: Safe context default preserves a partial result

- **WHEN** a model response contains a context record without a usable `kind`
- **THEN** the adapter applies the documented non-semantic default, marks that
  context record as requiring clarification, and does not issue a second model
  call solely for that omission
- **AND** an empty `context[].kind` becomes `"контекст"` and its quality becomes `"Требует уточнения"`

#### Scenario: Contract violation remains after repair

- **WHEN** the initial and repair responses both fail deterministic validation
- **THEN** the execution unit is marked failed with `OUTPUT_CONTRACT_VIOLATION`
  or a more specific contract reason and the workflow does not issue another
  automatic full extraction retry

#### Scenario: Provider transport failure
- **WHEN** the provider call fails at the transport layer
- **THEN** the existing bounded retry and fallback policy may apply

#### Scenario: Context fields lack supported values
- **WHEN** a response has unknown or empty context quality, unknown provenance, missing relationships or a context record without direct evidence
- **THEN** before validation, the adapter may use `"Требует уточнения"` for quality, `"Предложено — требует подтверждения"` for unknown provenance, `[]` for missing relationships and `source: null` for context with no direct evidence
- **AND** confirmed requirements still require a source, and the same validator applies to every other contract field

### Requirement: Safe failure diagnostics

The workflow SHALL expose a safe machine-readable failure reason and step in the
job status and trace. Raw prompts, raw model output and stack details SHALL be
stored only when protected diagnostics are explicitly enabled and SHALL remain
unavailable to ordinary user-facing responses.

#### Scenario: User sees a contract failure

- **WHEN** a decomposition unit cannot produce a valid BABOK registry
- **THEN** the job status and trace identify the failed step and contract reason
  while the UI avoids displaying raw model content

### Requirement: Attempt lineage

The system SHALL preserve distinct model-attempt records for separate activity
executions and repair passes, including actual model, provider request ID,
duration and token usage, without overwriting an earlier attempt solely because
the provider-level attempt number is reused.

#### Scenario: Activity retry and repair remain distinguishable

- **WHEN** an extraction activity is retried or a repair pass is executed for
  the same workflow step
- **THEN** each provider call remains separately addressable in diagnostics
  with its own request ID, duration and usage

### Requirement: Evidence, provenance and quality

Every confirmed requirement SHALL preserve its source citation, provenance and
quality status. The system SHALL keep unsupported scope, plausible functions
and unresolved terminology outside the confirmed requirement groups as `GAP`,
`HYP` or `TERM` records.

#### Scenario: A problem does not confirm a solution function

- **WHEN** the source describes a problem or benefit but does not confirm a
  function that solves it
- **THEN** the result records the business statement as a business result and
  records the unconfirmed solution scope as a linked gap or hypothesis rather
  than as a confirmed `FR`

#### Scenario: Requirement quality is unresolved

- **WHEN** a requirement lacks information needed for its type or verification
- **THEN** the requirement remains in the registry with quality `Требует
  уточнения` and references the corresponding `GAP` identifier

### Requirement: Source, baseline and reference materials

The decomposition operation SHALL accept one primary business-context source
and MAY accept an existing requirements baseline and named reference materials
as separate authorized artifacts. The result SHALL distinguish primary source
evidence, baseline comparison and reference context.

#### Scenario: No baseline is supplied

- **WHEN** the client submits only the primary business context
- **THEN** the result performs the available decomposition and states that
  comparison with an existing requirements set is unavailable without creating
  fictitious delta records

#### Scenario: A baseline is supplied

- **WHEN** the client supplies an authorized baseline artifact together with the
  primary business context
- **THEN** the result reports only detected additions, changes, exclusions,
  duplicates and conflicts, with links to both baseline and new records

#### Scenario: A referenced material is unavailable

- **WHEN** a requested baseline or reference artifact cannot be read or is not
  authorized for the job
- **THEN** the job reports the material as unavailable and exposes a linked gap
  without treating claims that depend on it as confirmed evidence

### Requirement: Global consolidation of large inputs

The decomposition result SHALL be consolidated at the scope of the whole job.
Identifiers SHALL be unique within their type, semantically duplicate records
SHALL not be emitted as separate confirmed requirements, and traceability
links SHALL resolve to records in the consolidated result.

#### Scenario: Large source is processed in multiple parts

- **WHEN** the primary source is processed in more than one execution unit
- **THEN** the final result has globally unique identifiers, merged evidence and
  cross-part traceability rather than independent per-part registries

#### Scenario: Some execution units fail

- **WHEN** at least one execution unit fails but other units produce usable
  records
- **THEN** the job returns a partial result that identifies the failed scope and
  keeps the usable consolidated records available for review

### Requirement: Durable BABOK requirements versions

An authorized user SHALL be able to save an immutable reviewed version that
preserves all BABOK requirement groups, analysis records needed for review,
source lineage, manual edits and decision metadata. Each subsequent revision
SHALL reference its immediate base version without mutating earlier versions.

#### Scenario: User saves a reviewed BABOK registry

- **WHEN** the user saves reviewed changes to a completed decomposition
- **THEN** the system creates a new immutable version containing the complete
  structured registry and a reference to the source decomposition job

#### Scenario: User edits a later version

- **WHEN** the user edits a previously saved version and saves the changes
- **THEN** the system creates a new version linked to the previous version and
  leaves the previous requirement text, provenance and decisions unchanged

### Requirement: Linked research over BABOK requirements

Requirements-linked AI research SHALL accept a reviewed BABOK version as its
immutable input. Research relationships and proposed enhancements SHALL refer
to valid BABOK requirement identifiers and SHALL preserve their target type in
the resulting decision lineage.

#### Scenario: User starts research from a BABOK version

- **WHEN** the user starts optional AI research from a saved BABOK version
- **THEN** the child research job is linked to that exact version and every
  returned relationship or enhancement identifies its BABOK target type

#### Scenario: Research recommends a concrete requirement change

- **WHEN** a finding recommends new behavior, a quality criterion or a measurable change to an existing business goal
- **THEN** the research output contains a structured add or replace proposal for review
- **AND** the independent semantic audit requests repair if that proposal appears only in the narrative

#### Scenario: A finding needs no requirement change yet

- **WHEN** a finding is already covered or depends on a decision that prevents a concrete proposal
- **THEN** an empty proposal array is allowed with a specific explanation
- **AND** new research results with an unexplained empty proposal array trigger structured response repair


### Requirement: Backward-compatible historical results

Completed results created before the BABOK profile release SHALL remain
readable and downloadable in their original format. The system SHALL NOT
rewrite them into the BABOK registry or require the retired prompt profile to
be used for new jobs.

#### Scenario: User opens a legacy decomposition result

- **WHEN** a user selects an older decomposition from history
- **THEN** the application renders the legacy result with its existing behavior
  and does not expose a control that would mutate or reinterpret it
