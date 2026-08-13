import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiagnosticCaptureService } from '../src/services/diagnostic-capture-service.js';

function setup(captureProtected) {
  const created = [];
  const appended = [];
  const config = {
    diagnostics: { captureProtected, maxDetailBytes: 4096 },
    retention: { fullPromptsDays: 14, rawLlmDays: 7, intermediateDays: 30 },
  };
  const service = createDiagnosticCaptureService({
    config,
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    artifactRepository: { async createText(value) { created.push(value); return { artifactId: 'artifact-1', sha256: 'abc', sizeBytes: 10 }; } },
    jobTraceRepository: { async append(value) { appended.push(value); return value; } },
  });
  return { service, created, appended };
}

test('protected diagnostic capture is disabled by default policy', async () => {
  const { service, created, appended } = setup(false);
  assert.equal(await service.capture({ tenantId: 't', ownerUserId: 'u', jobId: 'j', category: 'MODEL', name: 'output', kind: 'OUTPUT', content: { text: 'value' } }), null);
  assert.equal(created.length, 0);
  assert.equal(appended.length, 0);
});

test('protected capture redacts credentials and links a retained artifact', async () => {
  const { service, created, appended } = setup(true);
  await service.capture({ tenantId: 't', ownerUserId: 'u', jobId: 'j', stepId: 's', category: 'INSTRUCTIONS', name: 'prompt', kind: 'PROMPT', content: { authorization: 'Bearer raw', text: 'token=raw-value useful prompt' } });
  assert.equal(created[0].kind, 'PROMPT');
  assert.equal(created[0].maxBytes, 4096);
  assert.match(created[0].text, /\[REDACTED\]/);
  assert.doesNotMatch(created[0].text, /raw-value|Bearer raw/);
  assert.equal(appended[0].detailArtifactId, 'artifact-1');
  assert.equal(appended[0].detailVisibility, 'PRIVILEGED');
  assert.equal(appended[0].expiresAt.toISOString(), '2026-01-15T00:00:00.000Z');
});
