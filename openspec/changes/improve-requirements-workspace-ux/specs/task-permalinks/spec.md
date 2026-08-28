## MODIFIED Requirements

### Requirement: Permanent task URL
The frontend SHALL use `/tasks/{jobId}` as the canonical URL and derive the selected job from it. Creating or explicitly selecting a job, following linked research or returning to a parent SHALL update that URL. A remote linked-research event MUST NOT redirect a client away from an explicitly selected parent. Existing job identity and APIs SHALL remain unchanged.

#### Scenario: Task is created
- **WHEN** creation returns a jobId
- **THEN** the initiating client navigates to its canonical URL before loading and subscribing to the accepted job

#### Scenario: History entry is selected
- **WHEN** a user selects a particular workflow stage and resolves dirty-state navigation
- **THEN** the frontend navigates to that stage's job URL and renders its authoritative state

#### Scenario: Linked research becomes the selected task
- **WHEN** the initiating client receives a successful research creation response or the user explicitly follows the child link
- **THEN** the URL changes to the child job and the child becomes the sole active task subscription

#### Scenario: Linked research is announced remotely
- **WHEN** another client creates research while the user views the parent
- **THEN** a link/status appears without changing the parent URL or overwriting its draft

#### Scenario: User starts a new task
- **WHEN** the user activates New task and saves or explicitly discards unsaved edits
- **THEN** the frontend navigates to `/` without deleting durable history

### Requirement: Direct and restart-safe restoration
Opening a canonical URL SHALL load the authoritative saved job independently of local selection, on reload, in a new tab, another authenticated browser or after restart. A parent URL SHALL continue to open the parent even if linked research exists. Unsaved drafts SHALL NOT be synchronized across clients; same-tab draft recovery SHALL be offered separately and labelled unsaved.

#### Scenario: URL opens in another authorized browser
- **WHEN** a user opens a job URL in a browser without ReqAI local storage
- **THEN** that exact task, available result and saved requirements versions load from the API

#### Scenario: Conflicting local selection exists
- **WHEN** the URL names task A and local storage remembers B
- **THEN** task A is loaded and is not replaced by task B

#### Scenario: Task is missing or inaccessible
- **WHEN** a URL names a nonexistent or unauthorized task
- **THEN** a stable unavailable state appears without falling back to another task

#### Scenario: Unsaved edits exist in another client
- **WHEN** another client opens the same job
- **THEN** it receives the persisted version without claiming that the first client's unsaved text is synchronized

#### Scenario: Parent has running research
- **WHEN** the user opens or reloads the decomposition URL while its research child is running
- **THEN** the parent requirements remain accessible and research is offered as a separate explicit link
