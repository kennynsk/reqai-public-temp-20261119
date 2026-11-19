## 1. Workflow Foundation

- [x] 1.1 Add centralized localized labels and presentation tones for job lifecycle, outcome, type, and mode while retaining raw values in technical details.
- [x] 1.2 Separate primary workspace selection from durable job mode and restore the correct workspace for active and historical jobs.
- [x] 1.3 Add the four-stage requirements workflow indicator derived from job, result, and requirements-version state.

## 2. Navigation and Input Experience

- [x] 2.1 Replace equal primary module tabs with a business-requirements-first header and a secondary «Дополнительные инструменты» menu for standalone research modes.
- [x] 2.2 Move model, temperature, category, comparison, and prompt-testing expert controls into clear progressive-disclosure sections without changing submitted job options.
- [x] 2.3 Refine business-context and primary action layout for responsive widths, optional-research messaging, disabled states, and visible keyboard focus.

## 3. Results and Requirement Decisions

- [x] 3.1 Add a summary-first research result shell with accessible overview, insights, risks, recommendations, and full-report sections plus a defensive full-content fallback.
- [x] 3.2 Replace generic suggestion checkboxes with explicit accept/reject comparison cards that expose target type, rationale, current/proposed wording, and decision state.
- [x] 3.3 Add a responsive sticky accepted-count/final-save action bar while preserving existing requirements-version and decision-lineage payloads.
- [x] 3.4 Keep linked `REQUIREMENTS_INSIGHTS` research inside the requirements workspace and adapt its category cards, filters, back action, and final-version state to the new result shell.

## 4. History and Technical Details

- [x] 4.1 Move history into an accessible right-side drawer with backdrop/Escape/close behavior and without permanent page-height consumption.
- [x] 4.2 Add compact localized history entries, all/decomposition/research filters, pagination, active-entry indication, and close-on-selection behavior.
- [x] 4.3 Consolidate artifact download, attempts, fallback information, and raw lifecycle metadata under optional technical-details disclosures.

## 5. Verification and Delivery

- [x] 5.1 Expand frontend regression tests for workflow stages, primary/secondary navigation, AI-settings disclosure, localized statuses, and reload-safe restoration.
- [x] 5.2 Add frontend tests for research sections, improvement decisions, sticky final save, history drawer/filtering, and linked research remaining in the requirements workspace.
- [x] 5.3 Run frontend tests, lint, production build, and strict OpenSpec validation; correct all regressions.
- [x] 5.4 Rebuild the Docker Compose frontend, verify service health, and visually validate desktop and narrow viewport behavior in the in-app browser.

## 6. Terminology and Visual Consistency Follow-up

- [x] 6.1 Rename the primary navigation and workspace heading to «Подготовка требований», keeping «Бизнес-требования» only for the decomposed requirement category.
- [x] 6.2 Refactor every standalone tool to use the primary workspace color palette, page hierarchy, card treatment, spacing, AI-settings disclosure, actions, and responsive behavior without changing its submission payload.
- [x] 6.3 Update regression tests for the new terminology and shared standalone-tool visual shell.
- [x] 6.4 Run lint, frontend tests, production build, strict OpenSpec validation, Docker rebuild, health checks, and desktop/narrow browser verification.

## 7. Active Job Status Deduplication

- [x] 7.1 Keep normal active-job messaging in the disabled primary action, add cancellation beside it, and reserve the state card for exceptional states.
- [x] 7.2 Add regression coverage for a single running message, adjacent cancellation, and exceptional-state cards.
- [x] 7.3 Run frontend validation, rebuild Docker, verify health, and visually confirm the active state in the browser.

## 8. Requirements Review Focus

- [x] 8.1 Collapse the completed context form into an expandable summary after decomposition and remove redundant completed-result presentation before the requirements.
- [x] 8.2 Move reviewed-version save and optional AI-research actions into a responsive sticky toolbar near the step-two heading, preserving save-before-research lineage rules.
- [x] 8.3 Add regression coverage for collapsed/expanded context, compact decomposition results, sticky review actions, and research gating.
- [x] 8.4 Run frontend validation, rebuild Docker, verify health, and visually inspect desktop and narrow requirements-review layouts.

## 9. Desktop Requirements Editor Refinement

