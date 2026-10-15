-- MUTATION TEMPLATE: only the separately authorized target bootstrap operator runs this.
-- psql variables: app_schema, artifact_schema, runtime_role.
-- Migration owner must own the schemas; runtime must NOT own them or inherit owner privileges.
\set ON_ERROR_STOP on
BEGIN;
GRANT USAGE ON SCHEMA :"app_schema", :"artifact_schema" TO :"runtime_role";
REVOKE CREATE ON SCHEMA :"app_schema", :"artifact_schema" FROM :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA :"app_schema", :"artifact_schema" TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA :"app_schema", :"artifact_schema" TO :"runtime_role";
REVOKE ALL ON TABLE :"app_schema".schema_migrations FROM :"runtime_role";
REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE :"app_schema".audit_events FROM :"runtime_role";
COMMIT;
