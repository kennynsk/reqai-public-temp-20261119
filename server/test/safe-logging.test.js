import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLogRecord, redactSensitive, safeUrl } from '../src/middleware/safe-logging.js';

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
