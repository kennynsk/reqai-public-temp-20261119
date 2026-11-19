## Purpose

Provide portable documents from a precisely identified saved requirements version without exposing diagnostics or confusing drafts with approved content.

## ADDED Requirements

### Requirement: Version-specific document export
Users SHALL be able to copy Markdown, download Markdown and DOCX, and open printable HTML suitable for browser PDF saving for an authorized saved version. Output SHALL come from that immutable version rather than visible filtered cards. The UI SHALL identify version and date and label PDF as browser printing, not a server-generated file.

#### Scenario: Only FR cards are visible
- **WHEN** a saved BABOK version is exported while FR is selected
- **THEN** the document includes all saved requirement types

#### Scenario: Unsaved edits exist
- **WHEN** export is requested from a dirty workspace
- **THEN** the UI offers saving first or explicitly exporting the named previous version, never presenting a draft as saved

#### Scenario: No saved version exists
- **WHEN** export is opened before first save
- **THEN** the UI explains that saving is required and does not silently substitute the original job result

### Requirement: Readable and trustworthy exported content
Documents SHALL include title, version label/date, stable requirement IDs, supported structured fields, readable sources, relevant decisions and open review items. They SHALL exclude infrastructure UUIDs, hashes, chunk details and raw lifecycle enums. Cyrillic and long requirements SHALL remain readable in DOCX and print output without clipped content.

#### Scenario: Final version retains open gaps
- **WHEN** a version was finalized with acknowledged open questions
- **THEN** exports include those questions and acknowledgment without claiming full semantic approval

#### Scenario: Document contains long requirements
- **WHEN** a version includes long paragraphs and multi-page sections
- **THEN** DOCX and print output preserve all text with usable page breaks and headings

### Requirement: Authorized export and recoverable errors
Export SHALL apply version-retrieval authorization, sanitize markup and links, and avoid fetching external content. Download or clipboard failure SHALL preserve the version and provide retry or manual-copy alternatives. Existing job-result downloads SHALL retain their current meaning.

#### Scenario: User requests an inaccessible version
- **WHEN** an export request is outside the user's authorized scope
- **THEN** no document content or identifying metadata is returned

#### Scenario: Clipboard is unavailable
- **WHEN** permissions prevent copying Markdown
- **THEN** selectable Markdown or a download alternative is shown without reporting successful copying
