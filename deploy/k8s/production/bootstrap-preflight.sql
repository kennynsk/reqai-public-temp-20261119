-- READ ONLY. Run on the approved empty TARGET database, not the existing reqai dev DB.
-- psql variables: app_schema, artifact_schema, runtime_role.
\set ON_ERROR_STOP on
BEGIN READ ONLY;
SELECT count(*) = 0 AS stores_empty
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN (:'app_schema', :'artifact_schema')
  AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
\gset
\if :stores_empty
\else
  \echo PREFLIGHT_FAILED_NONEMPTY_TARGET_SCHEMAS
  \quit 1
\endif
SELECT count(*) = 1 AS runtime_safe
FROM pg_roles r
WHERE r.rolname = :'runtime_role'
  AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolcreaterole AND NOT r.rolcreatedb
  AND r.rolname <> current_user
  AND NOT pg_has_role(r.oid, current_user::regrole::oid, 'MEMBER')
  AND NOT EXISTS (
    SELECT 1 FROM pg_roles privileged
    WHERE (privileged.rolsuper OR privileged.rolbypassrls OR privileged.rolname IN (
      'pg_read_all_data', 'pg_write_all_data', 'pg_read_server_files',
      'pg_write_server_files', 'pg_execute_server_program', 'pg_database_owner'
    ))
      AND pg_has_role(r.oid, privileged.oid, 'MEMBER')
  )
\gset
\if :runtime_safe
\else
  \echo PREFLIGHT_FAILED_RUNTIME_ROLE
  \quit 1
\endif
COMMIT;
\echo PREFLIGHT_METADATA_CHECKS_PASSED
