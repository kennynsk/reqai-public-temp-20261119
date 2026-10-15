-- READ ONLY. Run AFTER migrations/grants, using the actual runtime credential on TARGET DB.
-- psql variables: app_schema, artifact_schema.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = current_user
    AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)
) AND NOT EXISTS (
  SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN (:'app_schema', :'artifact_schema') AND c.relkind IN ('r', 'p')
    AND pg_has_role(current_user::regrole::oid, c.relowner, 'MEMBER')
) AS role_safe
\gset
\if :role_safe
\else
  \echo RUNTIME_PREFLIGHT_FAILED_PRIVILEGED_ROLE
  \quit 1
\endif
SELECT count(*) > 0 AND bool_and(c.relrowsecurity AND c.relforcerowsecurity) AS rls_safe
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN (:'app_schema', :'artifact_schema') AND c.relkind IN ('r', 'p')
  AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped)
\gset
\if :rls_safe
\else
  \echo RUNTIME_PREFLIGHT_FAILED_TENANT_RLS
  \quit 1
\endif
SELECT has_table_privilege(current_user, format('%I.audit_events', :'app_schema'), 'SELECT')
  AND has_table_privilege(current_user, format('%I.audit_events', :'app_schema'), 'INSERT')
  AND NOT has_table_privilege(current_user, format('%I.audit_events', :'app_schema'), 'UPDATE,DELETE,TRUNCATE')
  AND NOT has_table_privilege(current_user, format('%I.schema_migrations', :'app_schema'), 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS grants_safe
\gset
\if :grants_safe
\else
  \echo RUNTIME_PREFLIGHT_FAILED_GRANTS
  \quit 1
\endif
COMMIT;
\echo RUNTIME_PREFLIGHT_METADATA_CHECKS_PASSED
