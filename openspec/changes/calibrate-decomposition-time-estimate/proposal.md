## Why

The decomposition workflow now tells users to expect two to four minutes, but
real GLM runs can take longer and the server's late-stage milestones remain at
90% or 95% for the whole stage. Users prefer one continuous percentage across
the complete workflow, but the visible value must keep moving without crossing
the next server-confirmed boundary.

## What Changes

- Replace the decomposition duration hint with the conservative estimate
  `обычно 2–4 минуты`.
- Keep one visible percentage throughout preparation, AI analysis, assembly
  and persistence.
- Retain bounded estimated progress during AI analysis, add bounded late-stage
  estimates for assembly (90–94%) and persistence (95–99%), and never cross the
  next server-confirmed milestone.
- Anchor late-stage estimates to the server's phase update timestamp so they
  survive reloads and remain monotonic.
- Show both the current stage and estimated percentage in the active card and
  compact background-job indicator.
- Keep accessible text explicit that non-terminal percentages are estimates.
- Show `100%` only after the server confirms terminal success.
- Show the existing `дольше обычного` warning after four minutes, when the
  advertised expectation has actually been exceeded.
- Update frontend regression coverage and repeat the local browser check.

## Capabilities

No external API or workflow contract changes. This is an internal progress
presentation and accessibility change, so specifications remain intentionally
skipped.

## Impact

Affected frontend areas are `client/src/job-progress.js`, the active and
background job presentations in `client/src/AsyncJobWorkspace.jsx`, progress
styles in `client/src/index.css`, and their tests. The existing job `updatedAt`
field is reused; server milestones, APIs, provider behavior and persisted job
data remain unchanged.
