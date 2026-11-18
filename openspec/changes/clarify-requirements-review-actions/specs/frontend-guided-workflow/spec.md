## MODIFIED Requirements

### Requirement: Requirements-focused review stage

After a successful decomposition, the frontend SHALL make the generated requirements the dominant content. The original business context SHALL remain accessible in a compact disclosure. The compact review header SHALL group version status, saving, direct finalization and secondary actions near the title. Direct finalization SHALL validate and persist the current requirements before opening the final stage.

#### Scenario: User enters requirements review

- **WHEN** the first review opens after decomposition
- **THEN** the page shows «Черновик ещё не сохранён» and shows «Сохранить черновик» with the outlined «Завершить подготовку» action beside it

#### Scenario: User creates a final version directly

- **WHEN** the user selects «Завершить подготовку»
- **THEN** the workspace validates the current requirements and asks for existing acknowledgement of open issues when applicable before creating the version

#### Scenario: User needs to change context

- **WHEN** the user opens the compact source disclosure
- **THEN** the original context and existing edit controls are accessible without losing the review draft

#### Scenario: User reviews generated requirements

- **WHEN** editable requirements are displayed
- **THEN** the header groups saving, finalization and additional actions above the registry

#### Scenario: Reviewed version has not been saved

- **WHEN** the current requirements have no persisted working version
- **THEN** export formats are unavailable and the optional research action explicitly includes saving

#### Scenario: Reviewed version is ready to finish

- **WHEN** a working version is saved with no pending edits and no active or completed research for that version takes priority
- **THEN** «Завершить подготовку» is primary and optional research is reachable from «Ещё»

### Requirement: Clear action and visual hierarchy

The compact review SHALL show at most one emphasized action for the current state. Saving takes priority while there is no saved version or when edits are pending. For a clean working version, creating the final version is primary unless opening active or completed research takes priority. The step indicator SHALL visibly label research as optional or skipped. The «Ещё» disclosure SHALL group research launch and available saved-version export formats. Active-job and conflict guards SHALL continue to apply.

#### Scenario: Requirements contain unsaved changes

- **WHEN** the working version has pending edits
- **THEN** the header shows «В черновике есть несохранённые изменения» and prioritizes «Сохранить черновик»

#### Scenario: Reviewed requirements are saved

- **WHEN** the current working version has been persisted with no edits pending
- **THEN** the status shows «Черновик сохранён» and the timestamp when available

#### Scenario: User chooses AI research from a draft

- **WHEN** the user selects «Сохранить и запустить AI-исследование»
- **THEN** research starts only after the current working version is saved successfully and is linked to that saved version

#### Scenario: User opens additional actions

- **WHEN** a working version exists and the user opens «Ещё»
- **THEN** available research actions and saved-version export formats are reachable, and exporting while edits are pending uses the existing version selection confirmation

#### Scenario: User opens completed research

- **WHEN** research for the clean working version has succeeded
- **THEN** «Посмотреть предложения AI» is the primary action and rerunning research remains a secondary choice

#### Scenario: Linked AI research is starting or active

- **WHEN** research is starting, already active, or blocked by a version conflict
- **THEN** the workspace prevents another launch and communicates the current state

#### Scenario: Job admission limit rejects linked research

- **WHEN** the server rejects linked research because the active-job limit was reached
- **THEN** the interface restores eligible actions and explains the limit in Russian

#### Scenario: User scans requirement items

- **WHEN** no editor or add composer is open
- **THEN** requirement wording stays prominent and item actions remain reachable from the selected requirement

#### Scenario: User opens the selected requirement's actions

- **WHEN** AI discussion is available and the user opens the selected requirement's action menu
- **THEN** «Обсудить с AI» remains a single action in the requirement header and deletion remains in the menu

#### Scenario: Compact BABOK registry contains open issues

- **WHEN** the review has open questions
- **THEN** their count appears on the «Вопросы» tab and selecting it opens the existing question queue while retaining review drafts

#### Scenario: User filters the compact BABOK registry

- **WHEN** the user changes the requirement type
- **THEN** a single selector offers all full type names including empty categories and combines with the existing search and clarification filter

#### Scenario: All traceability links appear in the tree

- **WHEN** every relation and status is already shown at the corresponding edge in the tree
- **THEN** edge provenance is available on demand and the separate «Связи вне дерева» section is absent

#### Scenario: Some traceability links are outside the tree

- **WHEN** a dependency, constraint or other relation is absent from the tree
- **THEN** «Связи вне дерева» lists the additional links, including a different type of relation between the same records

#### Scenario: Normalizing one source obligation into a need and a behavior

- **WHEN** a source obligation supports both records and their connection without a new business decision
- **THEN** the decomposition method records the supported link with evidence and review shows its provenance on request
- **AND** a stored inferred link alone does not make a structurally complete decomposition incomplete

#### Scenario: A link would require a business decision

- **WHEN** a proposed connection depends on a choice of scope or behavior absent from the source
- **THEN** the method captures the decision as a linked gap and question, and review exposes the open gap from the relevant record
