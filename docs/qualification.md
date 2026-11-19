# Enterprise qualification and rollout evidence

Production qualification tasks close only from immutable evidence generated in the approved environment. Mock runs verify contracts but do not replace IAM, provider, load, failover, backup/restore and operations sign-off.

## Product release gates

The supported product paths are decomposition and requirements-version AI research. A release must pass:

```bash
npm -w client test
npm -w client run lint
npm -w client run build
npm -w server test
npm -w server run prompts:qualify
npm -w mcp-gateway test
npm run qualify:legacy-surface
npm run qualify:legacy-drain
```

The prompt catalog must contain two active prompt bundles: `requirements-decomposition` and `requirements-insights`. OpenAPI must match every runtime route. MCP schema `3.0.0` must expose exactly four metadata-only tools. Artifact upload/content and cancellation use authorized REST operations; the client rejects a different schema version. Client qualification covers the guided workflow, linked insight review, cancellation, permanent task URLs, SSE reconciliation, Debug and archived read-only results.

For an existing environment, `qualify:legacy-drain` requires `DATABASE_URL` and must report `activeCount: 0` before removal of compatible execution workers. The first production launch uses separate empty stores without importing dev jobs, artifacts, events or diagnostics; dev-history cleanup/drain is not a prerequisite for that fresh launch, and normal schema migrations still apply. `qualify:legacy-surface` prevents removed launch surfaces and configuration from returning. Evidence contains counts, versions and digests, never credentials, prompts or artifact content.

## Environment gates

Run `qualify:load`, `qualify:soak`, `qualify:security`, `qualify:drill`, `qualify:failover`, `qualify:task-routing` and finally `qualify:rollout-gate` according to the approved change record. Disruptive drills require `QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND`. Production publication additionally requires IAM/tenant canary, provider quota calibration, Temporal/Kafka/PostgreSQL resilience, backup/restore evidence and external security/operations sign-off.

Historical implementation evidence for retired contracts remains in archived OpenSpec changes and release records; it is not part of the current acceptance baseline.

## Guided workload fixtures

Load and soak submit only decomposition and immutable-version research. Removed category-based modes and generic job admission are not used.

For `qualify:load`, set `QUAL_WORKLOAD_FIXTURES_FILE` to a JSON array with exactly one `{ "inputArtifactId": "<uuid>", "versionId": "<uuid>" }` per configured user, in the same order as `QUAL_BEARER_TOKENS_FILE`. Each artifact and saved immutable requirements version must be accessible to its corresponding test identity and eligible for submission. Do not put tokens or requirement text in the fixture file. The former single `QUAL_INPUT_ARTIFACT_ID` is insufficient for this mixed workload.

For `qualify:soak`, `QUAL_REQUIREMENTS_VERSION_ID` identifies an eligible immutable version owned by the first test identity. Its 100 MiB upload contains synthetic valid UTF-8 text. These commands may create many paid jobs; execute only in the approved qualification environment with a confirmed budget. Contract tests with fetch/timer stubs do not constitute load, resilience or soak evidence.
