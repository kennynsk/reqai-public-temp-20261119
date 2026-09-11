## Purpose

Дать пользователю компактный обзор BABOK-требований и подробный редактор выбранной записи в общей визуальной композиции с AI-исследованием, сохраняя черновики и действующие проверки.

## ADDED Requirements

### Requirement: Requirement list and selected detail
The editable stage-two BABOK registry SHALL show type filters followed by a requirement selector and the complete details of exactly one selected requirement. Desktop viewports at or above 1024 CSS pixels SHALL place the selector to the left of the detail panel. Each selector entry SHALL expose its stable ID, type, wording excerpt and labelled quality; missing quality SHALL NOT imply readiness. The detail SHALL expose the complete wording, structured fields, provenance, original source, links, clarifications and existing record actions. Selection SHALL NOT mutate the registry.

#### Scenario: Registry opens
- **WHEN** a nonempty BABOK registry opens without a requested record
- **THEN** all types are included, the first requirement in registry type/order is selected, and its full detail is shown beside the selector

#### Scenario: User selects a requirement
- **WHEN** the user activates an entry by pointer or keyboard
- **THEN** the detail shows that entry, its selection is programmatically exposed, and edits and decisions are not saved or discarded by selection

#### Scenario: Missing or deleted selection
- **WHEN** the selected record no longer belongs to the visible result set
- **THEN** the first visible record is selected, or a labelled empty detail appears if the set is empty

### Requirement: Combined search and filters
The registry SHALL support a single selected type or all types, case-insensitive substring search over ID and wording, and the existing «Нужно уточнить» condition. Conditions SHALL combine by intersection without changing record order. Each type SHALL remain selectable with its full name and count, including zero-count types. Filter changes SHALL retain the selected record when it still matches. A clear-filter action SHALL restore all records without discarding drafts.

#### Scenario: Combined conditions
- **WHEN** a user selects FR, enters a substring and enables clarification filtering
- **THEN** only FR records whose ID or wording matches and whose quality is not «Готово» appear

#### Scenario: No matches
- **WHEN** no records match the current search or filters
- **THEN** an explicit empty state offers filter reset and the add action remains reachable

#### Scenario: Empty type
- **WHEN** a zero-count type is selected
- **THEN** its full name remains visible and the user can add a requirement to that type

### Requirement: Preserve edits and record operations
The view SHALL reuse the existing review draft lifecycle. Text, structured fields, relation edits and new-record drafts SHALL survive changing selection, filters and review sections. Save SHALL assemble all drafts, including invisible ones. An invalid draft SHALL be revealed with the relevant editor and error field reachable before any save request. Existing add, delete confirmation, undo, AI discussion, conflict handling, completeness checks and immutable version payloads SHALL remain available.

#### Scenario: Switch during unfinished edit
- **WHEN** a user edits wording and structured fields on A, selects B, then returns to A
- **THEN** A retains its unfinished values and editing state, and global saving includes those values

#### Scenario: Hidden draft fails validation
- **WHEN** a hidden record contains an invalid required field and the user saves
- **THEN** the registry section opens, restrictive filters clear, the record is selected, its invalid field receives focus and no invalid save request is sent

#### Scenario: Add to empty category
- **WHEN** the user chooses an empty supported type in the add menu and completes its composer
- **THEN** the new stable-ID record is selected and visible, even if previous search or clarification conditions would hide it

#### Scenario: Delete and undo
- **WHEN** the user confirms deletion of the selected record and then undoes it
- **THEN** selection remains valid after deletion and the restored record is available with its original ID and relationships

#### Scenario: Discussion and export
- **WHEN** the user discusses a selected requirement or exports the registry
- **THEN** discussion uses the same record anchor and draft/version context as before, and export is not limited to the filtered list

### Requirement: Reveal linked records
Navigation from requirement links, questions, completeness results and validation SHALL reveal its intended target even when filters or another review section hide it. Existing task and read-only snapshot routes SHALL remain valid.

#### Scenario: Follow hidden requirement link
- **WHEN** the user follows a link to an existing requirement outside the current visible set
- **THEN** the registry section opens, obstructing filters clear, the target becomes selected and its detail receives focus

#### Scenario: Follow analysis link
- **WHEN** the user follows a GAP or other analysis record link
- **THEN** the existing questions or report destination opens rather than a blank requirement detail

### Requirement: Responsive and keyboard usable composition
Below the desktop breakpoint the selector SHALL appear above the detail with bounded vertical scrolling. Content and controls SHALL reflow without horizontal page overflow at 320, 390, 768, 1024 and 1440 CSS pixels and at 200 percent browser zoom. Search and filter controls SHALL have Russian accessible names, selection SHALL not be color-only and keyboard focus SHALL remain visible. Repeated total counts SHALL be avoided; the selector may show the number of matching records when conditions are active.

#### Scenario: Narrow screen
- **WHEN** the registry is viewed on a 390 CSS pixel screen
- **THEN** type controls wrap, search and add actions remain usable and the user can reach detail without scrolling through the entire selector

#### Scenario: Keyboard operation
- **WHEN** the user navigates by Tab and activates selector entries and controls by keyboard
- **THEN** focus follows visual reading order and all existing edit, delete, add, source and discussion actions remain reachable
