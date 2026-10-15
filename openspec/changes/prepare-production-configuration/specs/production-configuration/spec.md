## Purpose

Определяет проверяемую production-конфигурацию ReqAI для первого запуска с чистыми хранилищами, защищённым доступом и воспроизводимым набором артефактов выпуска.

## ADDED Requirements

### Requirement: Explicit and reproducible production configuration
Production profile SHALL explicitly declare production runtime, enabled asynchronous platform, deployment identity, immutable image references, service addresses, active/released prompt versions, ingress host and optional MCP state. Rendering SHALL fail if mandatory inputs are absent, unresolved placeholders remain, development defaults are selected, or unsupported configuration keys would be silently ignored.

#### Scenario: Missing target configuration
- **WHEN** an operator validates a profile containing TBD, example.invalid, unpinned image tags or missing mandatory inputs
- **THEN** validation fails with field names and safe error codes without printing credentials or applying resources

#### Scenario: Reproducible release
- **WHEN** the same release inputs are rendered twice
- **THEN** the resulting workload configuration refers to the same immutable frontend/API/worker/gateway images and qualified prompt releases

### Requirement: Validation is isolated from development and infrastructure
Configuration validation SHALL use only explicitly supplied target inputs and SHALL NOT read local development environment files, connect to target services, mutate resources or start containers. Offline validation results SHALL be distinguishable from external runtime qualification results.

#### Scenario: Development environment is present
- **WHEN** an operator validates production inputs on a machine containing .env.dev and running reqai
- **THEN** dev values are not inherited and the running reqai remains unchanged

#### Scenario: Offline checks pass
- **WHEN** render, schema and static policy checks pass without target connectivity
- **THEN** the result reports offline validation success and leaves target runtime gates unverified

### Requirement: Production authentication and tenant isolation fail closed
Production SHALL require authentication for protected API/MCP operations, validate token issuer, audience, signature and expiry, derive tenant/user/roles from approved identity claims and enforce existing server authorization. The frontend SHALL receive no service-account bearer token or client secret. Public health endpoints SHALL expose only non-sensitive status.

#### Scenario: Authentication is disabled
- **WHEN** a production profile explicitly disables API authentication or omits required identity inputs
- **THEN** production profile validation fails rather than falling back to the local default tenant

#### Scenario: Invalid identity or cross-tenant request
- **WHEN** an unauthenticated caller, a token with wrong audience, an insufficient role or another tenant requests protected data or a mutation
- **THEN** target qualification observes the appropriate 401/403/hidden-resource response without reading or modifying another tenant's data

### Requirement: Encrypted and verified production connections
Public application and enabled MCP endpoints SHALL use HTTPS with matching host certificates. PostgreSQL, Kafka and Temporal connections SHALL enable certificate verification using target trust configuration; disabling verification or substituting dev endpoints SHALL fail validation. Ingress SHALL route /api to API and application/deep-link routes to frontend without exposing internal databases, brokers or Temporal UI publicly.

#### Scenario: Invalid trust or insecure connection
- **WHEN** the target profile disables TLS or certificate validation on a required connection, or a runtime certificate is not trusted
- **THEN** offline validation rejects insecure policy and runtime qualification rejects the untrusted connection without insecure fallback

#### Scenario: Direct task link and API routing
- **WHEN** an authorized user opens /tasks/{jobId} directly, reloads it and reads /api through the public host
- **THEN** the frontend loads and canonical API data is returned under the same validated identity policy

### Requirement: Secrets are externally supplied and scoped by role
Production secrets SHALL be supplied outside Git and SHALL be referenced explicitly per workload. LLM credentials SHALL reach only workflow workers and the API discussion path; event/maintenance workers and MCP/frontend SHALL NOT receive them. MCP readiness credentials SHALL belong to a separate least-privilege identity. Validators, logs and rendered review outputs SHALL show secret names/presence only.

