import assert from 'node:assert/strict';
import test from 'node:test';

import { ApiError } from '../src/errors/api-error.js';
import { apiErrorHandler } from '../src/middleware/api-error-handler.js';
import { rejectClientTenant, requireEnum, requireNonEmptyString } from '../src/middleware/validation.js';

test('central validators return typed validation errors', () => {
  assert.throws(() => requireNonEmptyString(' ', 'name'), (error) => error instanceof ApiError && error.code === 'VALIDATION_ERROR');
  assert.throws(() => requireEnum('bad', 'type', ['good']), /must be one of/);
  assert.throws(() => rejectClientTenant({ tenantId: 'forged' }), (error) => error.code === 'TENANT_CONTEXT_FORBIDDEN');
});

test('v1 error handler emits the normalized envelope and request id', () => {
  let statusCode;
  let body;
  const req = { context: { requestId: 'request-123' } };
  const res = {
    getHeader() {},
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  apiErrorHandler(
    new ApiError({ status: 409, code: 'JOB_STATE_CONFLICT', message: 'Job cannot transition' }),
    req,
    res,
    () => {},
  );
  assert.equal(statusCode, 409);
  assert.equal(body.error.code, 'JOB_STATE_CONFLICT');
  assert.equal(body.error.requestId, 'request-123');
  assert.equal(body.error.retryable, false);
});
