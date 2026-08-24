# Versioned Prompt Bundles

Production decomposition and research instructions live under `server/prompt-bundles/<bundle>/<version>/`. A release directory is immutable after publication and contains plain-text templates plus `manifest.json`. The manifest declares workflow purposes, required variables, an output contract and SHA-256 for every template. Startup fails closed for missing or altered released content.

Active and retained releases are configured independently for decomposition, requirements insights, standard research and agent research. `requirements-decomposition` contains only `decompose.md`; the later requirements research uses the separate `requirements-insights` bundle. The historical generic `/api/v1/jobs` mode `DECOMPOSITION_WITH_INSIGHTS` is isolated in `legacy-decomposition-with-insights` and is never selected by `/api/v1/decompositions`.

| Bundle | Purposes | Product surface | Templates used |
|---|---|---|---|
| `requirements-decomposition` | `DECOMPOSITION` | Primary guided workflow | decomposition only |
| `requirements-insights` | `REQUIREMENTS_INSIGHTS` | Optional stage 3 of the guided workflow | one `insights` template |
| `standard-research` | `STANDARD_RESEARCH`, `MODEL_COMPARE` | Additional tools | analyze, category research, synthesis and improve chain |
| `agent-research` | `AGENT_RESEARCH`, `AGENT_COMPARE` | Additional tools | agent chain plus the standard baseline required by agent comparison |
| `legacy-decomposition-with-insights` | `DECOMPOSITION_WITH_INSIGHTS` | Generic jobs compatibility only | historical two-step combined workflow |

`AGENT_RESEARCH` itself uses `agent-analyze`, `agent-research`, `synthesis` and `agent-improve`. The standard templates in the same atomic bundle are used only by `AGENT_COMPARE`, which executes both branches under one snapshotted profile.

`*_ACTIVE_VERSION` selects only newly accepted jobs; `*_RELEASED_VERSIONS` is a bounded allowlist and must retain every version referenced by retryable or running jobs. `promptVersion` may select only an allowlisted release. Full template text and rendered prompts are never returned through ordinary APIs, logs or events.

## Release procedure

1. Create a new semantic-version directory; never edit a published directory.
2. Render parity/evaluation fixtures and verify the declared output contract.
3. Package the new and retained directories into API and worker images.
4. Deploy workers first and qualify their catalog inventory and output contracts.
5. Deploy API instances, then add the version to the released allowlist.
6. Change the active version only after worker qualification evidence is available.

Rollback changes the active version for new jobs. Existing jobs and linked retries keep the profile stored in `configuration_snapshot`. Do not remove historical bundles until the job, retry and retention windows have elapsed. The temporary hardcoded-builder path exists only for jobs accepted before prompt profiles were introduced.

Baseline manifests for the first release are produced by `node server/scripts/generate-prompt-bundles.mjs`; qualification tests prove byte-for-byte rendering parity with the previous builders. Treat regenerated changes as reviewed release artifacts.