#### Scenario: Excess credential exposure
- **WHEN** a role imports a secret containing credentials it is not permitted to receive
- **THEN** static qualification fails before application of the manifest

#### Scenario: Missing or unavailable secret
- **WHEN** a required secret reference cannot be satisfied in the target environment
- **THEN** runtime qualification fails safely without displaying the secret value or starting an unprotected fallback

### Requirement: First production launch uses clean isolated storage
The first production environment SHALL use storage and execution namespaces isolated from development. It SHALL NOT import development database rows, artifacts, outbox/events, Kafka data or Temporal histories, and SHALL NOT mount or reuse development volumes. Existing dev data SHALL remain untouched. All required schema migrations and service namespace/topic initialization SHALL still run against the empty target stores using the released code.

#### Scenario: Clean first launch
- **WHEN** the operator bootstraps a new production environment
- **THEN** required schemas/namespaces/topics exist, dev jobs/artifacts/diagnostics are absent, and a synthetic authorized context → decomposition → saved version → research → final/export workflow succeeds and survives restart

#### Scenario: Accidental reuse of dev storage
- **WHEN** target inputs identify known development volumes, databases, broker storage or execution namespaces
- **THEN** the first-launch preflight fails without deleting, clearing or copying that storage

#### Scenario: No historical diagnostics migration
- **WHEN** the environment is confirmed as a fresh isolated launch without imported histories
- **THEN** cleaning or migrating existing dev diagnostics is not a prerequisite to this launch; the new environment still enforces privacy and retention for data created after launch

### Requirement: Optional MCP is enabled only after schema qualification
The production profile SHALL keep MCP disabled until explicitly selected and qualified. An enabled gateway SHALL use authenticated HTTPS Streamable HTTP, approved Host/network exposure, same-audience identity forwarding and tool schema 3.0.0 with exactly four approved tools. Supported client qualification SHALL reject unexpected tool schemas and SHALL read artifact content only through the authorized REST API.

#### Scenario: MCP is not selected
- **WHEN** the first release does not enable MCP
- **THEN** no usable public MCP route or running gateway workload is required and the main product remains usable

#### Scenario: MCP canary succeeds
- **WHEN** an approved client initializes an enabled gateway
- **THEN** it observes schema 3.0.0 and the exact four tools, exercises canonical safe reads and asynchronous admissions, and unauthorized/wrong-audience calls fail

### Requirement: Production workloads meet their runtime security context
The exact release images SHALL start with the declared non-root/read-only security policy, satisfy liveness/readiness probes and access only explicitly writable runtime paths. API and both workflow queues, event and maintenance workers SHALL function under the same qualified configuration. SIGTERM/drain and restart SHALL preserve accepted job state and immutable versions.

#### Scenario: Frontend runtime qualification
- **WHEN** the exact Nginx image starts under the target security context
- **THEN** its cache/PID paths are writable, probes succeed, static resources load and direct nested routes work

#### Scenario: Worker restart after admission
- **WHEN** a qualified worker restarts after accepting synthetic work
- **THEN** the same canonical job resumes or reaches a defined terminal state without duplicate immutable results or lost state

### Requirement: Backup and rollback apply to new production data
Before opening access, the release SHALL document and qualify backup/restore, retention, rollback compatibility and operator ownership for newly created production data. RPO/RTO and provider quotas SHALL be supplied by the environment owner rather than invented. Rollback SHALL use a coordinated compatible frontend/API/worker/optional-gateway/prompt set and SHALL NOT restore or import old dev data.

#### Scenario: Restore or rollback gate is missing
- **WHEN** a release has no confirmed restore/rollback evidence or owner-approved operational targets
- **THEN** production readiness remains unconfirmed even if application tests and offline manifest validation pass

#### Scenario: Post-launch recovery
- **WHEN** synthetic production qualification data is restored or a compatible release is rolled back
- **THEN** canonical versions and tenant isolation remain intact and the resulting environment passes readiness and critical workflow checks
