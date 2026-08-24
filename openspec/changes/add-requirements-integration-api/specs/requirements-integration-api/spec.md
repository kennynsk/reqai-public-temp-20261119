## Purpose

Предоставляет внешним приложениям устойчивый доменный API декомпозиции и исследования требований, скрывающий внутреннюю artifact/job orchestration и сохраняющий enterprise-безопасность, lineage и асинхронные гарантии платформы.

## ADDED Requirements

### Requirement: Domain decomposition submission
The system SHALL expose `POST /api/v1/decompositions` as an asynchronous domain endpoint that accepts either a non-empty inline business context within the configured JSON limit or an authorized existing `inputArtifactId`, but not both, and creates a canonical `DECOMPOSITION` job from an immutable input artifact.

The endpoint MUST perform decomposition only and MUST NOT expose a switch that implicitly starts requirements insights or another research workflow.

#### Scenario: External client submits inline business context
- **WHEN** an authorized caller submits a valid inline business context and an idempotency key
- **THEN** the system persists the context as an immutable input artifact, accepts one decomposition job, and returns `202 Accepted` with its canonical `jobId`, status URL and events URL

#### Scenario: External client reuses a large input artifact
- **WHEN** an authorized caller submits an owned input artifact reference instead of inline content
- **THEN** the system creates the decomposition job from that artifact without copying the large content through the JSON control plane

#### Scenario: Decomposition input is ambiguous
- **WHEN** a request supplies both inline content and an artifact reference, supplies neither, or references an unavailable artifact
- **THEN** the system rejects the request with the versioned API error envelope and creates no job

#### Scenario: Client attempts to combine decomposition and insights
- **WHEN** a decomposition request includes `withInsights`, an internal combined mode, or another research selector
- **THEN** strict request validation rejects the field and the client must start research separately from an immutable requirements version

### Requirement: Standalone research submission
The system SHALL expose `POST /api/v1/research` as an asynchronous domain endpoint for standalone research, accepting inline context or an authorized existing input artifact and a supported product-level strategy without requiring callers to supply internal job type or workflow mode names.

#### Scenario: Client starts standalone research
- **WHEN** an authorized caller submits valid research context, an optional supported strategy, and an idempotency key
- **THEN** the system resolves the strategy to an allowed durable research mode, creates one canonical `RESEARCH` job, and returns `202 Accepted` with canonical job references

#### Scenario: Client requests an unsupported research strategy
- **WHEN** a caller supplies a research strategy that the domain endpoint does not expose
- **THEN** the system returns a validation error and does not fall through to a legacy or arbitrary workflow mode

### Requirement: Research from an immutable requirements version
The system SHALL expose `POST /api/v1/requirements/versions/{versionId}/research` to start requirements-focused research from an authorized immutable requirements version. The system MUST derive and validate the input artifact, source decomposition job and child-job lineage server-side and MUST NOT require or trust client-supplied `parentJobId` or internal mode values.

#### Scenario: Client researches reviewed requirements
- **WHEN** an authorized owner starts research for a reviewed requirements version produced by a completed decomposition
- **THEN** the system creates one child `RESEARCH` job in the requirements-insights mode, links it to the source decomposition and exact input version, and returns `202 Accepted` with canonical job references

#### Scenario: Requirements version is not eligible
- **WHEN** the version does not exist in the caller's tenant and owner scope, is not a requirements artifact, or cannot be linked to an eligible completed decomposition
- **THEN** the system returns the same safe unavailable or conflict behavior used by the canonical requirements-version API and creates no research job

#### Scenario: Client attempts to override lineage
- **WHEN** the request body includes `parentJobId`, `inputArtifactId`, `tenantId` or an internal workflow mode
- **THEN** the system rejects the unsupported fields instead of allowing the caller to redirect lineage or execution

### Requirement: Canonical asynchronous lifecycle
All domain submission endpoints SHALL use the existing durable job lifecycle and SHALL return the same canonical job identity, status, events, result metadata and result-content resources as `/api/v1/jobs`. They MUST NOT wait synchronously for LLM completion or create a second persistence or execution path.

#### Scenario: Caller follows a domain submission
- **WHEN** a domain endpoint has accepted a decomposition or research operation
- **THEN** the caller can monitor it through `GET /api/v1/jobs/{jobId}` or the job SSE stream and retrieve the completed result through the canonical result resources

