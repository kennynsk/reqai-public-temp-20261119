import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLogRecord, redactDiagnosticMetadata, redactSensitive, safeUrl } from '../src/middleware/safe-logging.js';

test('structured logging removes prompts, results and credentials', () => {
  const safe = redactSensitive({
    authorization: 'Bearer secret',
    prompt: 'private prompt',
    nested: { requirements: 'private requirements', model: 'GC-Max' },
  });
  assert.deepEqual(safe, {
    authorization: '[REDACTED]',
    prompt: '[REDACTED]',
    nested: { requirements: '[REDACTED]', model: 'GC-Max' },
  });
  const encoded = JSON.stringify(buildLogRecord('info', 'test', safe));
  assert.equal(encoded.includes('private'), false);
  assert.equal(encoded.includes('secret'), false);
});

test('logged URLs omit query strings', () => {
  assert.equal(safeUrl('https://provider.example/chat?token=secret'), 'https://provider.example/chat');
  assert.equal(safeUrl('/api/v1/jobs?cursor=private'), '/api/v1/jobs');
});

test('diagnostic issue identifiers cannot carry text disguised as an ASCII key', () => {
  const marker = 'PRIVATE_REQUIREMENT_TEXT';
  const result = redactDiagnosticMetadata({ issues: [{ key: marker, reason: marker }, { key: 'FR-001', code: 'NON_ATOMIC' }, { key: 'INS-001:0', code: 'SOURCE_COVERAGE_LOST' }] });
  assert.equal(JSON.stringify(result).includes(marker), false);
  assert.equal(result.issues[1].key, 'FR-001');
  assert.equal(result.issues[2].key, 'INS-001:0');
});
