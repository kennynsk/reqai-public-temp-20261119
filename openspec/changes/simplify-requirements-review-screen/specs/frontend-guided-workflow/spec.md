## MODIFIED Requirements

### Requirement: Focused desktop requirements editor
The stage-two requirements review SHALL prioritize reading and editing requirements with a compact four-stage indicator, one «Требования» heading, save status, source-context access and grouped actions. It SHALL show a single stacked requirement list with one type filter defaulting to «Все типы». It SHALL NOT show a second layout selector or full-size type navigation cards on stage two. All six BABOK types and supported legacy categories SHALL remain accessible, including adding a record to an empty type. Existing final-editor layout preferences SHALL remain unchanged.

#### Scenario: User begins reviewing a decomposition
- **WHEN** the saved stage-two fixture with 3 requirements, 5 GAP records, 5 questions and linked research opens at 1440 × 900 CSS pixels and 100 percent zoom with disclosures closed
- **THEN** the first requirement ID and at least two lines of its wording are visible without scrolling, its top is at or above 480 CSS pixels from the viewport top, and source context and the current stage remain accessible

#### Scenario: User reviews decomposed categories
- **WHEN** stage two displays decomposed categories with «Все типы» selected
- **THEN** all nonempty supported categories appear in one stacked list and every requirement remains editable and removable

#### Scenario: User filters requirement types
- **WHEN** the user selects one type or «Все типы»
- **THEN** the list shows only the selected type or all nonempty types respectively, exactly one filter value is selected, and unsaved edits survive switching

#### Scenario: User selects an empty type
- **WHEN** a type with zero records is selected
- **THEN** an explicit empty state and the existing add-requirement action are available, with the full type name visible

#### Scenario: User adds a requirement
- **WHEN** the user activates add from all types
- **THEN** the user can select a supported type, including an empty type, and dismiss the composer without changing the registry

#### Scenario: User switches to stacked rows
- **WHEN** the user moves to the final editor
- **THEN** its existing layout and saved layout preference are preserved independently of the stage-two filter

### Requirement: Clear action and visual hierarchy
The requirements review SHALL present at most one visually primary action according to the current state. Saving SHALL take priority when no saved version exists or any changes are pending. For a clean saved version without current-version research, direct finalization SHALL be primary and optional research secondary. When current-version research is active or completed, opening it SHALL be primary; another run SHALL NOT be presented as a competing default action. Existing finalization, save, active-job and conflict guards SHALL remain enforced. Green SHALL communicate a specifically labelled success, never imply semantic completeness from persistence alone. Structural wrappers SHALL NOT give every navigation or metadata group a bordered card.

#### Scenario: Requirements contain unsaved changes
- **WHEN** edited requirements or review decisions differ from the persisted version
- **THEN** «Сохранить изменения» is the single primary action, research launch and finalization remain unavailable, and validation or save failure preserves drafts with an actionable error

#### Scenario: Reviewed version does not exist
- **WHEN** requirements have no saved version
- **THEN** «Сохранить требования» is primary and research launch and direct finalization are unavailable until saving succeeds

#### Scenario: Reviewed requirements are saved
- **WHEN** a clean saved version has no linked research for that version
- **THEN** direct finalization is primary and research is explicitly optional and secondary

#### Scenario: Linked AI research is starting or active
- **WHEN** research submission is pending or a linked job is accepted, queued, running, waiting for retry or awaiting cancellation
- **THEN** no second research submission is possible, the research lifecycle is shown once, and «Открыть AI-исследование» is primary when its durable route is available; direct finalization remains unavailable while the existing active-research guard applies

#### Scenario: Research completes for the current version
- **WHEN** linked research for the clean saved version succeeds
- **THEN** «Посмотреть результаты AI» opens the existing child as primary, direct finalization remains secondary with existing checks, and an explicit secondary repeat action is available only when existing launch guards allow it

#### Scenario: Job admission limit rejects linked research
- **WHEN** the server rejects research because the active-job limit is reached
- **THEN** eligible actions are restored and Russian copy explains that another task is running and the user should wait

#### Scenario: User scans requirement items
- **WHEN** no item is being edited and no composer is open
- **THEN** requirement wording dominates structural borders and repeated controls, while editing and deletion remain discoverable and keyboard accessible

## ADDED Requirements

### Requirement: Independent review and research status
Stage two SHALL distinguish persistence, manual completeness checking and linked research state. «Сохранено» SHALL NOT be presented as a successful requirements check. Research status SHALL use authoritative job state and its input version; a child ID alone SHALL NOT imply that research is running or applies to the current version.

#### Scenario: Saved requirements still need review
- **WHEN** a version is saved but completeness is unchecked or stale
- **THEN** neutral save metadata and «Полнота: не проверена» or «Полнота: нужно перепроверить» coexist without a page-level success checkmark

#### Scenario: Research belongs to an older version
- **WHEN** linked research uses a different saved input version
- **THEN** the row says «Исследование предыдущей версии», opening preserves that immutable snapshot, and current-version launch still obeys the active-job guard

#### Scenario: Research state is unavailable or exceptional
- **WHEN** a child exists but its state is loading, unavailable, failed or cancelled
- **THEN** the interface labels the actual state, retains an available child link, never claims successful completion or ongoing processing without evidence, and preserves existing recovery actions

### Requirement: Actionable review summary
Stage two SHALL show the total requirement count only in «Реестр · N» and the question count only in «Вопросы · N» navigation. GAP counts and records SHALL remain available inside the questions section rather than in a duplicate summary row. The completeness disclosure SHALL appear next to persistence status and remain accessible in every review section. Counts of all records SHALL NOT be labelled as unresolved counts unless derived from review decisions.

#### Scenario: User follows a count
- **WHEN** the user activates «Вопросы · N»
- **THEN** the questions section displays its GAP count and records without losing drafts, and the registry does not contain a second question count or a separate requirement count

#### Scenario: User reviews completeness
- **WHEN** the user activates the completeness status action
- **THEN** the existing comparison opens, and missing context or unfinished field edits still prevent invalid confirmation

#### Scenario: Partial coverage or unresolved issues remain
- **WHEN** a version has partial coverage, quality warnings or unresolved issues
- **THEN** the warnings remain visible and accessible, and proceeding to finalization preserves existing acknowledgement and validation requirements rather than silently accepting or newly blocking those issues

### Requirement: Responsive stage-two review composition
The compact stage-two surface SHALL retain Russian labels, visible focus, meaningful filter states, accessible status announcements and all actions at 390 CSS pixels and at 200 percent zoom. Content SHALL reflow without horizontal page overflow or clipped focused controls.

#### Scenario: Narrow screen with ordinary saved content
- **WHEN** the same 3-requirement fixture opens at 390 × 844 CSS pixels, 100 percent zoom and closed disclosures
- **THEN** the first requirement ID and beginning of its wording are visible without scrolling; controls wrap or use a labelled type select without full-size empty type cards

#### Scenario: Keyboard and enlarged text
- **WHEN** the user operates sections, filters, disclosures and actions by keyboard at 200 percent zoom
- **THEN** focus follows logical reading order, opening and closing review UI preserves or restores focus, and no fixed toolbar obscures content or focused controls
