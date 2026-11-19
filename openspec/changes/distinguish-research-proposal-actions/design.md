## Context

See proposal.md. Research normalization currently drops operation metadata; review already implements reversible add/replace. Historical results lack intent. Existing working-tree edits must be preserved.

## Goals / Non-Goals

Goals: carry explicit intent end to end and reuse the existing review/apply path.
Non-goals: infer old intent from related IDs, regenerate saved research, apply AI changes without confirmation, mechanically prove semantic equivalence.

## Decisions

- Use operation=add|replace and targetId for replacement; targetIds remains contextual links. Reuse existing application terminology instead of introducing a second action vocabulary.
- Validate replacement against the source registry including type. Keep missing operation compatible with old prompt versions; reject malformed explicit operations.
- Resolve before text from the current draft, or saved proposal.before after acceptance. Existing accepted decisions override model metadata.
- Preserve existing target fields when initializing replacement; only wording changes unless user edits other fields. Keep full before snapshot and current conflict checks.
- Update current research prompt and checksum with explicit intent rules and an example preserving obligations. No heuristic inference from text or a single related ID.

## Risks / Trade-offs

- Semantic omission by model → prompt mandates retained obligations; user sees before/after before accepting.
- Historical proposals remain unclassified → visible notice and existing manual action selection.
- Target deleted since research → visible unavailable target and blocked replacement, never silent addition.

## Migration Plan

Deploy compatible reader and writer together. No data migration. Older results retain original metadata and accepted decisions. Rollback restores prior reader; accepted replacements remain ordinary requirements.
