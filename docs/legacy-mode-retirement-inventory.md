# Legacy mode retirement inventory

This inventory is the deletion boundary for `remove-legacy-research-tools`. A row marked **shared** must remain or be narrowed only after supported `DECOMPOSITION` and `REQUIREMENTS_INSIGHTS` tests prove parity.

## Mode ownership

| Mode | Product entry | Workflow branch | Prompt profile | Retirement |
| --- | --- | --- | --- | --- |
| `DECOMPOSITION_WITH_INSIGHTS` | Generic jobs compatibility | Combined decomposition and insights | `legacy-decomposition-with-insights` | Remove creation and execution; retain reads |
| `STANDARD_RESEARCH` | Additional tools | Standard analyze/research/synthesis/improve | `standard-research` | Remove |
| `AGENT_RESEARCH` | Additional tools | Agent analyze/research/synthesis/improve | `agent-research` | Remove |
| `MODEL_COMPARE` | Additional tools | Two model/temperature variants | `standard-research` | Remove |
| `AGENT_COMPARE` | Additional tools | Standard and agent branches | `agent-research` | Remove |
| `PROMPT_TEST` | Additional tools | Arbitrary prompt execution | none | Remove |

## Dependency boundary

| Area | Legacy-exclusive dependencies to remove | Shared dependencies to preserve |
| --- | --- | --- |
| Frontend | `RESEARCH_MODES`, tools workspace/navigation, standalone form state, comparison and prompt-test inputs, standalone result tabs | Guided stages, requirements editors, insight cards, history, permalink/SSE, Debug, artifact download |
| API | `POST /api/v1/research`, `standalone-research` discovery, retired create-mode validation | `/decompositions`, requirements-version research, canonical job/status/result/events/artifact/trace reads |
| MCP | `start_research`, `startResearch`, standalone schema and compatibility requirement | decomposition, requirements research, status and result tools |
| Workflow | combined, prompt-test, model-compare, agent-compare, standalone standard/agent branches | cancellation boundary, decomposition workflow, `REQUIREMENTS_INSIGHTS`, durable finalizers |
| Activities | combined-result generation and prompt-test handler; comparison assembly paths after reference proof | input validation, model execution, requirements insights, checkpointing, result persistence |
| Prompts | legacy combined, standard research, agent research bundles and mappings | requirements decomposition and requirements-insights bundles |
| Configuration | legacy/standard/agent prompt release environment policy | decomposition and requirements-insights release policy, model and queue policy |
| Qualification | mode matrices and fixtures for retired creation paths | cancellation, decomposition, linked research, historical read and permalink checks |
| Documentation | Additional tools, standalone route/tool, comparison and prompt-test instructions | guided workflow, canonical lifecycle, API/MCP reads, retention and operations |

## Historical compatibility boundary

Persisted job rows, artifacts, events, traces, audits, result metadata, and task permalinks are not deleted or rewritten. Read DTOs must continue to carry historical mode strings. No UI, API, MCP, retry, reset, or clone operation may create a new execution of a retired mode.

## Cleanup gate

Before deleting legacy workflow or prompt support, run `npm run qualify:legacy-drain` against every tenant/database targeted by the cleanup deployment. The command must report zero jobs in `ACCEPTED`, `QUEUED`, `RUNNING`, `RETRY_WAIT`, or `CANCEL_REQUESTED` for all retired modes.