#### Scenario: Workflow completes partially or fails
- **WHEN** the underlying durable workflow produces a partial outcome, exhausts retries, is cancelled or fails
- **THEN** the domain-created job exposes the same status, outcome, failure metadata and retained artifacts as an equivalent job created through `/api/v1/jobs`

### Requirement: Idempotent domain submissions
Every domain submission endpoint SHALL require an `Idempotency-Key` and apply the canonical tenant-and-principal-scoped request hashing rules so that client retries cannot create duplicate work.

#### Scenario: Identical request is retried
- **WHEN** the same authorized principal repeats an identical domain request with the same unexpired idempotency key
- **THEN** the system returns the originally accepted `jobId` and identifies the response as an idempotent replay

#### Scenario: Idempotency key is reused for different input
- **WHEN** the same principal reuses an unexpired key with different content, version, artifact, strategy or execution options
- **THEN** the system returns a conflict and creates no additional job

### Requirement: Enterprise authorization and tenant isolation
When authentication is enabled, domain endpoints SHALL require a valid Bearer JWT whose mapped application role permits the operation, derive principal and tenant context only from verified claims, apply existing owner and tenant isolation, and record the same safe audit facts as canonical job creation. A service account MAY call the API only when the enterprise identity provider maps it to an allowed application role and tenant.

#### Scenario: Authorized service account submits work
- **WHEN** a machine principal presents a valid token mapped to an allowed role and tenant
- **THEN** the system creates and scopes the artifact and job to that verified principal and tenant without accepting tenant identity from the request body

#### Scenario: Caller crosses a tenant boundary
- **WHEN** a caller references an artifact, requirements version or job outside its authorized tenant or owner scope
- **THEN** the system returns the platform's safe unavailable behavior and reveals no cross-tenant metadata

#### Scenario: Authentication or role is insufficient
- **WHEN** the token is absent, invalid, expired or lacks an allowed mapped role
- **THEN** the endpoint returns the canonical `401` or `403` response and performs no artifact or job mutation

### Requirement: Shared admission, limits and errors
Domain endpoints SHALL apply the existing input-size, model allowlist, concurrency, admission, backlog and operational-mode policies and SHALL use the versioned API error envelope without exposing provider secrets, full prompts or protected artifacts.

#### Scenario: Platform cannot accept more work
- **WHEN** a valid domain request exceeds an active-job or backlog limit or arrives while new work is operationally rejected
- **THEN** the system returns the canonical retryable `429` or `503` response and does not bypass admission control

#### Scenario: Inline input exceeds the domain limit
- **WHEN** inline JSON content exceeds the configured domain request limit
- **THEN** the system rejects it with a controlled size error and directs API consumers through the documented artifact-upload contract for large inputs

### Requirement: Discoverable versioned contract
The OpenAPI v1 document and API capability discovery SHALL describe the domain endpoints, request alternatives, product-level strategies, security, idempotency, asynchronous responses and canonical follow-up URLs.

#### Scenario: Integration developer reads the API contract
- **WHEN** a client generator or developer inspects the published OpenAPI v1 document
- **THEN** it can construct valid domain requests and follow accepted jobs without depending on undocumented internal workflow mode or lineage fields

#### Scenario: Documentation is qualified against runtime routes
- **WHEN** documentation qualification runs before release or MCP schema generation
- **THEN** it detects missing or stale public, discovery and administrative route declarations, obsolete request fields, unsupported runtime environment names and legacy UI descriptions presented as current behavior

### Requirement: Transport adapter parity
Any additional protocol adapter enabled for these capabilities, including a future MCP adapter, MUST invoke the same authorized application operations and preserve canonical job identity, asynchronous lifecycle, tenant isolation, idempotency and result semantics. No adapter MAY execute prompts or workflows directly.

#### Scenario: Future MCP adapter starts decomposition
- **WHEN** an enabled MCP tool receives an authorized decomposition request
- **THEN** it delegates to the same domain operation as the REST endpoint and returns a canonical job reference rather than waiting for the LLM workflow to finish

#### Scenario: MCP adapter is not installed
- **WHEN** the first delivery is deployed without an MCP server
- **THEN** the REST integration capability remains complete and no unavailable MCP tools are advertised by the application
