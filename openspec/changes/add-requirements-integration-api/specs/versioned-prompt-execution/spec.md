## Purpose

Обеспечивает управляемый выпуск, выбор и воспроизводимое исполнение неизменяемых prompt bundles для декомпозиции и research с проверяемой совместимостью результата и безопасной диагностикой.

## ADDED Requirements

### Requirement: Immutable released prompt bundles
Every prompt used by a production decomposition or research workflow SHALL belong to a uniquely identified released bundle version. A bundle MUST declare its workflow purpose, templates, required variables, output schema version and integrity hashes, and released content MUST NOT be modified in place.

#### Scenario: A new prompt is released
- **WHEN** prompt wording or its output contract changes after a version has been released
- **THEN** the change creates a new bundle version while the previous released version and its hashes remain unchanged

#### Scenario: Bundle manifest is invalid
- **WHEN** a bundle has duplicate identity, missing templates, undeclared variables, unsupported output schema or a hash mismatch
- **THEN** the system rejects that bundle during validation and does not make it selectable for new jobs

### Requirement: Atomic workflow prompt profiles
A bundle for a multi-step workflow SHALL version all prompts and output contracts required by that workflow as one atomic profile so a job cannot combine independently activated prompt versions across analyze, research, synthesis, improvement or decomposition stages.

#### Scenario: Research prompt wording is upgraded
- **WHEN** one or more prompts in a research workflow are changed for a new release
- **THEN** the system publishes and selects a complete new research bundle whose manifest identifies every step used by that job

#### Scenario: Worker sees an incomplete profile
- **WHEN** a job references a bundle that does not contain a required workflow step
- **THEN** execution fails with a controlled configuration error before invoking the model provider

#### Scenario: Decomposition and requirements research use separate profiles
- **WHEN** the domain workflow performs decomposition and later starts research from a saved requirements version
- **THEN** the decomposition job snapshots a decomposition-only bundle and the research job independently snapshots the requirements-insights bundle

#### Scenario: Historical combined mode remains available
- **WHEN** an existing generic jobs client submits the supported historical combined decomposition mode
- **THEN** the job resolves an explicitly compatibility-scoped complete bundle without adding research steps to the domain decomposition bundle

### Requirement: Active version and allowed pinning
Each supported workflow purpose SHALL have one configured active released bundle version for new jobs. An authorized domain client MAY request a specific released version only when that version is enabled by policy for the requested workflow; otherwise the system SHALL reject the request without silently substituting another version.

#### Scenario: Caller omits prompt version
- **WHEN** a valid job is accepted without an explicit prompt version
- **THEN** the system resolves the configured active bundle for that workflow and records the resolved identity in the job snapshot

#### Scenario: Caller pins an allowed version
- **WHEN** an authorized client requests a released and policy-enabled version compatible with the workflow
- **THEN** the system accepts the job using exactly that version and reports safe version metadata in the job diagnostics

#### Scenario: Requested version is unavailable
- **WHEN** the requested version is unknown, disabled, incompatible or not allowed for the caller's operation
- **THEN** the system returns a controlled validation or policy error and creates no job

### Requirement: Immutable prompt snapshot per job
At job acceptance the system SHALL persist the resolved bundle identifier, version, manifest hash, required template hashes and output schema version in the immutable configuration snapshot. Every chunk, workflow step, retry, replay and recoverable continuation of that job MUST use the same snapshot even if the active version changes later.

#### Scenario: Active version changes during a running job
- **WHEN** an operator activates a newer bundle after a job has been accepted
- **THEN** all remaining steps and retries of the accepted job continue using its original bundle snapshot while newly accepted jobs use the newer active version

#### Scenario: A failed job is retried
- **WHEN** the platform creates a linked retry from a failed or cancelled job
- **THEN** the retry preserves the original prompt snapshot unless an explicit, separately authorized re-run creates a new job with a newly selected version

### Requirement: Deterministic and safe rendering
Prompt rendering SHALL accept only variables declared by the selected bundle, preserve user-provided content as data, and fail before model invocation when required variables are missing or the rendered content does not match the manifest integrity and size policies.

