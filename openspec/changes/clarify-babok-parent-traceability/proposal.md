## Why

A real BABOK decomposition returned an NFR with a functional constraint link and a generic reference to a need. The final quality check required an explicit hierarchy edge, but both automatic repairs returned the same finding.

## What Changes

- Add an NFR hierarchy example to a new immutable decomposition prompt release.
- Provide a dedicated missing-parent finding and targeted repair guidance.
- Show the finding and its affected requirement in the task journal.

## Capabilities

### Modified Capabilities

- `requirements-execution-surface` gives automatic repair explicit instructions for missing parent relations.
- `task-debug-trace` identifies missing parent traceability in the journal.

## Impact

This change affects the decomposition prompt release, semantic quality findings, and the journal. The existing registry and repair schemas support the requested operation.
