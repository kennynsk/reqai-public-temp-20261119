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

## Second checkpoint — history, presentation and input

- Registry sections separate requirements/questions/links; appendices and empty analytical groups are collapsed. By-type filters, All scrolls/focuses the chosen group. View preferences migrate from the old rows/columns key. Material-coverage warnings remain outside collapsed appendices.
- History requests `GET /api/v1/jobs?groupBy=workflow&q=…&type=…&status=…`. Search runs against persisted authorized metadata, not the loaded page. Cursors bind to the query/filters. The old request without options still returns the old flat shape. Orphan or inaccessible-parent children remain directly accessible when authorized.
- `PATCH /api/v1/jobs/:jobId/metadata` accepts `{title, expectedRevision}`. Titles contain 1–120 characters, metadata revisions are independent of requirements versions, updates publish durable events to the visible workflow stages. Conflicting edits return 409 and the client keeps the local title for comparison.
- Migration 011 adds nullable title, bounded application-generated search summary, metadata revision and indexing timestamp. Initial title is deterministic, with no LLM call. Search summary uses the first 2,000 normalized characters of the first 8,000 input bytes, text artifacts only. Unavailable/binary inputs use a safe date/type fallback; this is not a full-document search engine.
- Resume old-task indexing using a trusted tenant scope, for example on this isolated stack: `docker compose -p reqai-ux -f compose.ux.yaml exec -T reqai-api node server/scripts/backfill-job-metadata.mjs --tenant default-enterprise --batches 5`. Each transaction processes at most 100 jobs; locked rows are skipped, renamed titles are preserved. The UI reports pending indexing. The script was run successfully on the isolated synthetic tenant (one old task indexed).
- Apply migration 011 before deploying API/workers. Rollback: return to previous application images and leave the additive columns intact. Do not delete titles, versions, artifacts or database volumes.
- Primary/baseline/reference files use the existing integration endpoint. Successful uploads survive another file's failure. The text helper only inserts/replaces after an explicit action. An unsent new-task draft survives reading history within the tab; it is not a cross-device draft service.
- Progress uses server percentage and known milestones only. Estimated duration is separately labelled; elapsed time never invents activities or raises progress. Next-run settings persist per tenant/user and show effective low for GLM-5.3/Flash. New results carry an immutable execution settings snapshot; old results explicitly report its absence.
- Browser checks on port 58080: rename the synthetic task to «Переговорные — UX-проверка истории», search by the new title, reload the second tab and verify the same title. No requirement version changed during rename. Automated tests cover old-page search, owner/tenant boundaries, orphan children, concurrent rename, backfill/restart, late search responses, title conflict, upload retry, context preservation and effective reasoning.
- OpenAPI local references now have an automated resolution check. This also repaired pre-existing misplaced error/response schemas and documented the already-supported BABOK version payload alongside legacy requirements.
- Checkpoint validation: 67 client tests passed; lint passed; 180 server tests passed with two opt-in database tests skipped in the regular run. Both database tests were explicitly run on port 55432 and passed. OpenSpec strict validation and diff whitespace checks passed. BABOK and legacy deletion/Undo are now covered, including retained identifiers and unrelated edits.
- Still pending: the complete responsive/keyboard/Back-Forward acceptance matrix, GAP decisions/completeness checks, exact AI proposal editing, saved-version exports and a real GLM end-to-end run. Build currently warns that the main JS chunk exceeds 500 kB; split optional panels before final acceptance if it remains above the threshold.
