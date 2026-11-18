## Context

The compact stage-two header already derives primary actions from persisted version and linked job state. The list-and-detail registry is the current BABOK review composition.

## Goals

Make the next action legible while preserving the current draft, linked research, immutable version, and final acknowledgement paths.

## Decisions

- Reuse the current action priority and save callbacks. Give secondary finalization an outline and keep persistence status next to the heading.
- Use the existing export disclosure for «Ещё» with an optional research action. This puts export formats and version confirmation in their existing owner and avoids nested menus.
- Use the same coverage result for the open question count and remaining coverage warnings. Reuse the full-name type selector for compact review.

## Risks and Trade-offs

The research launch takes one extra click. The progress indicator labels it as optional and ongoing research remains reachable from the header.

## Migration Plan

Deploy as a frontend change. Saved versions and review decisions use their existing formats.
