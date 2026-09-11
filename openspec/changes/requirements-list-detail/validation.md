# Validation — 2026-09-11

## Scope and isolation

- Base branch remains `codex/integrate-babok-requirements-skill` at `ac257f36dcf33a5eb659342b2eb736e639772e29`.
- Work is on `codex/requirements-list-detail`; no merge, push, deployment, database migration or shared-stack restart.
- Planning commit: `de1b766`.
- Original approved composition is retained in `design-plans/requirements-prototype/index.html`.

## Automated checks

- `npm -w client test -- --maxWorkers=2`: **290 passed, 1 failed**, 37 files. All 9 new workspace integration tests pass, including hidden text/structured/link drafts, validation focus, type/search/quality intersections, adding to an empty type, independent new-record drafts, deletion/undo, immutable/final view compatibility and discussion context.
- The failure is pre-existing: `AsyncJobWorkspace.helpers.test.js`, “normalizes insight enhancement targets and historical fallbacks”, line 186. The historical unstructured insight fallback returns `undefined` where the test expects a nonfunctional requirement. Reproduced unchanged from an archive of the base branch in an isolated directory: 16 passed, the same 1 failed. No edits to that helper or expectation were made for this feature.
- An unrestricted concurrent run hit one 5-second GAP test timeout while build/preview checks also ran. The complete suite rerun with two workers passes that test and reports only the independently reproduced baseline failure.
- `npm -w client run lint`: passes.
- `npm -w client run build`: passes; Vite reports its >500 kB chunk advisory (main bundle about 514 kB).
- `openspec validate requirements-list-detail --strict`: passes.
- `npm run qualify:legacy-surface`: `qualified: true`.
- `git diff --check`: passes.

## Visual and browser checks

Rendered the real React components with synthetic room-booking data in an isolated static preview on localhost:8770. No backend requests or production data are required for this preview.

- Desktop: selector left, complete selected editor right, research-aligned panel/selection styling, existing header hierarchy preserved.
- Responsive fixture frames at 320, 390, 768, 1024 and 1440 CSS px: document scroll width does not exceed its available client width; below 1024 the selector is above the detail and limited to 288 px in the checked viewport. Narrow frame client widths exclude the browser scrollbar.
- Enlarged-layout check uses a 720 CSS px frame displayed at 2×, corresponding to the available width of a 1440 px viewport at 200%. This is an equivalent layout check, not a claim that native browser zoom was changed to 200%.
- At 390 CSS px, keyboard Enter selects a requirement; wording edits survive keyboard selection of another requirement and return; editing introduces no horizontal document overflow.
- Browser viewport overrides were reset after testing. Preview returned to the normal implementation view for review.

## Remaining limits

The complete client suite is not fully green because of the reproduced baseline failure above. This change does not repair that unrelated AI fallback. Backend end-to-end save/research was covered through existing mocked client contracts, not by running a new live LLM or deployment flow. The temporary preview is for reviewing the implementation; the committed application remains the source of truth.
