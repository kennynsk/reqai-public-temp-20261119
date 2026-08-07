import { ApiError } from '../errors/api-error.js';

export const JOB_STATUSES = Object.freeze([
  'ACCEPTED',
  'QUEUED',
  'RUNNING',
  'RETRY_WAIT',
  'SUCCEEDED',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED',
]);

const TRANSITIONS = Object.freeze({
  ACCEPTED: new Set(['QUEUED', 'FAILED', 'CANCEL_REQUESTED']),
  QUEUED: new Set(['RUNNING', 'FAILED', 'CANCEL_REQUESTED']),
  RUNNING: new Set(['RETRY_WAIT', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED']),
  RETRY_WAIT: new Set(['RUNNING', 'FAILED', 'CANCEL_REQUESTED']),
  CANCEL_REQUESTED: new Set(['CANCELLED', 'SUCCEEDED', 'FAILED']),
  SUCCEEDED: new Set(),
  FAILED: new Set(),
  CANCELLED: new Set(),
});

export function assertJobTransition(from, to, outcome = null) {
  if (!JOB_STATUSES.includes(from) || !JOB_STATUSES.includes(to) || !TRANSITIONS[from].has(to)) {
    throw new ApiError({
      status: 409,
      code: 'JOB_STATE_CONFLICT',
      message: `Job cannot transition from ${from} to ${to}`,
    });
  }
  if (to === 'SUCCEEDED' && !['COMPLETE', 'PARTIAL'].includes(outcome)) {
    throw new ApiError({
      status: 409,
      code: 'JOB_OUTCOME_REQUIRED',
      message: 'Successful jobs require COMPLETE or PARTIAL outcome',
    });
  }
  if (to !== 'SUCCEEDED' && outcome != null) {
    throw new ApiError({
      status: 409,
      code: 'JOB_OUTCOME_FORBIDDEN',
      message: 'Only successful jobs may have an outcome',
    });
  }
}

export function isTerminalStatus(status) {
  return ['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status);
}
