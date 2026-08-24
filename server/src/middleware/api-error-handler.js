import { ApiError, notFound } from '../errors/api-error.js';
import { logEvent } from './safe-logging.js';

export function apiNotFound(req, res, next) {
  next(notFound('API endpoint not found'));
}

// eslint-disable-next-line no-unused-vars
export function apiErrorHandler(err, req, res, next) {
  const parserError = err?.type === 'entity.too.large'
    ? new ApiError({ status: 413, code: 'REQUEST_BODY_TOO_LARGE', message: 'JSON request is too large; upload content through the artifact API' })
    : err?.type === 'entity.parse.failed'
      ? new ApiError({ status: 400, code: 'INVALID_JSON', message: 'Request body must be valid JSON' })
      : err;
  const known = parserError instanceof ApiError;
  const status = known ? parserError.status : 500;
  const requestId = req.context?.requestId || String(res.getHeader('X-Request-Id') || 'unknown');
  if (!known || status >= 500) {
    logEvent('error', 'api.request.failed', {
      requestId,
      errorType: parserError?.name || 'Error',
      errorCode: known ? parserError.code : 'INTERNAL_ERROR',
      statusCode: status,
    });
  }
  if (known && [429, 503].includes(status) && Number.isInteger(parserError.details?.retryAfterSeconds)) {
    res.set('Retry-After', String(parserError.details.retryAfterSeconds));
  }
  res.status(status).json({
    error: {
      code: known ? parserError.code : 'INTERNAL_ERROR',
      message: known ? parserError.message : 'Internal server error',
      requestId,
      retryable: known ? Boolean(parserError.retryable) : false,
      ...(known && parserError.details !== undefined ? { details: parserError.details } : {}),
    },
  });
}
