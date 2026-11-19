## Why

The product now has one coherent requirements journey—business context, decomposition, optional AI research, and a final requirements version—while the standalone modes under «Дополнительные инструменты» duplicate orchestration, expand the public contract, and preserve legacy product concepts that are no longer part of the intended experience. Removing that surface now reduces maintenance across the frontend, API, MCP gateway, workflows, prompt catalog, tests, configuration, and documentation before more clients depend on it.

## What Changes

- Remove the «Дополнительные инструменты» navigation and the standalone `STANDARD_RESEARCH`, `AGENT_RESEARCH`, `MODEL_COMPARE`, `AGENT_COMPARE`, and `PROMPT_TEST` user interfaces.
- Keep the guided `DECOMPOSITION` → reviewed requirements → optional `REQUIREMENTS_INSIGHTS` → final version flow as the only supported way to create new product work.
- **BREAKING** Remove standalone research creation from the domain API (`POST /api/v1/research`), capability discovery, and OpenAPI contract.
- **BREAKING** Restrict generic job creation so new jobs can use only `DECOMPOSITION` and `REQUIREMENTS_INSIGHTS`; retire the combined and standalone legacy modes from accepted mode enums and workflow dispatch.
- **BREAKING** Remove the MCP `start_research` tool and its backend operation; retain `decompose_requirements`, `research_requirements`, `get_task_status`, and `get_task_result`.
- Retire legacy workflow branches, prompt profiles, configuration, qualification fixtures, and result renderers that are used only by removed modes.
- Preserve read-only access to retained legacy jobs, results, artifacts, diagnostics, and task permalinks; do not permit retrying a legacy job into a newly executable legacy mode.
- Update product, API, MCP, prompt, configuration, operations, and parity documentation so they describe only the supported requirements workflow and explicitly document the compatibility window for retained legacy results.

## Capabilities

### New Capabilities

- `requirements-execution-surface`: Defines the only supported creation modes, removal of standalone research API exposure, and read-only compatibility for retained legacy jobs.
- `requirements-mcp-server`: Defines the reduced MCP tool surface aligned with decomposition and requirements-linked AI research.

### Modified Capabilities

- `frontend-guided-workflow`: Removes standalone legacy tools and makes the guided requirements workflow the sole interactive product surface while preserving historical result access.

## Impact

- Frontend navigation, state, submission forms, mode-specific result rendering, history behavior, and tests in `client/src`.
- API validation, discovery, domain routes, OpenAPI, job retry policy, workflow selection, activities, prompt profile/catalog/qualification code, configuration, and server tests.
- MCP schemas, operation mapping, REST client compatibility checks, tests, and gateway documentation.
- Prompt bundles and environment variables that exist only for standalone research and comparison modes.
- Documentation and qualification scripts that currently advertise «Дополнительные инструменты», standalone research, comparison, or prompt-testing capabilities.
- Existing persisted legacy jobs remain readable during their normal retention period; rollout must drain or explicitly cancel active legacy executions before workers stop supporting those modes.
