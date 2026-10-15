## ADDED Requirements

### Requirement: Exact public execution admission inventory
The public API SHALL create execution jobs only through POST /api/v1/decompositions and POST /api/v1/requirements/versions/{versionId}/research. Generic POST /api/v1/jobs SHALL be unavailable. Artifact upload and immutable version persistence remain separate domain storage operations.

#### Scenario: Generic creation request
- **WHEN** a caller posts an execution command to /api/v1/jobs
- **THEN** the API returns not found without creating a job

#### Scenario: Browser submission
- **WHEN** the browser submits decomposition
- **THEN** it uses the supported decomposition endpoint and never falls back to generic creation
