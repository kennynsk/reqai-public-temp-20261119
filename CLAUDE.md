# CLAUDE.md

This file provides repository guidance for coding agents.

## Product boundary

ReqAI supports one guided workflow:

1. Business context input or artifact upload.
2. Asynchronous `DECOMPOSITION` into business, functional, and non-functional requirements.
3. Human review and immutable requirements-version storage.
4. Optional requirements-linked `REQUIREMENTS_INSIGHTS` research.
5. Insight decisions and an immutable final requirements version.

After incomplete AI decomposition, recovered typed formulations open in the ordinary requirements registry as a draft. The review notice and linked questions guide the user before saving a version.

Standalone research, model/agent comparison, arbitrary prompt testing, and combined decomposition/research are retired. Historical jobs from those modes remain read-only through canonical task APIs and permalinks; never add a mutation that retries or recreates them.

Частичный результат AI-исследования отображается в истории как «Готово частично». Экран финала подтверждает сохранение только после записи финальной версии. Диагностика отклонённого ответа исследования содержит стадию, код и JSON-путь.

Задача, её история и экспорт показывают актуальную финальную редакцию всей связки декомпозиции и исследования. Сохранение нового итога требует актуальной финальной базы, если итог уже существует. Ранее сохранённые редакции доступны как неизменяемые версии.

## Commands

```bash
# Full local stack in the foreground
npm run dev

# Full local stack in the background
npm run dev:detached

# Client checks
npm -w client test
npm -w client run lint
npm -w client run build

# Backend and MCP checks
npm -w server test
npm -w mcp-gateway test
npm -w server run prompts:qualify
npm run qualify:legacy-surface
```

Local endpoints:

- frontend and `/api` proxy: `http://localhost:8080`;
- direct backend API: `http://localhost:5178`;
- Temporal UI: `http://localhost:8088`;
- optional MCP gateway: `http://localhost:5180/mcp`.

## Architecture

The repository is an npm workspace with `client/`, `server/`, and `mcp-gateway/` packages. Docker Compose runs React/Nginx, the Express API, PostgreSQL, Kafka, Temporal, decomposition/research workflow workers, event/maintenance workers, and optionally MCP.

### Client

`client/src/App.jsx` always renders `AsyncJobWorkspace.jsx`. The browser submits work and reads canonical state; it does not orchestrate LLM calls. Preserve task URLs `/tasks/{jobId}`, SSE reconciliation, cancellation, history, requirements-version lineage, Debug authorization, and archived read-only results.

### REST API

Supported creation operations:

- `POST /api/v1/decompositions`;
- `POST /api/v1/requirements/versions/{versionId}/research`.

Canonical status/result/cancellation resources live under `/api/v1/jobs/{jobId}`. Generic job creation accepts only decomposition; requirements research must derive its immutable input and lineage through the version-scoped route. The machine-readable contract is `docs/api/openapi.v1.json`.

### MCP

Tool schema `2.0.0` exposes exactly:

- `decompose_requirements`;
- `research_requirements`;
- `get_task_status`;
- `get_task_result`.

MCP is a thin REST adapter. It must not import backend repositories/workflows/providers, execute prompts, or wait for LLM completion.

### Workflows and prompts

Temporal uses two workflow task queues: `requirements-decomposition` and `requirements-research`. Prompt releases under `server/prompt-bundles/` are limited to:

- `requirements-decomposition`;
- `requirements-insights`.

Each published prompt release is immutable and verified by its manifest hashes and output contract. `server/decomposer-prompts.js` remains the supported fallback builder when versioned prompts are explicitly disabled.

## Environment

Configuration is documented in `docs/configuration.md`; the template is `server/env.example`. The normal local and production paths use the asynchronous platform. Select `LLM_PROVIDER_MODE=zai` or `gigachat` and configure the corresponding credentials; `mock` is test/local-only and rejected in production.

Do not expose credentials, prompts, requirements text, or artifact content in logs, Kafka/Temporal metadata, MCP responses, or ordinary diagnostics.

## Documentation and change workflow

Current product documentation lives in `README.md` and `docs/`. Historical mode names are allowed only in the explicitly labelled retirement inventory/migration documents and compatibility tests. Run `npm run qualify:legacy-surface` after changes to API, MCP, prompts, Compose, deployment, or documentation.

OpenSpec changes live under `openspec/changes/`. Follow the relevant OpenSpec skill and keep proposal, specs, design, tasks, implementation, tests, and documentation coherent.
