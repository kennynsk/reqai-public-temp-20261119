export class ProviderError extends Error {
  constructor(message, { reasonCode = 'UNKNOWN_PROVIDER_ERROR', retryable = false, fallbackAllowed = false, status, requestId } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.reasonCode = reasonCode;
    this.retryable = retryable;
    this.fallbackAllowed = fallbackAllowed;
    this.status = status;
    this.requestId = requestId;
  }
}

export function classifyProviderError(error) {
  if (error instanceof ProviderError) return error;
  const status = Number(error?.status || error?.statusCode || error?.response?.status);
  const code = String(error?.code || '').toUpperCase();
  if (error?.name === 'AbortError' || code === 'ETIMEDOUT' || code === 'UND_ERR_HEADERS_TIMEOUT') {
    return new ProviderError('Provider timeout', { reasonCode: 'MODEL_TIMEOUT', retryable: true, fallbackAllowed: true });
  }
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return new ProviderError('Provider network failure', { reasonCode: 'MODEL_NETWORK', retryable: true, fallbackAllowed: true });
  }
  if (status === 429) return new ProviderError('Provider throttled request', { reasonCode: 'MODEL_RATE_LIMIT', retryable: true, fallbackAllowed: true, status });
  if (status >= 500 && status <= 599) return new ProviderError('Provider service failure', { reasonCode: 'MODEL_5XX', retryable: true, fallbackAllowed: true, status });
  if ([400, 401, 403].includes(status)) return new ProviderError('Provider rejected request', { reasonCode: `MODEL_HTTP_${status}`, status });
  if (code.includes('CONTENT') || status === 451) return new ProviderError('Provider content policy rejection', { reasonCode: 'MODEL_CONTENT_POLICY', status });
  return new ProviderError('Unclassified provider failure', { reasonCode: 'UNKNOWN_PROVIDER_ERROR', status: Number.isFinite(status) ? status : undefined });
}
