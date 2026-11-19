## 1. UI estimate

- [x] 1.1 Change the decomposition duration hint to `обычно 2–4 минуты` without changing progress calculation.
- [x] 1.2 Update the frontend regression test and run the focused client test suite.
- [x] 1.3 Validate the OpenSpec change and inspect the updated text in the local browser.

## 2. Honest late-stage progress

- [x] 2.1 Update progress presentation helpers so assembly and persistence are represented as indeterminate stages while model analysis retains bounded estimated progress.
- [x] 2.2 Update the active job card and compact background indicator to replace frozen late-stage percentages with localized stage labels.
- [x] 2.3 Add accessible indeterminate progress semantics and a reduced-motion-safe visual treatment.
- [x] 2.4 Align the decomposition over-duration warning threshold with the four-minute upper estimate.
- [x] 2.5 Add helper and component regression tests for model, assembly, persistence, warning and terminal-success states.
- [x] 2.6 Validate the OpenSpec change and inspect the complete transition in the local browser.

## 3. Restore continuous overall percentage

- [x] 3.1 Replace indeterminate assembly and persistence presentation with bounded 90–94% and 95–99% phase estimates anchored to server `updatedAt`.
- [x] 3.2 Restore the visible percentage and `aria-valuenow` for late stages while retaining the localized stage label and explicit estimated semantics.
- [x] 3.3 Restore percentage display in the compact background indicator and remove obsolete indeterminate-only styling.
- [x] 3.4 Update helper and component tests for monotonic assembly, persistence, reload stability and terminal 100%.
- [x] 3.5 Run client regression checks, validate OpenSpec and inspect the complete transition in the local browser.
