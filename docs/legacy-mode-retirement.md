# Historical migration: retirement of standalone research tools

Status: breaking contract change prepared on 2026-08-25.

This document is intentionally the only active documentation that names the retired launch surface. The former «Дополнительные инструменты» workspace and modes `DECOMPOSITION_WITH_INSIGHTS`, `STANDARD_RESEARCH`, `AGENT_RESEARCH`, `MODEL_COMPARE`, `AGENT_COMPARE`, and `PROMPT_TEST` are removed. REST `POST /api/v1/research` and MCP `start_research` are removed as well.

## Supported replacement paths

- Create decomposition with `POST /api/v1/decompositions` or MCP `decompose_requirements`.
- Save a reviewed requirements version, then create AI research with `POST /api/v1/requirements/versions/{versionId}/research` or MCP `research_requirements`.
- Read all tasks through canonical status/result endpoints or MCP read tools.

There is no replacement for arbitrary prompt testing or model/agent comparison inside ReqAI.

## Historical compatibility window

Existing database rows, artifacts, events, traces, audits and task permalinks are retained. Historical mode strings remain valid in status/result DTOs. UI renders those tasks as archived read-only records with safe metadata, Debug according to authorization and artifact download when available. Retry, reset, clone and every other restart path are rejected.

## Two-phase rollout

1. Deploy the admission block while the old compatible workers still exist. Verify retired creation routes/tools are unavailable and cancellation dispatch remains operational.
2. Run `npm run qualify:legacy-drain` for every target database and tenant scope. Continue only with `qualified: true` and `activeCount: 0`.
3. Deploy the reduced API, frontend, workers, prompt catalog, MCP gateway and configuration together. Run `npm run qualify:legacy-surface` and the full release suite.

Skipping the drain risks leaving a non-terminal workflow without its activity/prompt implementation.

## Rollback

Rollback requires the previous frontend, API and worker images together with their previous full configuration and prompt bundle set. Do not combine a previous worker image with the reduced configuration. No destructive database rollback is required because historical data is preserved and migrations remain additive. If an external MCP client still depends on the removed mutation, rollback the gateway image/schema and backend contract as one coordinated set.
