# UX implementation — isolated worktree

Base: `4771717`; branch: `codex/requirements-ux-improvements`. The original checkout remains on `codex/integrate-babok-requirements-skill`. No merge or archive is authorized yet.

## OpenSpec reconciliation

The current main frontend spec still describes three legacy categories. The implemented `integrate-babok-requirements-skill` delta adds six BABOK types and evidence panels and modifies review, research cards and editor layout. At final spec synchronization, apply/reconcile that earlier delta first, then `improve-requirements-workspace-ux`. In particular, preserve the new explicit parent/child navigation and don't restore the old automatic SSE redirect. Integration API/MCP contracts remain additive. Do not archive `refactor-enterprise-async-platform` or any other change as part of this work.

## Isolated stack

Use `docker compose -p reqai-ux -f compose.ux.yaml up --build -d`. This file uses its own network and project-prefixed database/Kafka volumes. Exposed ports: frontend 58080, API 55178, PostgreSQL 55432, Kafka 59092, Temporal 57233, Temporal UI 58088, optional MCP 55180. Never run the default compose command from this worktree: its ports/network belong to the existing local stack.

The default provider is mock for deterministic development. For a real run, supply credentials in the git-ignored `.env.ux.local` and explicitly set `LLM_PROVIDER_MODE=zai`; select `glm-5.3-flash` and low in the UI. Do not commit credentials or copy production data. Real-provider tests are separate from mock acceptance tests.

To stop this stack, use `docker compose -p reqai-ux -f compose.ux.yaml stop`. Do not delete volumes on completion. The original stack is not stopped, migrated or rebuilt by these commands.

## Regression log

- Added two component tests for the room-booking audit. Both failed on the baseline: category switching lost the open draft; saved/next-step status ignored the pending card text.
- Shared drafts now include open text/structured editors, additions/removals and AI decisions; global save assembles them together. Card-level Done is local, never a server save.
- Frontend baseline plus new regressions: 61 passing tests. Lint and production build passed. Server: 175 passed, one opt-in PostgreSQL test skipped by default. The PostgreSQL test was also run explicitly on port 55432 and passed. OpenSpec strict validation passed.
- Real browser smoke (mock provider, isolated stack): create task, save an open new-record composer, edit text and success indicator, switch BR→FR→BR, Save-and-navigate, restore saved version from its permalink. Two independent tabs: remote version notification, stale-save conflict, explicit rebase preserving the first tab's wording and the second tab's success indicator, successful merged save.
- Synthetic browser task: `8d5b64b8-a61e-4124-a923-b72f5980aa4d` on port 58080. Mock output intentionally starts empty; manually added records test the editor, not AI extraction quality. No real GLM call has been made in this implementation stage.
- Session recovery is tenant/user/job-scoped with a 24-hour TTL. `setAccessToken` in `client/src/api/auth-session.js` is the integration point for same-tab authentication hosts; external token changes are reconciled on focus/storage/API access. This application currently has no separate sign-in/sign-out screen.
- Remaining acceptance: full Back/Forward and responsive/keyboard matrix, legacy delete/undo, review metadata/GAPs, proposal editing, history/search, settings/context, export, and real GLM end-to-end. Do not treat the initial implementation checkpoint as completion of the change.

## Migration and rollback for the first checkpoint

Migration 010 adds nullable save-identity columns and a partial unique index; old requests remain valid. Deploy the migration before the new API. Roll back application code first; the nullable columns may remain and do not require data deletion. Do not drop saved versions or volumes. Unknown-response retries reuse the client mutation identity while its content remains unchanged. The source-job lock serializes both new and legacy writers; replay does not emit a second version event.

The artifact write precedes the version transaction in the existing storage architecture. A concurrent replay loser or a conflict may leave an unreferenced artifact for normal retention cleanup, but cannot create a duplicate version/event. This checkpoint does not introduce destructive artifact cleanup.
