## Context

Decomposition checkpoints retain section artifacts. Research starts from an immutable requirements version. The web workspace already has editors for both registry formats.

## Goals / Non-Goals

Recover from model, output and audit failures after input validation. Cancellation, input validation and application infrastructure failures retain their existing handling.

## Decisions

- A patched workflow runs a checkpointed recovery activity after eligible failures. Its result is partial and uses the existing owner-scoped artifact route.
- Decomposition recovery starts an empty registry with the original material descriptors. The web workspace extracts available formulations from section responses into a review queue, subject to the result size limit. The user can edit the text and type-specific fields and explicitly add each requirement. Plain text requires the user to select a type. The original response is available for reference.
- Research recovery refers to the immutable input version. The workspace loads that version and opens its content in the editor. Saving uses the existing final-version mutation with the input version as the parent.
- Audit contract faults use the bounded audit repair path. The candidate remains subject to validation against the repaired audit.
