## Context

The UI combines server-confirmed milestones with a bounded visual estimate
during model work. Once the server reports assembly, authoritative progress is
90%; persistence is 95%. The indeterminate late-stage presentation removed the
frozen percentage but also removed the continuous overall progress signal that
users prefer. Job DTOs already expose `updatedAt`, which changes with a
server-confirmed progress transition and can anchor a reload-safe phase-local
estimate without a backend contract change.

The visible hint says `обычно 2–4 минуты`, while the current over-duration
warning starts only after ten minutes. That mismatch delays the explanation at
exactly the moment users begin to doubt whether the task is still running.

## Goals / Non-Goals

**Goals:**

- Align the visible decomposition estimate with the measured post-tuning
  workflow duration.
- Keep the estimate intentionally wider than a single 1:49 run to account for
  provider variance.
- Preserve a single percentage across every execution phase.
- Make assembly and persistence visibly advance while preserving the
  authoritative milestone boundaries.
- Preserve correct estimated-progress semantics for assistive technology and
  reduced motion users.
- Align the over-duration warning with the visible upper estimate.

**Non-Goals:**

- Change backend milestones, APIs, persisted job shape or provider execution.
- Claim that an estimated percentage is a measured completion ratio.
- Rework the research-job estimate or presentation.
- Claim a statistically established SLA from the small local sample.

## Decisions

### Duration and warning

Use `обычно 2–4 минуты` for `DECOMPOSITION`. The lower bound reflects recent
runs and the upper bound communicates normal provider variation without making
the old five-to-ten-minute claim. Show `дольше обычного` after four elapsed
minutes. This is guidance rather than an SLA; the job remains cancellable and
can continue in the background.

### One bounded percentage across all phases

Keep the existing bounded visual estimate during model analysis. It must stay
below the server's assembly boundary so a later phase transition never moves
the UI backward.

When the server reports assembly, estimate within 90–94%. When it reports
persistence, estimate within 95–99%. Use the job's server-provided `updatedAt`
as the phase entry time and an asymptotic curve, so the estimate advances
quickly enough to remain perceptible but can never cross the next confirmed
milestone. Clamp against the authoritative value and preserve monotonicity.
Render `100%` only after the server confirms successful completion.

The active card shows both the percentage and localized stage name during late
phases, for example `92% · Сборка`. The compact background indicator keeps the
percentage visible and includes the stage in its accessible label.

### Accessibility and motion

The progress bar always keeps `aria-valuenow`. Estimated states expose
`aria-valuetext` that names the stage and says the percentage is an estimate;
terminal success is reported as server-confirmed 100%. Keep a subtle shimmer
as a secondary activity cue, while reduced-motion users receive the same
numeric changes without decorative motion.

## Risks / Trade-offs

- [Risk] A time-based estimate can be mistaken for measured work. → Label it as
  an estimate in accessible text, retain explicit stage chips and never cross
  a server-confirmed boundary.
- [Risk] `updatedAt` may be absent in a legacy job. → Fall back to the job start
  time while clamping to the phase range; never regress below authoritative
  progress.
- [Risk] Provider load can still make a run exceed four minutes. → The warning
  explains the delay without declaring failure, and the task remains
  cancellable or continuable in the background.
- [Risk] Animation can distract or imply speed. → Use a restrained shimmer and
  remove it under reduced-motion preferences.

## Migration Plan

No data migration or container-side configuration change is needed. Rebuild the
frontend image or restart the frontend dev server, run focused client tests,
then verify the transition through model analysis, assembly, persistence and
terminal success in the local browser.
