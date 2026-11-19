## Why

The BABOK decomposition workflow spends most of its time in ZAI model
reasoning. A controlled benchmark showed that the current provider default
thinking mode and `32 000` output-token budget can make a single request take
many minutes, while the same prompt with thinking disabled and a `16 000`
budget completed in about one minute and still produced a recoverable
structured response.

The workflow needs an operationally adjustable first latency experiment while
preserving the existing JSON contract, normalization, contract-repair pass,
fallback policy and immutable job snapshots.

## What Changes

- Add decomposition-specific settings for ZAI thinking mode and output-token
  budget.
- Default decomposition requests to `thinking: disabled` and `max_tokens: 16
  000` per configured model.
- Carry both settings from API job snapshot through model policy and executor
  into the ZAI request body.
- Keep the settings configurable through environment variables so the
  experiment can be rolled back without a code change.
- Keep research requests on their existing settings and leave GigaChat request
  semantics unchanged.

This is an implementation/configuration change only; the decomposition output
schema and public job lifecycle remain unchanged.

## Capabilities

No capability or public contract is added. Specifications are intentionally
skipped for this operational tuning change.

## Impact

- `server/src/config/env.js` and `server/env.example` gain the two
  decomposition settings.
- Job configuration snapshots, model policy validation and the model executor
  carry the new thinking mode.
- `server/src/provider/zai-provider.js` sends the OpenAI-compatible `thinking`
  object and existing `max_tokens` value.
- Unit tests, configuration documentation and the worker/API images need to be
  updated and verified with a real synthetic decomposition run.
