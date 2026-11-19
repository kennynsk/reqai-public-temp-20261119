export class ProviderError extends Error {
  constructor(message, { reasonCode = 'UNKNOWN_PROVIDER_ERROR', retryable = false, fallbackAllowed = false, status, requestId, providerCode } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.reasonCode = reasonCode;
    this.retryable = retryable;
    this.fallbackAllowed = fallbackAllowed;
    this.status = status;
    this.requestId = requestId;
    this.providerCode = providerCode;
  }
}

function errorChain(error) {
  const chain = [];
  const seen = new Set();
  let current = error;
  while (current && !seen.has(current) && chain.length < 4) {
    chain.push(current);
    seen.add(current);
    current = current.cause;
  }
  return chain;
}

function firstValue(chain, getter) {
  return chain.map(getter).find((value) => value !== undefined && value !== null && value !== '');
}

export function classifyProviderError(error, { requestId: fallbackRequestId } = {}) {
  if (error instanceof ProviderError) return error;
  const chain = errorChain(error);
  const statusValue = firstValue(chain, (item) => item?.status ?? item?.statusCode ?? item?.response?.status);
  const status = Number(statusValue);
  const providerCode = String(firstValue(chain, (item) => item?.code) || '').toUpperCase() || undefined;
  const name = String(firstValue(chain, (item) => item?.name) || '');
  const requestId = firstValue(chain, (item) => item?.requestId) || fallbackRequestId;
  const details = { status: Number.isFinite(status) ? status : undefined, requestId, providerCode };
  if (name === 'AbortError' || ['ETIMEDOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(providerCode)) {
    return new ProviderError('Provider timeout', { ...details, reasonCode: 'MODEL_TIMEOUT', retryable: true, fallbackAllowed: true });
  }
  if (['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(providerCode)) {
    return new ProviderError('Provider network failure', { ...details, reasonCode: 'MODEL_NETWORK', retryable: true, fallbackAllowed: true });
  }
  if (status === 429) return new ProviderError('Provider throttled request', { ...details, reasonCode: 'MODEL_RATE_LIMIT', retryable: true, fallbackAllowed: true });
  if (status >= 500 && status <= 599) return new ProviderError('Provider service failure', { ...details, reasonCode: 'MODEL_5XX', retryable: true, fallbackAllowed: true });
  if ([400, 401, 403].includes(status)) return new ProviderError('Provider rejected request', { ...details, reasonCode: `MODEL_HTTP_${status}` });
  if (providerCode?.includes('CONTENT') || status === 451) return new ProviderError('Provider content policy rejection', { ...details, reasonCode: 'MODEL_CONTENT_POLICY' });
  return new ProviderError('Unclassified provider failure', { ...details, reasonCode: 'UNKNOWN_PROVIDER_ERROR' });
}
