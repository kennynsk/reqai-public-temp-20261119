## Purpose

Provides enterprise MCP clients with governed asynchronous tools for requirements decomposition and research while preserving the canonical REST job lifecycle, authorization, tenant isolation and result semantics.

## ADDED Requirements

### Requirement: Requirements MCP tool surface
The MCP server SHALL advertise `decompose_requirements`, `start_research`, `research_requirements`, `get_task_status` and `get_task_result` with strict input and output schemas aligned to the product-level requirements integration API. It MUST NOT advertise internal workflow modes, arbitrary prompt text or unsupported comparison operations.

#### Scenario: Authorized client discovers tools
- **WHEN** an authenticated MCP client initializes a session with an allowed application role
- **THEN** the server advertises the five requirements tools with schemas for domain inputs, canonical job identifiers and safe results

#### Scenario: Technical fields are supplied
- **WHEN** a tool request includes `tenantId`, internal job type/mode, `parentJobId`, prompt text or another unknown field
- **THEN** the server rejects the request with a structured validation error and starts no work

### Requirement: Asynchronous start tools
The `decompose_requirements`, `start_research` and `research_requirements` tools SHALL delegate to the corresponding requirements integration operation and return immediately after durable job acceptance with the canonical `jobId`, status, status/result/events references and idempotent replay indicator. They MUST NOT wait for LLM completion.

#### Scenario: Client starts decomposition
- **WHEN** an authorized client calls `decompose_requirements` with valid input and an idempotency key
- **THEN** the tool returns the same accepted job identity and follow-up references as `POST /api/v1/decompositions`

#### Scenario: Client starts version research
- **WHEN** an authorized client calls `research_requirements` for an eligible immutable requirements version
- **THEN** the backend derives the source decomposition lineage and returns the canonical accepted child job

#### Scenario: Tool call is retried
- **WHEN** the same principal repeats an identical start request with the same unexpired idempotency key
- **THEN** the tool returns the original job and replay indicator without creating another artifact or job

### Requirement: Canonical status and result tools
The `get_task_status` and `get_task_result` tools SHALL read the canonical job query resources using `jobId` and SHALL preserve REST status, outcome, partial/failure metadata, safe not-found behavior and result artifact references. The MCP server MUST NOT create a second task state or result store.

#### Scenario: Client polls an accepted task
- **WHEN** a client calls `get_task_status` with a visible canonical job identifier
- **THEN** the tool returns the current authoritative job state from the shared backend

#### Scenario: Result is not ready
- **WHEN** a client calls `get_task_result` before the job reaches a result-bearing terminal state
- **THEN** the tool returns the canonical retryable result-not-ready error without waiting for completion

### Requirement: Enterprise MCP authentication and tenant isolation
The production MCP transport SHALL require a verified Bearer access token and SHALL preserve the token-derived principal, tenant and mapped application roles when calling the requirements backend. Tool inputs MUST NOT select tenant or owner scope. Missing, invalid or insufficient credentials SHALL fail before any backend mutation.

#### Scenario: Service account opens an MCP session
- **WHEN** a service account presents a valid enterprise token mapped to an allowed role and tenant
- **THEN** every tool call is scoped to that verified principal and tenant and is audited through the canonical backend

#### Scenario: Client references another tenant's resource
- **WHEN** a tool call references an artifact, requirements version or job outside the verified scope
- **THEN** the server returns the backend's safe unavailable behavior without revealing resource metadata

### Requirement: Thin gateway execution boundary
The MCP server SHALL invoke the released requirements REST API or its formally equivalent shared application boundary and MUST NOT render prompts, call LLM providers, access application repositories, start Temporal workflows or read protected artifacts directly.

#### Scenario: Backend is unavailable
- **WHEN** the requirements API is unreachable or rejects new work
- **THEN** the MCP server returns a structured retryable transport or canonical service error and does not execute a local fallback workflow

#### Scenario: MCP server is disabled
- **WHEN** the MCP deployment or feature is disabled
- **THEN** the REST integration remains operational and the main application advertises no MCP tools

### Requirement: Safe MCP errors and observability
The MCP server SHALL translate canonical errors into structured MCP tool errors containing only stable code, message, retryability, request correlation and safe details. Logs, traces, metrics and tool results MUST NOT contain credentials, full prompts, rendered inputs or protected diagnostic artifacts.

#### Scenario: Backend returns a policy error
- **WHEN** a prompt version, model, admission or operational policy rejects a tool request
- **THEN** the client receives the corresponding stable safe code and retryability while protected backend content remains absent

### Requirement: Deployable and qualified MCP runtime
The MCP server SHALL have independent enablement, readiness, dependency health, graceful shutdown and version reporting and SHALL be qualified end-to-end against the requirements API for all tools, auth boundaries, idempotency and partial/failure results before production publication.

#### Scenario: MCP gateway is not ready
- **WHEN** its configuration, authentication verifier or backend API dependency is not qualified
- **THEN** readiness fails and the deployment does not advertise a usable tool endpoint
