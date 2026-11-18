## Context

The compact stage-two header already derives primary actions from persisted version and linked job state. The list-and-detail registry is the current BABOK review composition.

## Goals

Make the next action legible while preserving the current draft, linked research, immutable version, and final acknowledgement paths.

## Decisions

- Reuse the current action priority and save callbacks. Give secondary finalization an outline and keep the draft status next to the heading. Use «Сохранить черновик» for both the first save and later draft edits. Use «Завершить подготовку» for creating the final version.
- Use the existing export disclosure for «Ещё» with an optional research action. This puts export formats and version confirmation in their existing owner and avoids nested menus.
- Use the same coverage result for the open question count and remaining coverage warnings. Reuse the full-name type selector for compact review.
- Build the browser's «Связи вне дерева» list from the edges actually rendered in the tree. Distinguish relations and statuses between the same endpoints. Preserve the export's existing traceability presentation.

## Risks and Trade-offs

The research launch takes one extra click. The progress indicator labels it as optional and ongoing research remains reachable from the header.

## Migration Plan

Release the revised traceability method as BABOK skill 1.1.0 for new jobs with 1.0.0 retained for snapshots. Derive completeness from actual gaps, structural breaks, omissions and partial processing. Keep recorded edge evidence available on demand. Saved versions and review decisions use their existing formats.
