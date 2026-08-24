## Why

External AI agents and MCP-capable clients need governed access to ReqAI decomposition and research without learning the low-level artifact/job orchestration. The prerequisite `add-requirements-integration-api` now provides the shared asynchronous application boundary, so an MCP transport can be added without duplicating execution logic.

## What Changes

- Add a separately deployable enterprise MCP server that exposes asynchronous requirements decomposition, standalone research, requirements-version research, task status and task result tools.
- Delegate every tool to the application/query boundary delivered by `add-requirements-integration-api`; the MCP process does not execute prompts, call providers or access persistence directly.
- Authenticate MCP transports, derive the same principal/tenant/role context as REST, preserve idempotency and translate canonical safe errors.
- Publish tool schemas and capability discovery only when the MCP server is enabled and healthy.
- Add deployment, observability, security and end-to-end qualification for both an independently deployed REST-backed gateway and the selected production transport.

## Capabilities

### New Capabilities

- `requirements-mcp-server`: Enterprise MCP tools and transport behavior over the canonical requirements application and job-query boundaries.

### Modified Capabilities

None.

## Impact

This change depends on `add-requirements-integration-api`. It adds an MCP runtime/deployment unit, transport authentication configuration, tool schemas, adapter-to-REST or shared-service wiring, safe telemetry and end-to-end tests. Existing REST endpoints, job identities, prompt bundles, Temporal workflows and result resources remain canonical and backward compatible.
