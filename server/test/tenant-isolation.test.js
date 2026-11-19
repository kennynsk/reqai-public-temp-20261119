import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rls = await readFile(path.join(serverDir, 'src', 'db', 'migrations', '004_row_level_security.sql'), 'utf8');
const repository = await readFile(path.join(serverDir, 'src', 'repositories', 'job-repository.js'), 'utf8');

const tenantTables = [
  'jobs',
  'idempotency_keys',
  'job_steps',
  'job_dependencies',
  'job_attempts',
  'artifacts',
  'outbox_events',
  'webhook_deliveries',
  'audit_events',
];

test('every tenant business table has forced RLS bound to transaction context', () => {
  for (const table of tenantTables) {
    assert.match(rls, new RegExp(`ALTER TABLE \\{\\{APP_SCHEMA\\}\\}\\.${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(rls, new RegExp(`ALTER TABLE \\{\\{APP_SCHEMA\\}\\}\\.${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(rls, /tenant_id = current_setting\('app\.tenant_id', true\)/);
  assert.match(rls, /\{\{ARTIFACT_SCHEMA\}\}\.artifact_content ENABLE ROW LEVEL SECURITY/);
});

test('job repository never selects a job without the trusted tenant predicate', () => {
  const selectStatements = repository.match(/SELECT[\s\S]*?`/g) || [];
  assert.ok(selectStatements.length >= 2);
  for (const sql of selectStatements) assert.match(sql, /tenant_id = \$1/);
  assert.doesNotMatch(repository, /req\.body.*tenant/i);
});
