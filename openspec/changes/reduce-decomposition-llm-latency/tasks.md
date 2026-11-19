## 1. Configuration and immutable job policy

- [x] 1.1 Add validated decomposition-specific thinking and output-token settings with `disabled`/`16 000` defaults and environment overrides.
- [x] 1.2 Snapshot those settings only for new `DECOMPOSITION` jobs while preserving existing research settings and backward compatibility for old snapshots.

## 2. Provider execution

- [x] 2.1 Propagate the thinking mode through model policy validation and the model executor, including fallback and contract-repair attempts.
- [x] 2.2 Send the optional ZAI `thinking` object together with the effective `max_tokens` budget without changing GigaChat behavior.
- [x] 2.3 Extend model-attempt trace metadata so the effective thinking mode and output budget are observable.

## 3. Tests and operational verification

- [x] 3.1 Add/update unit tests for configuration defaults/overrides, job snapshot scoping, policy propagation and the exact ZAI request body.
- [x] 3.2 Update environment/configuration documentation and validate the OpenSpec change artifacts.
- [x] 3.3 Rebuild API and decomposition-worker images, run the relevant automated tests, and execute one real synthetic browser decomposition to compare latency and output validity.
