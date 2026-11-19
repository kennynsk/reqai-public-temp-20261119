## Why

The 2026-10-15 release audit reproduced destructive review cancellation, UTF-8 corruption and semantic overblocking, and found diagnostic, deployment and public-contract security gaps. Fix these before considering the checked working tree a release candidate.

## What Changes

- Make cancelled field drafts leave persisted review decisions unchanged; invalidate evidence when a real change is applied or saved.
- Stream UTF-8 decoding and reject unsupported, malformed or empty uploaded materials before paid execution.
- Allow explicitly justified non-obligation source fragments without weakening coverage of substantive conditions; publish a new immutable prompt release.
- Restrict ordinary trace/workflow diagnostics to safe structural metadata and scope Kubernetes credentials by role.
- **BREAKING**: remove generic HTTP job creation and extra MCP tools, enforcing the existing AGENTS boundary of two execution creation endpoints and four metadata-only MCP tools.
- Supply writable Nginx runtime paths, correct production instructions, and remediate applicable dependency advisories without changing real infrastructure.

## Capabilities

### New Capabilities
- `release-safety`: faithful input processing, reversible draft cancellation, scoped diagnostics and deployment qualification.

### Modified Capabilities
- `requirements-execution-surface`: enforce the two supported job creation paths.
- `requirements-mcp-server`: expose exactly the four approved tools without artifact content.

## Impact

Client review state/upload controls; server chunking, admission, prompt releases and diagnostics; MCP schemas; OpenAPI and current documentation; Kubernetes manifests and dependency locks. Existing jobs, immutable prompt releases and requirements versions remain readable. Validation uses only the already running local reqai and synthetic data; no new containers, commits, pushes or deployments.
