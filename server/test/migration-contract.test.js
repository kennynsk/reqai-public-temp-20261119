import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'db', 'migrations');
const jobs = await readFile(path.join(directory, '002_jobs.sql'), 'utf8');
const operations = await readFile(path.join(directory, '003_artifacts_events_operations.sql'), 'utf8');
const requirementsVersions = await readFile(path.join(directory, '007_requirements_versions.sql'), 'utf8');

test('job migration defines tenant-aware lifecycle and idempotency constraints', () => {
  for (const table of ['jobs', 'idempotency_keys', 'job_steps', 'job_dependencies', 'job_attempts']) {
    assert.match(jobs, new RegExp(`CREATE TABLE \\{\\{APP_SCHEMA\\}\\}\\.${table}`));
  }
  assert.match(jobs, /PRIMARY KEY \(tenant_id, idempotency_key\)/);
  assert.match(jobs, /UNIQUE \(job_id, step_id, input_hash\)/);
  assert.match(jobs, /'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED'/);
  assert.match(jobs, /configuration_snapshot jsonb NOT NULL/);
});

test('requirements version migration persists immutable decomposition and research lineage', () => {
  assert.match(requirementsVersions, /CREATE TABLE \{\{APP_SCHEMA\}\}\.requirements_versions/);
  assert.match(requirementsVersions, /source_job_id uuid NOT NULL/);
  assert.match(requirementsVersions, /base_version_id uuid/);
  assert.match(requirementsVersions, /research_job_id uuid/);
  assert.match(requirementsVersions, /FORCE ROW LEVEL SECURITY/);
});

test('operations migration isolates artifacts and adds durable delivery state', () => {
  for (const table of ['artifacts', 'outbox_events', 'webhook_deliveries', 'audit_events', 'operational_state']) {
    assert.match(operations, new RegExp(`CREATE TABLE \\{\\{APP_SCHEMA\\}\\}\\.${table}`));
  }
  assert.match(operations, /CREATE TABLE \{\{ARTIFACT_SCHEMA\}\}\.artifact_content/);
  assert.match(operations, /size_bytes <= 104857600/);
  assert.match(operations, /UNIQUE \(aggregate_id, sequence\)/);
  assert.match(operations, /artifacts_retention_idx/);
});
