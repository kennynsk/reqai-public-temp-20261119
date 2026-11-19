# task-permalinks Specification

## Purpose

Provide every durable workflow job with a permanent task URL based on its existing `jobId` so saved state can be restored, shared, navigated, and synchronized across authorized clients without introducing another identifier.

## Requirements

### Requirement: Existing job identity remains canonical
The system SHALL continue generating the UUID `jobId` on the server for every accepted job. The existing `jobId` SHALL remain the only identifier for state, results, workflow lineage, requirements versions, events, diagnostics, artifacts, and any persisted messages. The system SHALL NOT create a `taskId` field, mapping identity, or parallel task API resource.

#### Scenario: New task is accepted
- **WHEN** an authorized client creates a task with a new idempotency key
- **THEN** the response contains the existing UUID `jobId` that identifies the inserted durable job

#### Scenario: Creation request is replayed
- **WHEN** an authorized client repeats the same creation request with the same valid idempotency key
- **THEN** the response contains the same `jobId` and no duplicate job is created

#### Scenario: Related state is persisted
- **WHEN** the system stores a requirements version, child workflow, event, trace entry, artifact relationship, or task message
- **THEN** the record is associated directly with the canonical `jobId` or with explicit lineage to a record associated with that job

### Requirement: Existing job API remains canonical
The versioned API SHALL continue using the existing job-oriented creation, detail, result, requirements-version, cancellation, artifact, and SSE-event contracts keyed by `jobId`. Diagnostics SHALL be added beneath the same `/api/v1/jobs/{jobId}` resource, and the system SHALL NOT require task-oriented aliases.

#### Scenario: Client loads job resources
- **WHEN** an authorized client requests state, result, version history, events, or trace through a job endpoint
- **THEN** every resource is resolved using the `jobId` path parameter and existing tenant/owner authorization

#### Scenario: Client loads diagnostics
- **WHEN** an authorized client requests `/api/v1/jobs/{jobId}/trace` or an entry detail beneath it
- **THEN** diagnostics are resolved for that same job without translating to another identifier

#### Scenario: Invalid job identifier is supplied
- **WHEN** a job endpoint receives a path identifier that is not a valid UUID
- **THEN** the API returns the versioned validation error without querying a different job

### Requirement: Permanent task URL
The frontend SHALL use `/tasks/{jobId}` as the canonical user-facing URL for a selected job and SHALL derive the selected job from that URL. Creating a job, selecting one from history, following a linked child job, or returning to a parent SHALL update the URL with the selected `jobId`.

#### Scenario: Task is created
- **WHEN** the creation API returns `jobId`
- **THEN** the frontend navigates to `/tasks/{jobId}` before loading and subscribing to the accepted job

#### Scenario: History entry is selected
- **WHEN** the user selects a task from durable history
- **THEN** the frontend navigates to that task's canonical URL and renders its authoritative state

#### Scenario: Linked research becomes the selected task
- **WHEN** a client follows a `linked-research.created` event to the child task
- **THEN** the browser URL changes to `/tasks/{childJobId}` and the child job becomes the sole active subscription

#### Scenario: User starts a new task
- **WHEN** the user activates «Новая задача» and confirms discarding any unsaved local edits
- **THEN** the frontend navigates to `/`, clears the selected task, and displays the new-task form without deleting durable history

### Requirement: Direct and restart-safe restoration
Opening a canonical task URL SHALL load the authoritative saved state from the server independently of browser-local selection state. This behavior SHALL work on reload, in a new tab, in another authenticated browser, and after closing and reopening the application at that URL. Unsaved editor drafts are not part of cross-client restoration.

#### Scenario: URL opens in another authorized browser
- **WHEN** an authorized user opens `/tasks/{jobId}` in a browser with no ReqAI local storage
- **THEN** the client loads that task, its available result, and its persisted requirements versions from the API

#### Scenario: Conflicting local selection exists
- **WHEN** the URL contains task A while local storage remembers task B
- **THEN** the frontend loads task A and does not replace it with task B

#### Scenario: Task is missing or inaccessible
- **WHEN** the URL identifies a nonexistent task or one outside the caller's authorized scope
- **THEN** the frontend presents a stable unavailable-task state and does not fall back to a locally remembered or most recent task

#### Scenario: Unsaved edits exist in another client
- **WHEN** another client opens the same task while the first client has unsaved editor changes
- **THEN** the second client receives the latest persisted version and no claim is made that unsaved local text is synchronized

### Requirement: URL navigation semantics
Task navigation SHALL participate in browser history, and browser back/forward navigation SHALL abort stale loading and SSE work before resolving the task named by the resulting URL. A late response or event for a previously selected task MUST NOT replace the current route state.

#### Scenario: User navigates back
- **WHEN** browser Back changes the URL from task B to task A
- **THEN** the frontend cancels task B's pending load and subscription, loads task A, and renders task A only

#### Scenario: Stale asynchronous response arrives
- **WHEN** a load or SSE callback for task A completes after the URL has changed to task B
- **THEN** the frontend ignores it and preserves task B as the selected task

#### Scenario: Deep link reaches the frontend server
- **WHEN** the browser requests `/tasks/{jobId}` directly from a deployed or local frontend server
- **THEN** valid application routes fall back to the single-page application entry point while asset and API paths retain their existing handling

### Requirement: Task-scoped realtime synchronization
Each client viewing `/tasks/{jobId}` SHALL subscribe to ordered durable events for that same `jobId`, resume from its last received sequence after disconnect, and reconcile through the existing job detail API. The client SHALL keep the subscription after terminal completion when later persisted workflow/version events can still occur.

#### Scenario: Two clients view the same task
- **WHEN** the durable task state or requirements-version lineage changes
- **THEN** both clients receive or reconcile the change under the same `jobId` without reloading the page

#### Scenario: SSE reconnects
- **WHEN** the event connection is interrupted after sequence N
- **THEN** the client reconnects for the same `jobId` with sequence N and reconciles authoritative task state

#### Scenario: Route changes during an active stream
- **WHEN** the canonical URL changes to a different task
- **THEN** the previous task stream is closed and events from it cannot mutate the newly selected task
