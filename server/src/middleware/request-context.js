import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

const requestStorage = new AsyncLocalStorage();

export function getRequestContext() {
  return requestStorage.getStore();
}

export function requestContext(req, res, next) {
  const incoming = String(req.headers['x-request-id'] || '').trim();
  const requestId = incoming && incoming.length <= 128 ? incoming : randomUUID();
  const context = Object.freeze({
    requestId,
    startedAt: Date.now(),
  });
  req.context = context;
  res.setHeader('X-Request-Id', requestId);
  requestStorage.run(context, next);
}
