## Context

The compact stage-two header already derives primary actions from persisted version and linked job state. The list-and-detail registry is the current BABOK review composition.

## Goals

Make the next action legible while preserving the current draft, linked research, immutable version, and final acknowledgement paths.

## Decisions

- Make the research launch the primary action until current research is running or ready to open. Group «Сохранить черновик» with the draft status. Keep «Завершить подготовку» beside the launch action and reuse the save and finalization callbacks.
- Use the existing «Ещё» disclosure for saved exports and rerunning completed research for the clean version. Keep export confirmation in its existing owner.
- Use the same coverage result for the open question count and remaining coverage warnings. Reuse the full-name type selector for compact review.
- Build the browser's «Связи вне дерева» list from the edges actually rendered in the tree. Distinguish relations and statuses between the same endpoints. Preserve the export's existing traceability presentation.

- Reuse guarded job navigation for the return from research to the parent requirements task. Place direct links to the source context and frozen requirements below the research results and move the finalization control and selected count to the results header.
- Read the latest completed linked research from the persisted job list using the parent task and success filters. Keep its navigation available independently of the current attempt and leave the saved final version's decisions intact.
- Carry the final-version entry point in the existing browser history entry. Use it to open the research findings first, identify older input and label the return to the parent final version. A plain task link retains its default view. Use the existing dirty-draft guard on both transitions.
- Resolve the current final across the decomposition and linked research using the most recent saved final revision. Expose it alongside the existing job-scoped version list. The task renders and exports that exact version and saves edits against its producing job. Research findings point back to the task final. Keep past version artifacts immutable.
- Lock the decomposition job when publishing a final revision. Require the current workflow final as a base when it exists. A historical research run with a different input and its own superseded result remains available for review. Keep new research creation scoped to inputs from decomposition as before.
- Place the stage markers at the top of four equal columns with labels underneath. Draw the track between the first and last column centers and position the completed fill inside the same track.

## Risks and Trade-offs

Research launched with a new or edited draft saves that draft first. A short hint by the launch action shows this before the user clicks.

## Migration Plan

Release the revised traceability method as BABOK skill 1.1.0 for new jobs with 1.0.0 retained for snapshots. Derive completeness from actual gaps, structural breaks, omissions and partial processing. Keep recorded edge evidence available on demand. Saved versions and review decisions use their existing formats.
