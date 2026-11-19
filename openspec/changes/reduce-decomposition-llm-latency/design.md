## Context

See `proposal.md` for the latency experiment and scope. The API creates an
immutable `configurationSnapshot` for every accepted job. Temporal activities
build a model policy from that snapshot, and `model-executor` passes the
selected per-model output budget to the provider. The ZAI adapter currently
supports `max_tokens` but has no way to set the provider's thinking mode.

The existing generic LLM settings are also used by requirements research, so a
global default change would unintentionally change another workflow. Existing
jobs must continue to use their stored snapshot, and old test fixtures may not
contain the new fields.

## Goals / Non-Goals

**Goals:**

- Scope the experiment to newly accepted `DECOMPOSITION` jobs.
- Make the effective settings visible in the immutable job snapshot and model
  attempt trace.
- Preserve provider retry/fallback, BABOK normalization and the one-pass
  contract recovery behavior.
- Allow an operator to restore the previous behavior through environment
  overrides without changing application code.

**Non-Goals:**

- Change prompt text, output schema, chunking, model priority or Temporal retry
  policy.
- Apply the new settings to `RESEARCH` jobs or add a thinking parameter to the
  GigaChat protocol.
- Make the `16 000` budget a hard limit on the final report size; it is the
  limit for each provider response, including a possible repair call.

## Decisions

### 1. Add decomposition-specific configuration

Add `llm.decompositionOutputTokens`, populated from
`LLM_DECOMPOSITION_OUTPUT_TOKENS_JSON` with a uniform `16 000` default, and
`llm.decompositionThinking`, populated from `LLM_DECOMPOSITION_THINKING` with
the default `disabled`. Validate the token map for every configured model and
allow only `enabled` or `disabled` thinking values.

The job service snapshots these values only when `featureMode` is
`DECOMPOSITION`; research keeps `llm.outputTokens` and has no thinking field.
This is preferred over changing `LLM_MODEL_OUTPUT_TOKENS_JSON` globally because
the latency experiment is not intended to alter the research workflow.

### 2. Carry the setting through the existing policy boundary

The snapshot's `thinking` value is added to `modelPolicy` and validated by
`validateModelPolicy`. `model-executor` passes it to every provider attempt and
records it with the attempt's effective output budget. This ensures fallback
models and the separately traced contract-repair call use the same immutable
experiment settings.

Fixtures and historical jobs without `thinking` remain valid; providers receive
no thinking field in that case. The GigaChat adapter ignores the optional field
and therefore keeps its current request format.

### 3. Encode ZAI's OpenAI-compatible request shape

`ZaiProvider` adds `thinking: { type: <mode> }` only when a mode is present and
continues to send `max_tokens` when a budget is present. The provider does not
choose defaults itself; configuration and job snapshots remain the source of
truth. This keeps the adapter reusable for non-decomposition callers and makes
the request body directly testable.

### 4. Verify both configuration and real workflow behavior

Unit tests cover default and override parsing, snapshot scoping, policy
propagation and the exact ZAI request body. Existing contract-recovery tests
remain in place. After rebuilding API and worker images, run a synthetic browser
decomposition and inspect the task trace for `maxOutputTokens: 16000`, the
thinking mode and elapsed time.

## Risks / Trade-offs

- [Risk] A `16 000` response may truncate an unusually large BABOK registry. →
  Keep the setting per-model configurable, retain the existing contract repair
  path, and use the trace/output contract to decide whether to raise the
  budget.
- [Risk] Disabling reasoning can reduce extraction quality for ambiguous input.
  → Compare the real run's contract validity, counts, GAP/questions and trace
  against the previous baseline before treating the change as permanent.
- [Risk] A job accepted by an older API may not have the new snapshot fields.
  → Preserve fallback behavior to existing generic settings and do not mutate
  stored snapshots.

## Migration Plan

1. Deploy the code with the defaults in this change and rebuild the API and
   decomposition-worker images.
2. Run one synthetic decomposition and inspect its task trace and result.
3. Roll back by setting `LLM_DECOMPOSITION_THINKING=enabled` and restoring a
   `16 000`/`32 000` per-model map as appropriate, or by reverting the change;
   already accepted jobs retain their original snapshot.
