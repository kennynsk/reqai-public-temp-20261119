-- Run as a PostgreSQL administrator after replacing role names and passwords
-- according to the on-prem secret-management process. Application deployments
-- must not receive the migration role credentials.

-- CREATE ROLE reqai_migrator LOGIN PASSWORD '<FROM_SECRET_MANAGER>';
-- CREATE ROLE reqai_app LOGIN PASSWORD '<FROM_SECRET_MANAGER>';
-- CREATE ROLE reqai_temporal LOGIN PASSWORD '<FROM_SECRET_MANAGER>';

-- GRANT USAGE, CREATE ON SCHEMA reqai, reqai_artifacts TO reqai_migrator;
-- GRANT USAGE ON SCHEMA reqai, reqai_artifacts TO reqai_app;
-- Grant SELECT/INSERT/UPDATE/DELETE only to mutable business tables. Audit events
-- are deliberately excluded from UPDATE and DELETE grants.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON
--   reqai.jobs, reqai.idempotency_keys, reqai.job_steps, reqai.job_dependencies,
--   reqai.job_attempts, reqai.artifacts, reqai.outbox_events,
--   reqai.webhook_deliveries, reqai.operational_state, reqai_artifacts.artifact_content
-- TO reqai_app;
-- Requirements versions are immutable lineage records: the application may append
-- and read them, but may not update or delete them.
-- GRANT SELECT, INSERT ON reqai.requirements_versions TO reqai_app;
-- GRANT SELECT, INSERT ON reqai.audit_events TO reqai_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA reqai, reqai_artifacts TO reqai_app;
-- Do not grant mutable default table privileges automatically: each new table
-- must be classified as mutable or append-only in a reviewed migration.

-- Temporal receives a separate database or schema owned by reqai_temporal;
-- reqai_app and reqai_migrator receive no grants to Temporal persistence.
