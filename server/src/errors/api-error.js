export class ApiError extends Error {
  constructor({ status = 500, code = 'INTERNAL_ERROR', message = 'Internal server error', retryable = false, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function badRequest(code, message, details) {
  return new ApiError({ status: 400, code, message, details });
}

export function notFound(message = 'Resource not found') {
  return new ApiError({ status: 404, code: 'NOT_FOUND', message });
}
