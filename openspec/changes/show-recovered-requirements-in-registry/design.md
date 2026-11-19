## Context

Recovery results contain a manual registry with the task's authorized materials and, when available, immutable section responses. Section results can reuse requirement and question IDs.

## Decisions

- Project the recoverable rows deterministically into the standard BABOK editor. Preserve usable fields and resolve links inside their originating section. Reuse the existing GAP and question UI for concrete linked questions.
- Use the same projection when the API identifies the source of new GAP review decisions. Store substantive edits and deletions through existing immutable versions.
- Upgrade previously saved drafts with the old acceptance mapping. A saved projection marker makes subsequent versions authoritative, including deletions. Untyped response text is retained in the original response.
- Transfer typed traceability using the same section-local identifier mapping as the requirement rows. For already imported drafts, restore missing edges only when the saved records can be matched to the original endpoints. Respect removed relationships and existing typed edges. Mark the repaired projection when it is saved as a new version.