#### Scenario: Business context is rendered
- **WHEN** a decomposition step renders a released template with an immutable input artifact
- **THEN** the system substitutes only declared fields and does not interpret input text as a template path, bundle selector or privileged instruction source

#### Scenario: Required rendering data is absent
- **WHEN** a required template variable cannot be resolved from authorized job inputs
- **THEN** the step records a controlled prompt-rendering failure and sends no partial prompt to the provider

### Requirement: Output contract compatibility
Every released bundle SHALL reference an output schema version supported by the corresponding workflow parser and validator. Activation and explicit pinning MUST be prevented when the bundle's output schema is unsupported by the deployed worker version.

#### Scenario: Bundle passes release qualification
- **WHEN** a bundle is considered for activation
- **THEN** its rendered fixtures and model-independent contract tests demonstrate valid rendering and parser acceptance for every declared workflow output

#### Scenario: Output schema requires new worker support
- **WHEN** a bundle references an output schema unknown to the current worker deployment
- **THEN** the bundle remains unavailable until compatible workers are deployed, avoiding runtime fallback to an older parser contract

### Requirement: Retained resolvability and integrity
Released bundle versions referenced by retained or retryable jobs SHALL remain resolvable for the configured job and retry lifetime, and workers SHALL verify stored hashes before use. Missing or altered content MUST produce a controlled integrity failure rather than falling back to the active version.

#### Scenario: Historical job is resumed after deployment
- **WHEN** a retained job resumes on a newer worker deployment
- **THEN** the worker resolves its snapshotted bundle version, verifies the recorded hashes and uses that exact released content

#### Scenario: Snapshotted bundle cannot be verified
- **WHEN** referenced prompt content is missing or its hash differs from the job snapshot
- **THEN** the workflow fails safely with a prompt-integrity reason and never substitutes current active content

### Requirement: Safe prompt observability
Normal job, event and result APIs SHALL expose only safe prompt metadata such as bundle identifier, version, schema version and hashes. Full rendered prompts MAY be retained only through the existing protected diagnostic artifact policy and MUST remain subject to privileged access, audit, redaction and expiration.

#### Scenario: Ordinary caller reads job metadata
- **WHEN** a non-privileged owner retrieves status or result data
- **THEN** the response may identify the prompt bundle version but does not include full templates, rendered prompts, secrets or protected diagnostic content

#### Scenario: Privileged diagnostic access is permitted
- **WHEN** an authorized diagnostic role requests a retained prompt detail
- **THEN** the system applies the existing audited protected-detail policy and returns only policy-permitted redacted content or an explicit unavailable state

### Requirement: Controlled activation and rollback
Activating or rolling back a prompt bundle SHALL be an audited configuration change that affects only jobs accepted after the change. The system SHALL validate target availability and compatibility before activation and SHALL support restoring a previously released compatible version without editing bundle content.

#### Scenario: Operator activates a qualified release
- **WHEN** an authorized deployment or configuration process selects a validated compatible bundle version
- **THEN** subsequent jobs snapshot that version and the activation record identifies workflow purpose, previous version, new version and integrity hash

#### Scenario: Operator rolls back prompt behavior
- **WHEN** an authorized operator restores the previous compatible version after a quality regression
- **THEN** new jobs use the restored released version while already accepted jobs retain their original snapshots

### Requirement: Documented prompt-purpose inventory
Prompt release documentation SHALL identify every shipped bundle, its supported workflow purposes and whether it belongs to the primary guided workflow, additional tools or compatibility-only execution. Qualification evidence MUST use the actual catalog inventory rather than a manually maintained bundle count.

#### Scenario: Operator reviews the prompt catalog
- **WHEN** an operator prepares a release or an integrator reviews prompt behavior
- **THEN** documentation distinguishes decomposition-only, requirements-insights, standard research, agent research/comparison and legacy combined bundles without implying that all templates execute in the primary workflow
