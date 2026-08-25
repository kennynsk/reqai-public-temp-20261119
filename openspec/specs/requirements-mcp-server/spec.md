# requirements-mcp-server Specification

## Purpose

Defines the reduced enterprise MCP contract for the supported guided requirements workflow and canonical read-only access to retained task state and results.

## Requirements

### Requirement: Guided-workflow MCP tool surface
The MCP server SHALL advertise `decompose_requirements`, `research_requirements`, `get_task_status`, and `get_task_result`. It SHALL NOT advertise or register `start_research`, standalone strategies, comparison operations, arbitrary workflow modes, or arbitrary prompt-testing inputs.

#### Scenario: Authorized client discovers tools
- **WHEN** an authenticated MCP client initializes a session with an allowed application role
- **THEN** the server advertises exactly the four supported requirements tools with strict schemas and no standalone research tool

#### Scenario: Client calls a removed tool
- **WHEN** an MCP client attempts to call `start_research` after the contract change
- **THEN** the server reports that the tool is unavailable and sends no request to the backend

### Requirement: Supported asynchronous start tools
The `decompose_requirements` and `research_requirements` tools SHALL delegate to the corresponding supported requirements API operations and return immediately after durable job acceptance with canonical job references and idempotent replay state. They MUST NOT execute prompts or wait for LLM completion.

#### Scenario: Client starts decomposition
- **WHEN** an authorized client calls `decompose_requirements` with valid input and an idempotency key
- **THEN** the tool returns the accepted decomposition job and canonical follow-up references

#### Scenario: Client starts version research
- **WHEN** an authorized client calls `research_requirements` for an eligible immutable requirements version
- **THEN** the backend derives source lineage and returns the accepted `REQUIREMENTS_INSIGHTS` child job

### Requirement: Canonical reads include retained legacy jobs
The `get_task_status` and `get_task_result` tools SHALL continue to read authorized canonical job resources by `jobId`, including retained jobs created with removed modes. Their output schemas SHALL represent historical mode values without exposing any operation that restarts those modes.

#### Scenario: Client reads a retained legacy task
- **WHEN** an authorized MCP client requests the status or result of a retained legacy job
- **THEN** the tool returns the canonical safe metadata available from REST and performs no mutation or provider call

#### Scenario: Legacy result is no longer retained
- **WHEN** the requested legacy job or result has expired under canonical retention policy
- **THEN** the MCP tool returns the backend's safe unavailable response without a fallback store

### Requirement: MCP backend compatibility reflects the reduced API
MCP authentication and readiness SHALL require the backend to advertise decomposition and requirements-research domain operations and SHALL NOT require standalone-research capability. The gateway contract metadata and qualification tests SHALL identify the breaking tool-surface revision.

#### Scenario: Reduced backend is healthy
- **WHEN** the backend advertises the two supported domain operations and canonical task reads
- **THEN** MCP authentication and readiness succeed without a standalone research route

#### Scenario: Backend lacks a supported operation
- **WHEN** the backend does not advertise decomposition or requirements research
- **THEN** the gateway reports an incompatible backend and advertises no usable authenticated tool session
