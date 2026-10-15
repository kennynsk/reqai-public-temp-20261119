## ADDED Requirements

### Requirement: Exact approved metadata-only MCP inventory
MCP SHALL expose exactly decompose_requirements, research_requirements, get_task_status and get_task_result. Responses SHALL contain safe asynchronous job references or metadata and SHALL NOT include artifact content. Artifact upload/download and job cancellation remain REST operations.

#### Scenario: Tool discovery
- **WHEN** a client lists MCP tools
- **THEN** exactly the four approved tool names are returned

#### Scenario: Removed content tool
- **WHEN** a client calls get_task_result_content, upload_artifact or cancel_task
- **THEN** the tool is unavailable and no backend content read or mutation occurs
