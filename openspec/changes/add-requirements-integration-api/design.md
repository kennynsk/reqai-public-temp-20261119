## Context

See `proposal.md` for motivation. The asynchronous platform already exposes artifact upload, `POST /api/v1/jobs`, canonical job status/result/SSE resources, immutable requirements versions, JWT/RBAC/tenant middleware and separate Temporal worker pools. The frontend currently composes those low-level contracts directly. Decomposition and research activities import prompt-building functions whose instruction text is embedded in `server/decomposer-prompts.js` and `server/prompts.js`.

This change is additive and depends on the durable job platform established by `refactor-enterprise-async-platform`. It must preserve `jobId` as the only execution identity, retain reference-only control-plane payloads, avoid large JSON payloads, and keep protected prompt content out of ordinary logs, events and API responses.

## Goals / Non-Goals

**Goals:**

- Offer concise domain commands for decomposition, standalone research and requirements-version research while retaining the existing durable lifecycle.
- Make inline submission idempotent and atomic enough that retries cannot create duplicate jobs or uncontrolled input artifacts.
- Move production workflow instructions into immutable Git-versioned bundles and pin a complete compatible bundle to each job.
- Make REST a replaceable adapter over application operations so a future MCP adapter can reuse authorization, validation and orchestration.
- Preserve existing frontend and direct `/api/v1/jobs` clients while the new endpoints are adopted.

**Non-Goals:**

- Implement, deploy or advertise an MCP server in this change.
- Replace `/api/v1/jobs`, artifact APIs, Temporal workflows, requirements versions or the enterprise IAM provider.
- Add a runtime prompt-editing admin UI, database prompt registry, marketplace or remote prompt-management dependency.
- Allow arbitrary client-supplied production prompts or expose internal comparison and prompt-test modes through the domain endpoints.
- Remove legacy synchronous routes; their retirement remains part of the existing enterprise rollout.

## Decisions

### 1. Keep `/api/v1/jobs` canonical and implement domain endpoints as adapters

Add three resource-oriented submissions:

| Endpoint | Domain input | Canonical mapping |
| --- | --- | --- |
| `POST /api/v1/decompositions` | `businessContext` XOR `inputArtifactId`, execution options | `DECOMPOSITION` / `DECOMPOSITION` |
| `POST /api/v1/research` | `researchContext` XOR `inputArtifactId`, `strategy` | `RESEARCH` / `STANDARD_RESEARCH` or `AGENT_RESEARCH` |
| `POST /api/v1/requirements/versions/{versionId}/research` | execution options only | `RESEARCH` / `REQUIREMENTS_INSIGHTS`, with server-derived parent and input lineage |

All return the existing accepted-job envelope and canonical follow-up URLs. Status, cancellation, events and result retrieval remain under `/api/v1/jobs/{jobId}`; no parallel decomposition or research resource state is persisted.

The decomposition façade always maps to plain `DECOMPOSITION`; it has no `withInsights` switch. Requirements insights are a separate research operation over an immutable requirements version. The generic `/api/v1/jobs` contract may continue accepting the historical `DECOMPOSITION_WITH_INSIGHTS` mode for backward compatibility, but that mode is not exposed through the domain façade and uses an explicitly compatibility-scoped prompt profile rather than redefining the production decomposition bundle.

Unknown fields are rejected. Inline content and artifact reference are mutually exclusive. Inline JSON remains under the API parser limit; callers use the existing streaming artifact endpoint for larger input. The first domain research contract exposes only `standard` and `agent` strategies. Comparison and prompt testing remain expert job modes rather than stable domain operations.

Alternative considered: replace generic jobs with dedicated decomposition and research tables/resources. Rejected because it would duplicate state machines, identifiers, events, authorization and operational controls.

### 2. Put orchestration behind transport-neutral application operations

Introduce an application service whose commands accept plain domain DTOs plus an explicit `auth`, `idempotencyKey` and request context. It owns:

