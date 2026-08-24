import { randomUUID } from 'node:crypto';

const SAFE_DETAIL_KEYS = new Set(['field', 'fields', 'retryAfterSeconds', 'limit', 'mode']);

export class GatewayError extends Error {
  constructor({ code, message, retryable = false, requestId = null, details, status = 500 }) {
    super(message); this.name = 'GatewayError'; this.code = code; this.retryable = retryable; this.requestId = requestId; this.details = details; this.status = status;
  }
}

function safeDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const value = Object.fromEntries(Object.entries(details).filter(([key]) => SAFE_DETAIL_KEYS.has(key)));
  return Object.keys(value).length ? value : undefined;
}

export function parseBearer(header) {
  const match = String(header || '').match(/^Bearer\s+([^\s]+)$/i);
  if (!match) throw new GatewayError({ status: 401, code: 'MCP_UNAUTHORIZED', message: 'Bearer authentication required' });
  return match[1];
}

export function createReqAiClient({ config, fetchImpl = globalThis.fetch }) {
  async function request({ method, path, token, body, idempotencyKey, timeoutMs = config.backendTimeoutMs }) {
    const requestId = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${config.backendUrl}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          accept: 'application/json',
          'x-request-id': requestId,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      let payload = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = null; }
      if (!response.ok) {
        const error = payload?.error;
        throw new GatewayError({
          status: response.status,
          code: typeof error?.code === 'string' ? error.code : 'BACKEND_ERROR',
          message: typeof error?.message === 'string' ? error.message : 'ReqAI API request failed',
          retryable: Boolean(error?.retryable) || response.status >= 500,
          requestId: typeof error?.requestId === 'string' ? error.requestId : requestId,
          details: safeDetails(error?.details),
        });
      }
      const size = Buffer.byteLength(JSON.stringify(payload ?? null));
      if (size > config.responseLimitBytes) throw new GatewayError({ status: 502, code: 'MCP_RESPONSE_TOO_LARGE', message: 'Backend response exceeds the MCP metadata limit', requestId });
      return payload;
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      if (error?.name === 'AbortError') throw new GatewayError({ status: 504, code: 'MCP_BACKEND_TIMEOUT', message: 'ReqAI API request timed out', retryable: true, requestId });
      throw new GatewayError({ status: 503, code: 'MCP_BACKEND_UNAVAILABLE', message: 'ReqAI API is unavailable', retryable: true, requestId });
    } finally { clearTimeout(timeout); }
  }

  async function authenticate(token) {
    const value = await request({ method: 'GET', path: '/api/v1', token, timeoutMs: config.authTimeoutMs });
    const operations = value?.capabilities?.domainOperations;
    if (value?.version !== 'v1' || !Array.isArray(operations) || !['decomposition', 'standalone-research', 'requirements-research'].every((operation) => operations.includes(operation))) {
      throw new GatewayError({ status: 503, code: 'MCP_BACKEND_INCOMPATIBLE', message: 'ReqAI API does not expose the required v1 domain operations', retryable: false, requestId: value?.requestId || null });
    }
    return value;
  }

  return Object.freeze({
    health: () => request({ method: 'GET', path: '/health/ready', token: null, timeoutMs: config.authTimeoutMs }),
    authenticate,
    decompose: (token, input) => { const { idempotencyKey, ...body } = input; return request({ method: 'POST', path: '/api/v1/decompositions', token, body, idempotencyKey }); },
    startResearch: (token, input) => { const { idempotencyKey, ...body } = input; return request({ method: 'POST', path: '/api/v1/research', token, body, idempotencyKey }); },
    researchRequirements: (token, input) => { const { idempotencyKey, versionId, ...body } = input; return request({ method: 'POST', path: `/api/v1/requirements/versions/${encodeURIComponent(versionId)}/research`, token, body, idempotencyKey }); },
    getStatus: (token, { jobId }) => request({ method: 'GET', path: `/api/v1/jobs/${encodeURIComponent(jobId)}`, token }),
    getResult: (token, { jobId }) => request({ method: 'GET', path: `/api/v1/jobs/${encodeURIComponent(jobId)}/result`, token }),
  });
}
