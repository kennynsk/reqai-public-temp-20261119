## Purpose

Defines the supported requirements execution contract across public APIs and durable workflows while preserving safe read-only access to retained jobs created by retired modes.

## ADDED Requirements

### Requirement: Supported requirements creation modes
The system SHALL create new product jobs only for `DECOMPOSITION` and requirements-linked `REQUIREMENTS_INSIGHTS`. A requirements-insights job MUST be created from an authorized immutable requirements version and MUST preserve its source decomposition and version lineage. `DECOMPOSITION_WITH_INSIGHTS`, `STANDARD_RESEARCH`, `AGENT_RESEARCH`, `MODEL_COMPARE`, `AGENT_COMPARE`, and `PROMPT_TEST` MUST NOT be accepted for new jobs.

#### Scenario: Client starts decomposition
- **WHEN** an authorized client submits valid business context through the supported decomposition operation
- **THEN** the system accepts one durable `DECOMPOSITION` job and returns its canonical asynchronous references

#### Scenario: Client starts requirements-linked research
- **WHEN** an authorized client starts AI research for an eligible immutable requirements version
- **THEN** the system accepts one child `REQUIREMENTS_INSIGHTS` job linked to the source decomposition and exact version

#### Scenario: Client submits a retired mode
- **WHEN** a client supplies a removed combined, standalone, comparison, agent, or prompt-testing mode through a generic creation endpoint
- **THEN** strict validation rejects the request with the versioned error envelope and creates no artifact, job, or provider call

### Requirement: Reduced public requirements API
The public v1 domain API SHALL expose decomposition and requirements-version research submission and SHALL NOT expose standalone research submission. API capability discovery and OpenAPI creation schemas SHALL advertise only the supported operations and creation modes. Read models MAY continue to return a retired mode value for a retained historical job.

#### Scenario: Client discovers domain operations
- **WHEN** an authorized client reads API v1 capabilities
- **THEN** discovery advertises `decomposition` and `requirements-research` and does not advertise `standalone-research`

#### Scenario: Client requests the removed standalone route
- **WHEN** a client calls the retired `POST /api/v1/research` route after removal
- **THEN** the API does not accept the operation and creates no work

#### Scenario: Client generator reads OpenAPI
- **WHEN** a client generator reads the published OpenAPI v1 document
- **THEN** no standalone-research operation or retired creation-mode enum is present, while status and result schemas remain capable of representing retained historical jobs

### Requirement: Retained legacy jobs are read-only
Jobs created with a retired mode before the removal SHALL remain visible through authorized canonical list, status, result, result-content, event, artifact, trace, and task-permalink reads for their normal retention lifetime. The system SHALL NOT retry, reset into, clone, or otherwise create a new execution of a retired mode.

#### Scenario: Owner reads a retained legacy result
- **WHEN** an authorized owner requests a retained completed job created with a retired mode
- **THEN** the system returns its canonical status and retained result references without invoking a provider or mutating the job

#### Scenario: Client retries a retained legacy job
- **WHEN** a client requests retry or another operation that would create a new execution of a retired mode
- **THEN** the system returns a stable conflict or unsupported-mode error and creates no job

#### Scenario: Legacy data reaches retention expiry
- **WHEN** a retained legacy job or artifact reaches its configured retention boundary
- **THEN** the existing retention policy removes or makes it unavailable exactly as for other retained jobs, without a special indefinite legacy store

### Requirement: Legacy execution retirement is drain-safe
The platform MUST stop admission of retired modes before removing their worker and prompt support. Deployment qualification SHALL verify that no accepted, queued, running, retry-waiting, or cancellation-requested legacy job remains before workers that cannot execute those modes are activated.

#### Scenario: Legacy job is still active during rollout
- **WHEN** rollout qualification finds an active job whose mode is being retired
- **THEN** cleanup deployment is blocked until the job reaches a terminal state through completion or confirmed cancellation

#### Scenario: Admission has been disabled
- **WHEN** the drain period begins
- **THEN** UI, REST, generic job creation, MCP, and other enabled adapters reject new legacy work while existing compatible workers finish or cancel already accepted jobs

### Requirement: Retired execution assets are not required for new work
New decomposition and requirements-insights jobs SHALL resolve only their supported workflow branches, prompt profiles, output contracts, and configuration. Runtime startup and release qualification MUST NOT require prompt bundles, environment variables, fixtures, or provider paths used exclusively by retired modes.

#### Scenario: Supported runtime starts without legacy prompt configuration
- **WHEN** API and worker processes start with valid decomposition and requirements-insights prompt configuration but no standalone, comparison, agent, combined, or prompt-test configuration
- **THEN** readiness and prompt qualification succeed for the supported product workflow

#### Scenario: Supported job executes after cleanup
- **WHEN** a decomposition or requirements-insights job runs after legacy execution assets have been removed
- **THEN** it completes using the same durable lifecycle, model policy, result validation, cancellation, and lineage guarantees as before the cleanup