- `startDecomposition`;
- `startStandaloneResearch`;
- `startRequirementsResearch`;
- canonical request hashing and prompt-profile resolution;
- mapping product strategies to internal job modes;
- delegation to artifact, requirements-version and job services.

Express routes only parse HTTP, invoke these operations and format the accepted response. The service does not depend on Express request/response objects. Existing job query services remain the read boundary.

A future MCP adapter will map tools such as `decompose_requirements`, `research_requirements`, `get_task_status` and `get_task_result` to the same application and query services. Start tools return immediately with `jobId`; they do not hold an MCP call open for LLM completion. MCP connection identity must first be converted into the same verified auth context used by REST.

Alternative considered: have an MCP server call the REST API even when deployed in the same application. That remains possible for an independently deployed gateway, but the shared application boundary avoids an unnecessary internal HTTP hop and prevents transport-specific business logic.

### 3. Make inline submission and idempotency use a stable domain request identity

For inline content, compute the canonical request hash from content SHA-256, domain operation, normalized strategy/options and requested prompt version before allocating an artifact identifier. For referenced content, hash the authorized artifact ID and its immutable checksum with the same normalized options.

The persistence operation checks `(tenant, principal, idempotencyKey)` and request hash before creating new state. For a new inline request, input artifact creation, job acceptance, outbox event and audit record are committed in one database transaction where supported by the shared PostgreSQL repositories. An identical replay returns the existing job without creating another artifact. A conflicting replay returns `409`.

If the storage implementation cannot share that transaction, it must create inline artifacts with short-lived pending ownership and deterministically attach or clean them after job acceptance; this is a fallback, not the default PostgreSQL path.

Alternative considered: call the existing upload endpoint internally and then submit a job. Rejected for inline input because random artifact IDs make request hashing unstable and can leave an artifact on every failed or replayed request.

### 4. Derive requirements-research lineage from the version resource

Extend the requirements-version application service with an authorized resolution operation that returns the immutable version artifact, source decomposition job and eligibility facts. The nested research endpoint accepts no `parentJobId`, `inputArtifactId`, `tenantId` or internal mode. It maps the resolved values into the existing job service validation and persists the same child lineage already used by the frontend flow.

This removes knowledge of storage topology from external clients and closes the opportunity to submit a valid version with a mismatched parent job.

Alternative considered: retain `parentJobId` in the convenience request. Rejected because the server can derive it authoritatively and duplicate identifiers create inconsistent combinations clients must handle.

### 5. Use repository-owned immutable prompt bundles for the first implementation

Create `server/prompt-bundles/<bundle-id>/<version>/` directories. Each release contains a manifest and plain-text templates. A manifest includes at least:

```json
{
  "id": "requirements-decomposition",
  "version": "1.0.0",
  "workflowPurposes": ["DECOMPOSITION"],
  "outputSchemaVersion": "decomposition.v1",
  "templates": {
    "decompose": {
      "path": "decompose.md",
      "requiredVariables": ["businessContext"],
      "sha256": "..."
    }
  }
}
```

Research modes receive complete bundles containing every prompt step they can execute. Bundle files are reviewed and versioned in Git, packaged into API and worker images, and never edited in place after release. A catalog loader validates unique identity, paths, declared variables, hashes, allowed workflow purposes and known output contracts at startup and in qualification tests.

`requirements-decomposition` contains only the decomposition template and supports only the `DECOMPOSITION` purpose. `requirements-insights` contains the separate post-review research prompt. If the historical generic combined mode is retained, its two-step templates live in a separately named compatibility bundle so bundle contents cannot imply that insights are part of the domain decomposition operation.

The loader is behind a small registry interface so a later database or remote registry can replace file lookup without changing workflow activities. No remote dependency is introduced now.

