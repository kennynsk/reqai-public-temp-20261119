# task-debug-trace Specification

## Purpose

Provide an authorized, chronological and safely redacted diagnostic view of each task so developers and operators can understand workflow progress, model activity, retries, events, and failures without cluttering the primary interface.

## Requirements

### Requirement: Durable task trace contract
The system SHALL expose a job-scoped diagnostic trace keyed by the existing `jobId` and containing that identifier, type and mode, lifecycle status, outcome, current workflow step, creation/start/completion times, total duration, and an ordered timeline. Timeline entries SHALL have a stable identifier and sequence, category, name, status, timestamps and duration when known, safe technical metadata, and references to authorized detail payloads when available.

#### Scenario: Trace is requested for an active task
- **WHEN** an authorized viewer opens Debug while the task is running
- **THEN** the trace identifies the current state and returns all committed timeline entries in chronological sequence without requiring the task to finish

#### Scenario: Trace is requested for a completed task
- **WHEN** an authorized viewer opens Debug after terminal completion
- **THEN** the trace includes the terminal outcome, final result reference, completion time, and total duration

#### Scenario: Timestamp is unavailable
- **WHEN** an older or external trace source did not record a requested timestamp or duration
- **THEN** the contract returns an explicit unavailable value and does not invent timing data

### Requirement: Workflow and model execution visibility
The task trace SHALL represent committed workflow initialization, instruction or Skill loading when applicable, context preparation, decomposition or research work, validation, persistence, state transitions, retries, model attempts, emitted task events, failures, and completion. Model entries SHALL identify requested and actual model, attempt number, result, safe parameters, token counts, provider request/correlation identifier when available, and duration.

#### Scenario: Model fallback occurs
- **WHEN** one model attempt fails and a configured fallback model is tried
- **THEN** the timeline shows both attempts in order with their model names, statuses, safe reason codes, timings, and the transition to fallback

#### Scenario: Skill instructions are applied
- **WHEN** an execution loads or applies adapted Skill instructions
- **THEN** the trace records the Skill name/version, applied file identifiers or paths, content digests, and applied section identifiers without implying that unrecorded Skill data exists

#### Scenario: Workflow does not use a Skill
- **WHEN** the current execution path has no adapted Skill runtime
- **THEN** the Debug view marks Skill usage as not applicable rather than fabricating an instruction sequence

#### Scenario: Retry or failure occurs
- **WHEN** a step or provider call retries or fails
- **THEN** the trace records the attempt, safe error classification, retry decision and delay, and final step status in sequence

### Requirement: Input, output, prompt, and error details
Each timeline entry SHALL allow the client to request available input, output, prompt/instruction, intermediate-result, artifact, and error details separately from the default trace summary. Missing details SHALL be labelled “not recorded” or “expired”. Detail responses MUST preserve task authorization, content type, size limits, and retention rules.

#### Scenario: Step details were captured
- **WHEN** an authorized diagnostic viewer expands a step whose protected input and output artifacts are retained
- **THEN** the client can retrieve and display those details without embedding them in the base timeline response

#### Scenario: Protected detail has expired
- **WHEN** a trace entry remains but its raw diagnostic artifact has passed retention
- **THEN** the timeline remains usable and the detail request reports that the content expired

#### Scenario: Error has a protected stack trace
- **WHEN** a system administrator expands an error whose protected stack artifact is retained
- **THEN** the detail response can include the redacted stack trace and its correlation identifiers

### Requirement: Diagnostic authorization and redaction
Task trace metadata SHALL be limited to callers already authorized to view the task. Protected prompts, internal instructions, adapted Skill content, raw intermediate results, provider payloads, and stack traces SHALL require an explicitly privileged diagnostic role and SHALL be audited. Secrets, credentials, access tokens, authorization headers, and configured sensitive fields MUST never be returned by a trace endpoint.

#### Scenario: Task owner opens Debug
- **WHEN** a regular task owner requests their task trace
- **THEN** the system returns safe lifecycle, step, event, model and artifact metadata while protected internal detail remains redacted

#### Scenario: Privileged viewer opens protected detail
- **WHEN** an operator, auditor, or system administrator requests retained detail allowed by policy
- **THEN** the system returns the policy-permitted redacted content and records an audit event identifying actor, task, detail type, and timestamp

#### Scenario: Regular user requests a stack trace
- **WHEN** a caller without the required stack-trace privilege requests protected error detail
- **THEN** the system denies the detail without revealing whether raw stack content exists

#### Scenario: Caller cannot view the task
- **WHEN** a caller requests trace data for a task outside their tenant or owner scope
- **THEN** the system returns the same unavailable-resource behavior used by task detail and exposes no trace metadata

### Requirement: Event and connection diagnostics
The Debug timeline SHALL distinguish durable server task events from current-client SSE connection observations. It SHALL show persisted event identifiers, types, sequences, timestamps and safe payload metadata, while connection open, disconnect, reconnect, resume cursor, parse failure, and reconciliation observations MAY be maintained for the current browser session and MUST be labelled as client-local unless durably ingested by the server.

#### Scenario: Durable SSE event is emitted
- **WHEN** a task event is committed and available through SSE
- **THEN** the trace shows its durable event identity and sequence independently of whether a particular browser received it

#### Scenario: Current client reconnects
- **WHEN** the open browser loses and restores its SSE connection
- **THEN** Debug shows client-local disconnect, reconnect, resume cursor and reconciliation observations without presenting them as cross-browser server history

### Requirement: Expandable Debug timeline
The primary interface SHALL expose a clearly labelled Debug control with a bug icon only when a task is selected. Activating it SHALL open a responsive modal or side panel with summary metadata and an ordered, expandable timeline. The inline «Техническая информация» block SHALL no longer appear below the main result.

#### Scenario: User opens Debug
- **WHEN** a task is selected and the user activates the Debug control
- **THEN** focus moves into the diagnostic surface, task summary and timeline are visible, and individual entries can be expanded for lazy-loaded details

#### Scenario: User closes Debug
- **WHEN** the user presses Escape or activates the close control
- **THEN** the diagnostic surface closes and focus returns to the Debug control without changing task state

#### Scenario: Debug opens on a narrow viewport
- **WHEN** the viewport cannot accommodate a desktop side panel
- **THEN** the surface uses an accessible full-width layout without horizontal page overflow

### Requirement: Bounded and live diagnostic loading
The trace API SHALL support deterministic pagination or bounded incremental loading for large timelines. While Debug is open, committed task events SHALL trigger an incremental refresh or reconciliation without resetting expanded entries or scroll position.

#### Scenario: Trace exceeds one response page
- **WHEN** a task contains more trace entries than the configured page limit
- **THEN** the response provides a stable continuation cursor and the client can load later entries without duplicates or reordering

#### Scenario: Task advances while Debug is open
- **WHEN** a new durable task event or trace entry is committed
- **THEN** the Debug surface incorporates it in sequence while preserving the user's current inspection context
