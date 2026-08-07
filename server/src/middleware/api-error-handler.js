import { ApiError, notFound } from '../errors/api-error.js';
import { logEvent } from './safe-logging.js';

export function apiNotFound(req, res, next) {
  next(notFound('API endpoint not found'));
}

// eslint-disable-next-line no-unused-vars
export function apiErrorHandler(err, req, res, next) {
  const known = err instanceof ApiError;
  const status = known ? err.status : 500;
  const requestId = req.context?.requestId || String(res.getHeader('X-Request-Id') || 'unknown');
  if (!known || status >= 500) {
    logEvent('error', 'api.request.failed', {
      requestId,
      errorType: err?.name || 'Error',
      errorCode: known ? err.code : 'INTERNAL_ERROR',
      statusCode: status,
    });
  }
  if (known && [429, 503].includes(status) && Number.isInteger(err.details?.retryAfterSeconds)) {
    res.set('Retry-After', String(err.details.retryAfterSeconds));
  }
  res.status(status).json({
    error: {
      code: known ? err.code : 'INTERNAL_ERROR',
      message: known ? err.message : 'Internal server error',
      requestId,
      retryable: known ? Boolean(err.retryable) : false,
      ...(known && err.details !== undefined ? { details: err.details } : {}),
    },
  });
}
