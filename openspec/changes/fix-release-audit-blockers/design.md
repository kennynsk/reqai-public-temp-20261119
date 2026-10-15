## Context

See proposal.md. The audit applies to clean main at 3974180. Current local Docker services use bind-mounted source and Node 22. Published prompt versions and historical jobs must remain intact.

## Goals / Non-Goals

Goals: remove reproduced F01–F10 release blockers with regression tests and validate against the existing reqai.
Non-goals: cosmetic redesign, production infrastructure changes, new containers, repository publication, changing historical artifacts or published prompt hashes.

## Decisions

- Keep field edits provisional. Derive invalidated decisions for save/acceptance from actual drafts; applying content invalidates as before. Cancel removes the provisional field without changing committed decisions or unrelated edits.
- Decode storage chunks with streaming UTF-8 state. Validate user-uploaded materials as nonempty UTF-8 text with an explicit supported MIME allowlist, including legacy artifacts at admission. Use the same boundary for primary/baseline/reference roles.
- Add immutable decomposition prompt releases 2.16.0 and 2.17.0 with explicit non-obligation source-check disposition and preserved metadataUnits for unambiguous dated audit labels. Two live 2.16.0 attempts showed that an instruction alone did not reliably keep a heading out of subsequent repair passes. A missing target is permitted only for such a justified disposition; substantive source conditions still need valid targets.
- Return only job references from lifecycle activities rather than full repository rows (title/search_summary were found in real Temporal history). Remove free-form reasons from ordinary trace and workflow metadata at both write and read boundaries. Protected diagnostics retain their separate policy. Do not rewrite historical rows.
- Follow the existing AGENTS contract: exactly two HTTP execution creation routes, exactly four MCP tools returning safe metadata. Remove generic UI fallback and retain canonical reads/cancellation under jobs. This intentionally breaks undocumented/additive launch surfaces, not historical reads.
- Use role-scoped Secrets for least-privilege worker credentials. Mount Nginx temp/PID directories with uid 101 access; do not weaken the read-only security context. The frontend builder copies shared server source modules imported by its review/quality/report components. Production instructions describe separate frontend/API/workers rather than nonexistent API static hosting.
- Apply compatible dependency security updates and explicitly assess remaining advisories. No blind force upgrades; keep published prompt dependencies independent.
- Follow-up: migrate Tailwind 3 to Tailwind 4 with its official Vite plugin to remove the remaining braces and selector-parser advisory chains. Keep source discovery confined to client/src and index.html, preserve v3 shadow/radius/outline semantics and base appearance, and compare actual responsive screens before/after. Fix narrow viewport containment of the return action and AI settings menu when observed at 320 CSS px. Modern browser minimums follow Tailwind 4 (Safari 16.4+, Chrome 111+, Firefox 128+). No new container or infrastructure operation is required.

## Risks / Trade-offs

- Narrowing API/MCP breaks clients using extra operations → document migration to approved REST execution paths and artifact REST reads.
- Semantic exception could hide a real obligation → require explicit non-obligation disposition, a reason, and no issues; test missing coverage still fails and verify with real GLM.
- Upload validation may reject previously accepted binary files → explain supported TXT/Markdown/JSON formats before upload; no new parsing library.
- Source edits trigger local watch restarts → perform E2E after changes stabilize; only synthetic audit jobs.

## Migration Plan

No database migration or historical rewrite. Release new prompt assets before activation, retain previous bundles, deploy coordinated API/client/gateway contracts and role-scoped Secrets. Rollback uses matching prior images/config. This task changes files only; target IAM/TLS/RPO/RTO remain external qualification requirements, not invented configuration values.

## Follow-up: MCP alignment and unused legacy code

A source import graph over 254 JS/JSX/MJS files and whole-project reference searches found five server modules reachable only from their isolated tests (or not referenced): adapters/requirements-adapter-boundary, config/bootstrap, domain/chunking, middleware/validation, services/event-deduplicator. Their active equivalents are REST domain routes/services, config/env, streamed enterprise activities, current route/Ajv validation. The event deduplication helper was never wired into a runtime consumer; removing it changes no active event path. Remove them and tests specific only to those removed implementations; preserve adjacent active tests. Remove unused ApplicabilityBars/inferTargetTypeFromInsightCategory UI helpers and the unreferenced React template asset. Keep active flat-registry/historical read adapters, source fallback prompts, published releases and all additive SQL migrations.

MCP SDK 1.32.1 is the current published version of the installed package. Keep that dependency and the four-tool surface. Enforce schema 3.0.0 at configuration/client qualification boundaries and align active documentation. Remove unreachable upload/content/cancel schemas and methods rather than keeping a second unused surface. Repair task routing/recovery/load/soak scripts which still POST generic jobs; research workload fixtures must reference immutable versions owned by each test identity, and soak upload must be valid UTF-8 text. Validate contracts without executing paid load, crash drills or production operations.

The production planning change `prepare-production-configuration` is separate and remains unimplemented. The user confirms existing stores are dev-only and no data will migrate: a fresh production store removes the old-history migration prerequisite, without deleting current dev data or removing privacy protections.