Alternative considered: store active prompt text directly in environment variables. Rejected because multiline content is difficult to review, hash, test and retain. A database registry was deferred because hot editing, approvals, caching and HA consistency are a separate product capability.

### 6. Snapshot a complete prompt profile when accepting every production job

The job service resolves a bundle from `(job type, feature mode, optional requested version)` and stores this structure in `configuration_snapshot`:

```json
{
  "promptProfile": {
    "id": "requirements-decomposition",
    "version": "1.0.0",
    "manifestHash": "...",
    "outputSchemaVersion": "decomposition.v1",
    "templates": {
      "decompose": { "sha256": "..." }
    }
  }
}
```

Configured active versions are environment-level non-secret configuration. Optional `promptVersion` is accepted only for released versions included in the workflow's allowlist. The generic job endpoint and domain endpoints use the same resolver, preventing different prompt behavior by transport.

Workflow activities no longer choose an active version. They load only the snapshotted profile, verify hashes and render the named step. Linked retries copy the original profile. An explicitly new run can select the then-active version.

All released versions referenced by jobs remain in worker images for at least the configured input/job retry lifetime. Deployment tooling validates that new workers contain both historical supported bundles and any version about to be activated.

Alternative considered: resolve the active prompt independently in each activity. Rejected because a configuration change could mix versions across chunks, retries or research stages.

### 7. Separate prompt rendering from output contract validation

The renderer receives a verified profile, template step and an object of declared variables. It rejects missing or extra privileged variables, applies deterministic substitution and enforces rendered-size limits. User content is inserted only into designated data slots; it cannot select a file, version or template step.

Each manifest references an output contract identifier rather than embedding parser code. An output-contract registry maps identifiers such as `decomposition.v1` and `requirements-insights.v1` to the existing parse/normalize/validation behavior. Bundle activation tests render fixtures and run model-independent response fixtures through the matching contract. A new output shape requires a new contract identifier and compatible workers before activation.

Arbitrary user prompts in `PROMPT_TEST` remain user input and are not treated as released production templates. Any platform-owned default system instruction used by that mode can be migrated separately, but prompt-test content does not become selectable by decomposition or research jobs.

Alternative considered: infer output compatibility from bundle version. Rejected because prompt wording and result schema evolve independently and need explicit compatibility checks.

### 7a. Make the default local development command run the current stack

The repository-root `npm run dev` command starts the Docker Compose stack used by the current enterprise UI and backend. The former standalone Node/Vite launcher remains available only as `npm run dev:legacy` for deliberate compatibility investigation. Documentation identifies port `8080` as the current UI entrypoint and labels the standalone mode as legacy.

This avoids an environment-dependent product switch: standalone Vite did not receive the Docker build-time enterprise feature configuration and therefore rendered the retired interface even though the source branch was current.

### 8. Reuse existing authorization and protect prompt content

New routes run behind the existing JWT middleware and role checks. The verified token supplies principal, tenant and mapped roles; request schemas reject `tenantId`. Service-account tokens use the same IAM/NGAM verification and role mapping as human tokens. This change does not issue tokens or define a new identity protocol.

Domain audit records include operation, job ID, source artifact/version references, idempotency replay and safe prompt-profile metadata. Ordinary responses, events and logs expose only identifiers, versions, schema versions and hashes. Full rendered prompts remain available only through the existing protected diagnostic artifact and retention policy.

Alternative considered: API keys dedicated to the façade. Rejected because they would create a second identity and tenant model alongside enterprise JWT.

### 9. Treat OpenAPI as the external integration contract

Extend OpenAPI v1 with strict one-of request schemas, product strategy enums, `promptVersion`, idempotency headers, accepted responses and canonical error cases. Capability discovery identifies domain endpoints and released/selectable prompt metadata only when policy permits; it does not return templates.

Contract tests prove that wrappers create the same canonical job records as low-level submissions, reject unsupported technical fields, preserve owner/tenant isolation and never invoke legacy synchronous handlers.

