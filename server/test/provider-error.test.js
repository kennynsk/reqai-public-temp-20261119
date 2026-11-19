import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyProviderError } from '../src/provider/provider-error.js';

test('classifies provider codes nested under a fetch failure cause', () => {
  const cause = Object.assign(new Error('Headers Timeout Error'), { code: 'UND_ERR_HEADERS_TIMEOUT' });
  const error = Object.assign(new TypeError('fetch failed'), { cause });

  const classified = classifyProviderError(error, { requestId: 'request-1' });

  assert.equal(classified.reasonCode, 'MODEL_TIMEOUT');
  assert.equal(classified.retryable, true);
  assert.equal(classified.fallbackAllowed, true);
  assert.equal(classified.providerCode, 'UND_ERR_HEADERS_TIMEOUT');
  assert.equal(classified.requestId, 'request-1');
});

test('preserves HTTP status and request id for rejected provider responses', () => {
  const classified = classifyProviderError(Object.assign(new Error('rejected'), { status: 422, requestId: 'request-2' }));

  assert.equal(classified.reasonCode, 'UNKNOWN_PROVIDER_ERROR');
  assert.equal(classified.status, 422);
  assert.equal(classified.requestId, 'request-2');
});
