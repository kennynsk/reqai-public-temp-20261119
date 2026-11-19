import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const eventsDir = path.resolve(testDir, '..', '..', 'docs', 'events');

async function load(name) {
  return JSON.parse(await readFile(path.join(eventsDir, name), 'utf8'));
}

test('job event v1 carries identity, ordering, tenant and artifact references', async () => {
  const schema = await load('job-event.v1.schema.json');
  for (const field of ['eventId', 'schemaVersion', 'eventType', 'tenantId', 'jobId', 'sequence', 'occurredAt', 'data']) {
    assert.ok(schema.required.includes(field), `${field} must be required`);
  }
  assert.equal(schema.properties.schemaVersion.const, '1.0');
  for (const eventType of ['job.status-changed', 'job.progress', 'job.cancel-requested', 'linked-research.created', 'requirements.version-created']) {
    assert.ok(schema.properties.eventType.enum.includes(eventType), `${eventType} must be documented`);
  }
  assert.equal(schema.properties.data.required, undefined);
  assert.equal(schema.allOf.length, 3);
  assert.ok(schema.properties.data.properties.resultArtifactId);
  assert.equal(schema.properties.data.properties.resultContent, undefined);
});

test('webhook event v1 is terminal and metadata-only', async () => {
  const schema = await load('webhook-event.v1.schema.json');
  assert.deepEqual(schema.properties.eventType.enum, ['job.completed', 'job.failed', 'job.cancelled']);
  assert.ok(schema.properties.result.properties.url);
  assert.ok(schema.properties.result.properties.artifactId);
  assert.equal(schema.properties.result.properties.content, undefined);
});
