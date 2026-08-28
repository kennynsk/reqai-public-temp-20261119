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

The prompt catalog must contain two active prompt bundles: `requirements-decomposition` and `requirements-insights`. OpenAPI must match every runtime route. MCP schema `2.1.0` must expose five tools, including bounded result-content retrieval. Client qualification covers the guided workflow, linked insight review, cancellation, permanent task URLs, SSE reconciliation, Debug and archived read-only results.

`qualify:legacy-drain` requires `DATABASE_URL` and must report `activeCount: 0` before removal of compatible execution workers. `qualify:legacy-surface` prevents removed launch surfaces and configuration from returning. Evidence contains counts, versions and digests, never credentials, prompts or artifact content.

## Environment gates

Run `qualify:load`, `qualify:soak`, `qualify:security`, `qualify:drill`, `qualify:failover`, `qualify:task-routing` and finally `qualify:rollout-gate` according to the approved change record. Disruptive drills require `QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND`. Production publication additionally requires IAM/tenant canary, provider quota calibration, Temporal/Kafka/PostgreSQL resilience, backup/restore evidence and external security/operations sign-off.

Historical implementation evidence for retired contracts remains in archived OpenSpec changes and release records; it is not part of the current acceptance baseline.
