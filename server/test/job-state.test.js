import assert from 'node:assert/strict';
import test from 'node:test';

import { assertJobTransition, isTerminalStatus } from '../src/domain/job-state.js';

test('job state machine permits defined durable lifecycle transitions', () => {
  assert.doesNotThrow(() => assertJobTransition('ACCEPTED', 'QUEUED'));
  assert.doesNotThrow(() => assertJobTransition('QUEUED', 'RUNNING'));
  assert.doesNotThrow(() => assertJobTransition('RUNNING', 'RETRY_WAIT'));
  assert.doesNotThrow(() => assertJobTransition('RUNNING', 'SUCCEEDED', 'PARTIAL'));
  assert.doesNotThrow(() => assertJobTransition('CANCEL_REQUESTED', 'CANCELLED'));
});

test('job state machine rejects invalid transitions and outcomes', () => {
  assert.throws(() => assertJobTransition('SUCCEEDED', 'RUNNING'), (error) => error.code === 'JOB_STATE_CONFLICT');
  assert.throws(() => assertJobTransition('RUNNING', 'SUCCEEDED'), (error) => error.code === 'JOB_OUTCOME_REQUIRED');
  assert.throws(() => assertJobTransition('RUNNING', 'FAILED', 'PARTIAL'), (error) => error.code === 'JOB_OUTCOME_FORBIDDEN');
  assert.equal(isTerminalStatus('FAILED'), true);
  assert.equal(isTerminalStatus('RETRY_WAIT'), false);
});