- [x] 9.1 Replace the completed-decomposition workflow grid and separate context band with a compact desktop review-stage header and source-context disclosure.
- [x] 9.2 Replace the fixed three-column editor with counted category navigation, a concise overview, and a full-width selected-category editor without changing requirement state or payloads.
- [x] 9.3 Collapse add-requirement composers and quiet repeated edit/delete controls while preserving semantic labels, keyboard access, editing, and removal behavior.
- [x] 9.4 Make reviewed-version saving the state-dependent primary action, restyle optional AI improvement as secondary, reserve green for saved success, and normalize Russian product terminology.
- [x] 9.5 Expand regression coverage for compact review navigation, category/overview switching, collapsed composers, contextual actions, action hierarchy, and terminology.
- [x] 9.6 Run lint, frontend tests, production build, strict OpenSpec validation, rebuild Docker, verify health, and visually inspect the desktop requirements workflow and standalone-tool terminology.
- [x] 9.7 Remove the redundant initial empty decomposition-result card, add regression coverage, run frontend validation, rebuild Docker, and visually verify the clean initial state.
- [x] 9.8 Restore simultaneous three-column requirements display while preserving the compact stage header, action hierarchy, contextual item actions, collapsed composers, payload behavior, and regression coverage; rebuild Docker and visually verify the desktop layout.

## 10. Linked Research Duplicate-Launch Protection

- [x] 10.1 Lock linked AI research across request and authoritative active-job states, guard the handler against repeat submission, show one spinner label, localize admission-limit errors, and add regression coverage for repeat activation and restored active research.
- [x] 10.2 Run frontend tests, lint, production build, strict OpenSpec validation, rebuild Docker, verify frontend health, and visually confirm the active linked-research state.

## 11. Linked Research Result Presentation

- [x] 11.1 Open completed linked research directly on the familiar category filters and three-column insight-card grid, keep inline accept/reject plus sticky final save, remove the stage-one context form from above the result, and add regression coverage.
- [x] 11.2 Run frontend tests, lint, production build, strict OpenSpec validation, rebuild Docker, verify frontend health, and visually confirm the restored desktop linked-research result layout.

## 12. Linked Research Applicability Scale

- [x] 12.1 Restore the five-segment applicability meter with a visible percentage and accessible numeric value, and add regression coverage.
- [x] 12.2 Run frontend tests, lint, production build, strict OpenSpec validation, rebuild Docker, verify frontend health, and visually confirm the restored meter in linked-research cards.

## 13. Linked Research Source Requirements and Icons

- [x] 13.1 Reuse the primary requirement-column styling for the linked-research source snapshot, restore category icons on insight cards, and add regression coverage for both views and their navigation.
- [x] 13.2 Run frontend tests, lint, production build, strict OpenSpec validation, rebuild Docker, verify frontend health, and visually confirm the source snapshot and insight-card icons.

## 14. Legacy Insight Card Hierarchy

- [x] 14.1 Restore always-visible `relatedTo` chips, details/source disclosure, compact target-labelled enhancement rows, reversible accept/reject decisions, and historical-result enhancement fallback with regression coverage.
- [x] 14.2 Run frontend tests, lint, production build, strict OpenSpec validation, rebuild Docker, verify frontend health, and visually confirm the restored insight-card hierarchy.

## 15. Final-Version Branching and Editing

- [x] 15.1 Add a direct transition from saved reviewed requirements to the final version, persist the skipped-research decision, and render stage three as «Пропущено».
- [x] 15.2 Add an accessible «Столбцы / Строки» layout toggle to review and final editors and persist the presentation preference locally.
- [x] 15.3 Make research-assisted and direct final versions manually editable through immutable chained revisions while preserving decision and enhancement lineage.
- [x] 15.4 Add frontend and backend regression coverage, run tests/lint/build, rebuild Docker, verify service health, and exercise the direct-final workflow in the browser.

## 16. Cross-Client Realtime Synchronization

- [x] 16.1 Publish ordered `requirements.version-created` and `linked-research.created` events through the existing per-job outbox stream with transactional sequence allocation.
- [x] 16.2 Keep the viewed-job SSE subscription active after terminal states, route mutation events to authoritative refreshes, reject mismatched job events, and follow linked research created in another client.
- [x] 16.3 Preserve unsaved local requirement edits when a remote version arrives and expose an explicit newer-version reload action.
- [x] 16.4 Add server, client reconnect, event-routing, and cross-client regression coverage; run validation/build, rebuild Docker, and verify two-client synchronization plus replay in the browser.

## 17. New Task Entry Point

- [x] 17.1 Add a persistent «Новая задача» action for terminal requirements workflows that clears only the current selection and draft UI state while preserving history.
- [x] 17.2 Add frontend regression coverage, run tests/lint/build and strict OpenSpec validation, rebuild Docker, and verify the reset plus history restoration in the browser.
