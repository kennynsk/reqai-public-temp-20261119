# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` and `docs/` carry the same product boundary in more detail; keep both coherent when it changes.

## What this is

ReqAI (npm workspaces: `client/`, `server/`, `mcp-gateway/`) turns business context into reviewed requirements through one guided workflow: context input → asynchronous LLM decomposition → human review and immutable requirements-version storage → optional requirements-linked research → final immutable version. Node 22, ESM everywhere. The full stack (React/Nginx, Express API, PostgreSQL, Kafka, Temporal, workflow/event/maintenance workers, optional MCP) runs via Docker Compose.

## Commands

```bash
npm run dev                # full stack, foreground (npm run dev:detached for background, npm run dev:stop to stop)
npm -w client test         # vitest run
npm -w client run lint     # eslint
npm -w client run build
npm -w server test         # node --test (tests in server/test/*.test.js)
npm -w mcp-gateway test    # node --test
npm -w server run prompts:qualify   # required after prompt changes
npm run qualify:legacy-surface      # required after API, MCP, prompts, Compose, deploy, or docs changes
npm -w server run db:migrate        # server migrations
```

Local endpoints: Vite dev frontend with `/api` proxy `http://localhost:5177`; Nginx frontend/proxy `http://localhost:8080`; backend API `http://localhost:5178`; Temporal UI `http://localhost:8088`; MCP gateway (profile `mcp`, off by default) `http://localhost:5180/mcp`. Config template: `server/env.example`, copied to `.env.dev`; variable catalog in `docs/configuration.md`.

## Hard product boundaries

- Only two creation endpoints exist: `POST /api/v1/decompositions` and `POST /api/v1/requirements/versions/{versionId}/research`. Status/result/cancel live under `/api/v1/jobs/{jobId}`. Contract: `docs/api/openapi.v1.json`.
- Standalone research, model comparison, arbitrary prompt testing, and combined modes are retired. Historical jobs from those modes are read-only — never add retry/recreate mutations for them.
- MCP is a thin REST adapter exposing exactly: `decompose_requirements`, `research_requirements`, `get_task_status`, `get_task_result`. It must not import backend repositories/workflows/providers, execute prompts, or wait for LLM completion.
- The browser submits work and reads canonical state; it never orchestrates LLM calls.
- Temporal task queues: `requirements-decomposition` and `requirements-research`. Prompt bundles under `server/prompt-bundles/` are limited to `requirements-decomposition` and `requirements-insights`; published releases are immutable (manifest hashes + output contract). `server/decomposer-prompts.js` is the supported fallback when versioned prompts are disabled.

## Security rule

Never expose credentials, prompts, requirements text, or artifact content in logs, Kafka/Temporal metadata, MCP responses, or ordinary diagnostics. LLM keys reach only workflow workers and the API's requirement-discussion path — not event or maintenance workers. `mock` provider mode is local/test-only and rejected in production.

## Conventions

- Tests are colocated as `*.test.js(x)` next to sources; client tests use Vitest + Testing Library, server/gateway tests use `node --test`.
- Server layout: `src/routes` (Express), `src/services` (domain logic), `src/activities` + `src/workflows` (Temporal), `src/repositories` (PostgreSQL), `src/events` (Kafka), `src/provider` (LLM adapters). Keep those layer boundaries.
- UI text is Russian; keep user-facing copy consistent with the existing tone.

## Change workflow

OpenSpec changes live under `openspec/changes/` (proposal → specs → design → tasks → implementation → tests → docs kept coherent; use the openspec skills). Read `docs/functional-parity.md` and `docs/legacy-mode-retirement.md` before touching API surface or job modes; `docs/prompt-bundles.md` before touching prompts.
