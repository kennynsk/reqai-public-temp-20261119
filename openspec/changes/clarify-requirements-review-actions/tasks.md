## 1. Compact review

- [x] 1.1 Update the action hierarchy, optional research marker and shared export disclosure.
- [x] 1.2 Consolidate open question navigation and requirement type selection.
- [x] 1.3 Keep one AI discussion entry point on each requirement card and verify the action menu.
- [x] 1.4 Show only links absent from the tree in the browser and verify both layouts.
- [x] 1.5 Release the revised BABOK evidence rule, separate inferred links from completeness, and verify question and source access.
- [x] 1.6 Use draft terminology for the save action and status, and name the finalization action «Завершить подготовку».
- [x] 1.7 Show the research launch as the next action and keep direct finalization visible.
- [x] 1.8 Expose stage navigation and finalization on the linked research screen.
- [x] 1.9 Restore access to completed linked research from a directly finalized task after a later attempt is cancelled.

## 2. Verification

- [x] 2.1 Update component and workflow regression coverage and verify the frontend and OpenSpec.

## 3. Final-version research navigation

- [x] 3.1 Open completed findings directly from the final version and provide a direct return with clear version context.
- [x] 3.2 Verify saved research results, guarded navigation and browser history with regression coverage and the selected task.

Verified one-click opening and return, keyboard activation, and browser back and forward on the selected saved task. Regression coverage exercises current and previous input versions with an existing research-derived final version, plus the unsaved-decision guard. All 436 client tests, lint and build passed.

## 4. Workflow indicator alignment

- [x] 4.1 Align the progress track with stage markers and verify it on the final and research screens at desktop and narrow widths.

Verified the track center and endpoints on both screens at 1145 and 586 CSS pixels and on the final screen at 383 CSS pixels. All 436 client tests, lint and build passed.

## 5. Research result navigation labels

- [x] 5.1 Keep a single return at the top of completed research and place the run's separately saved registry with its materials. Verify both destinations and that saving changes remains available.

Verified both saved registries in the browser on the selected task. The client regression verifies the save action reappears when decisions change. All 436 client tests, lint and build passed.

## 6. Current final version across linked jobs

- [x] 6.1 Resolve the workflow final on the server and guard publication against concurrent or stale final revisions.
- [x] 6.2 Render and export the current final on the task. Route research back to it and present superseded research without competing final actions.
- [x] 6.3 Reconcile the selected task and verify FR-009, the BR-001 success criterion, history and export against the same final version.

Saved a new revision of the selected task with both the accepted FR-009 and the manually edited BR-001 success criterion. The task and research version lists and grouped history resolve the same current final. Checked the results-to-final path in the browser and both fields in the Markdown, HTML and DOCX exports. 437 client, 400 server and 30 MCP tests passed. The two opt-in PostgreSQL tests were skipped. Client lint and build, strict OpenSpec and legacy surface qualification passed.