### 10. Keep documentation aligned with executable contracts

OpenAPI is the machine-readable source for supported external and operational HTTP routes. README and human-facing integration documents describe the current guided workflow first and label standalone Node/Vite, OpenRouter and synchronous endpoints as legacy-only. Configuration documentation uses only environment names parsed by `loadConfig`; proposed platform settings that are not implemented remain explicitly marked as future/TBD rather than presented as active variables.

Contract checks compare the documented route inventory with the Express router for public, admin and discovery endpoints, while health and metrics remain documented as system endpoints. Documentation qualification also verifies current prompt-bundle inventory and the separation between primary requirements insights and the multi-step tools workflows.

## Risks / Trade-offs

- **[Risk] API and worker images temporarily contain different prompt catalogs during rolling deployment.** → Deploy compatible workers first, validate bundle inventory, activate only after readiness confirms support, and keep old bundles during the retention window.
- **[Risk] Convenience endpoints drift from `/api/v1/jobs` admission or authorization behavior.** → Centralize submission in application/job services and add parity contract tests rather than duplicating route logic.
- **[Risk] Inline idempotent submission leaves orphan artifacts.** → Use stable pre-allocation hashes and one PostgreSQL transaction; retain bounded pending-artifact cleanup only as a storage-adapter fallback.
- **[Risk] A prompt update produces syntactically valid but semantically worse requirements.** → Require versioned fixtures/evals and staged activation; retain one-step rollback for new jobs while preserving old job snapshots.
- **[Risk] Prompt and parser versions become incompatible.** → Name output contracts explicitly, validate compatibility before activation and fail closed instead of silently switching parser or bundle.
- **[Risk] Prompt content leaks through integration metadata or MCP responses.** → Expose only safe profile metadata and keep full content under protected diagnostic authorization, audit and retention.
- **[Trade-off] Git-packaged bundles require deployment to publish or activate previously unavailable content.** → Accept this governance for the first enterprise version; the registry interface preserves a later path to approved runtime publishing.
- **[Trade-off] Domain clients still use canonical job endpoints after submission.** → This keeps one durable lifecycle and avoids duplicating status/result resources; future SDKs or MCP tools can hide the follow-up mechanics.

## Migration Plan

1. Land or stabilize the prerequisite enterprise async job platform and preserve current `/api/v1/jobs` behavior.
2. Create initial `1.0.0` bundles by extracting current decomposition and research prompt text without intentional wording changes; generate manifests, hashes and output-contract fixtures.
3. Add catalog validation, prompt-profile configuration and snapshot fields while allowing pre-change jobs with no profile to finish through a temporary compatibility path.
4. Deploy workers containing the initial catalog and snapshot-aware rendering, then deploy API instances that resolve profiles for newly accepted jobs.
5. Activate versioned prompts for new generic jobs, compare outputs against baseline fixtures and monitor prompt-integrity/output-validation failures.
6. Add domain application operations and REST routes behind an additive feature flag, publish OpenAPI, and canary service-account and human-client submissions.
7. Move the frontend to domain submission endpoints only if desired; direct `/api/v1/jobs` clients remain supported.
8. After all pre-change jobs have drained, remove hardcoded production prompt builders and the temporary no-profile worker path. Keep legacy synchronous endpoint retirement in its existing rollout.
9. After the REST integration and protocol-neutral adapter boundary are accepted, create and strictly validate the linked OpenSpec change `add-requirements-mcp-server`. That follow-up must depend on this change and cover the actual MCP server, tool publication, transport authentication, deployment, security and end-to-end qualification. Do not declare this change implementation-complete or ready to archive until the follow-up change exists.

Rollback is additive: disable domain route exposure while leaving canonical jobs available, or restore the prior active bundle version for newly accepted jobs. Existing jobs always continue with their saved profile. Database additions remain backward-compatible until a later cleanup change.
