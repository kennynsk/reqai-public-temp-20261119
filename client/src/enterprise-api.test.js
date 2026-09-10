// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { createHash } from 'node:crypto';

import { EnterpriseApiError, digestFile, enterpriseApi, normalizeJobEvent, subscribeJobEvents, subscribeRequirementDiscussionEvents } from './api/enterprise-api.js';

afterEach(() => vi.unstubAllGlobals());

function eventResponse(block) {
  let delivered = false;
  return {
    ok: true,
    body: { getReader: () => ({ read: async () => delivered ? { done: true } : (delivered = true, { done: false, value: new TextEncoder().encode(block) }) }) },
  };
}

test('discussion SSE parses typed events, sends the cursor and reconciles after a disconnect', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'discussion-token' });
  const controller = new AbortController();
  const calls = [];
  const observations = [];
  let stream = 0;
  vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
    if (String(path).endsWith('/events')) {
      calls.push(options.headers['Last-Event-ID']);
      stream += 1;
      return eventResponse(`id: ${stream}\nevent: ${stream === 1 ? 'attempt.started' : 'message.completed'}\ndata: {"attemptId":"a-${stream}"}\n\n`);
    }
    return { ok: true, status: 200, json: async () => ({ discussionId: 'd1', messages: [] }) };
  }));
  await subscribeRequirementDiscussionEvents('job/1', 'GAP 1', {
    signal: controller.signal,
    reconnectDelayMs: 0,
    onObservation: async (observation) => observations.push(observation.type),
    onEvent: async (event) => { if (event.type === 'message.completed') controller.abort(); },
  });
  expect(calls).toEqual(['0', '1']);
  expect(observations).toEqual(['connect', 'connected', 'reconcile', 'reconnect', 'connected']);
});

test('SSE reconnects from the last delivered sequence and reconciles between connections', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const cursors = [];
  let streamCall = 0;
  vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
    if (String(path).endsWith('/events')) {
      cursors.push(options.headers['Last-Event-ID']);
      streamCall += 1;
      return eventResponse(`id: ${streamCall}\ndata: {"eventId":"event-${streamCall}","schemaVersion":"1.0","eventType":"job.progress","tenantId":"tenant-1","jobId":"job-1","sequence":${streamCall},"occurredAt":"2026-01-01T00:00:00.000Z","source":{"service":"reqai-api","site":"dc-a","instance":null},"data":{"jobId":"job-1","sequence":${streamCall}}}\n\n`);
    }
    return { ok: true, status: 200, json: async () => ({ jobId: 'job-1', status: 'RUNNING' }) };
  }));
  const controller = new AbortController();
  const received = [];
  const observations = [];
  await subscribeJobEvents('job-1', {
    signal: controller.signal,
    onObservation: async (observation) => observations.push([observation.type, observation.cursor]),
    onEvent: async (event) => {
      received.push(event.type === 'reconcile' ? 'reconcile' : event.sequence);
      if (event.sequence === 2) controller.abort();
    },
  });
  expect(cursors).toEqual(['0', '1']);
  expect(received).toEqual([1, 'reconcile', 2]);
  expect(observations).toEqual([
    ['connect', 0], ['connected', 0], ['reconcile', 1], ['reconnect', 1], ['connected', 1],
  ]);
});

test('includes an access token in authenticated SSE connections', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'sse-token' });
  const controller = new AbortController();
  const fetchMock = vi.fn(async (path, options = {}) => {
    if (String(path).endsWith('/events')) {
      expect(options.headers).toMatchObject({ Authorization: 'Bearer sse-token', Accept: 'text/event-stream', 'Last-Event-ID': '0' });
      return eventResponse('id: 1\ndata: {"sequence":1}\n\n');
    }
    return { ok: true, status: 200, json: async () => ({ status: 'RUNNING' }) };
  });
  vi.stubGlobal('fetch', fetchMock);

  await subscribeJobEvents('job-1', { signal: controller.signal, onEvent: async () => controller.abort() });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('canonical event data is flattened for existing consumers', () => {
  expect(normalizeJobEvent({ eventType: 'requirements.version-created', data: { versionId: 'version-1' } })).toMatchObject({ eventType: 'requirements.version-created', versionId: 'version-1' });
});

test('SSE cursor advances only after the event handler succeeds', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const originalSetTimeout = globalThis.setTimeout;
  vi.stubGlobal('setTimeout', (callback, delay) => originalSetTimeout(callback, Math.min(delay, 0)));
  const controller = new AbortController();
  const cursors = [];
  let failedOnce = false;
  vi.stubGlobal('fetch', vi.fn(async (path, options = {}) => {
    if (String(path).endsWith('/events')) {
      cursors.push(options.headers['Last-Event-ID']);
      return eventResponse(`id: 1\ndata: {"jobId":"job-1","sequence":1}\n\n`);
    }
    return { ok: true, status: 200, json: async () => ({ jobId: 'job-1', status: 'RUNNING' }) };
  }));
  await subscribeJobEvents('job-1', {
    signal: controller.signal,
    onEvent: async (event) => {
      if (event.sequence === 1 && !failedOnce) { failedOnce = true; throw new Error('refresh failed'); }
      if (event.sequence === 1) controller.abort();
    },
  });
  expect(cursors).toEqual(['0', '0']);
});

test('builds authenticated requests for all job and requirements operations', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'api-token' });
  const fetchMock = vi.fn(async (path) => ({
    ok: true,
    status: String(path).endsWith('/cancel') ? 204 : 200,
    json: async () => ({ path }),
  }));
  vi.stubGlobal('fetch', fetchMock);

  await enterpriseApi.getCapabilities();
  await enterpriseApi.listJobs({ status: 'RUNNING', cursor: null, limit: 20 });
  await enterpriseApi.updateJobMetadata('job-1', { title: 'Новая задача' });
  await enterpriseApi.getJob('job-1');
  await enterpriseApi.getResult('job-1');
  await enterpriseApi.getJobTrace('job-1', { cursor: 'page-2', limit: 2 });
  await enterpriseApi.getJobTraceDetail('job-1', 'entry-1');
  await enterpriseApi.createJob({ type: 'DECOMPOSITION' }, 'create-key');
  await enterpriseApi.decomposeRequirements({ inputArtifactId: 'artifact-1' }, 'decompose-key');
  await enterpriseApi.researchRequirements('version-1', { model: 'model-1' }, 'research-key');
  await enterpriseApi.saveRequirementsVersion({ versionId: 'version-1' });
  await enterpriseApi.getRequirementsVersion('version-1');
  await enterpriseApi.listRequirementsVersions('job-1');
  await expect(enterpriseApi.cancelJob('job-1')).resolves.toBeNull();
  await enterpriseApi.retryJob('job-1', 'retry-key');

  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual([
    '/api/v1',
    '/api/v1/jobs?status=RUNNING&limit=20',
    '/api/v1/jobs/job-1/metadata',
    '/api/v1/jobs/job-1',
    '/api/v1/jobs/job-1/result',
    '/api/v1/jobs/job-1/trace?cursor=page-2&limit=2',
    '/api/v1/jobs/job-1/trace/entry-1',
    '/api/v1/jobs',
    '/api/v1/decompositions',
    '/api/v1/requirements/versions/version-1/research',
    '/api/v1/requirements/versions',
    '/api/v1/requirements/versions/version-1',
    '/api/v1/jobs/job-1/requirements/versions',
    '/api/v1/jobs/job-1/cancel',
    '/api/v1/jobs/job-1/retry',
  ]);
  expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer api-token' });
  expect(fetchMock.mock.calls[2][1]).toMatchObject({
    method: 'PATCH',
    headers: { Authorization: 'Bearer api-token', 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Новая задача' }),
  });
  expect(fetchMock.mock.calls[7][1]).toMatchObject({
    method: 'POST',
    headers: { Authorization: 'Bearer api-token', 'content-type': 'application/json', 'Idempotency-Key': 'create-key' },
    body: JSON.stringify({ type: 'DECOMPOSITION' }),
  });
  expect(fetchMock.mock.calls[14][1].headers).toEqual({ Authorization: 'Bearer api-token', 'Idempotency-Key': 'retry-key' });
});

test('turns structured and malformed HTTP errors into EnterpriseApiError', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: { message: 'Конфликт версии', code: 'VERSION_CONFLICT', requestId: 'req-1', retryable: false, details: { latest: 'v2' } } }),
    })
    .mockResolvedValueOnce({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
  vi.stubGlobal('fetch', fetchMock);

  await expect(enterpriseApi.getJob('job-1')).rejects.toMatchObject({
    name: 'EnterpriseApiError', status: 409, code: 'VERSION_CONFLICT', requestId: 'req-1', retryable: false, details: { latest: 'v2' }, message: 'Конфликт версии',
  });
  await expect(enterpriseApi.getJob('job-2')).rejects.toMatchObject({ name: 'EnterpriseApiError', status: 500, message: 'HTTP 500' });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(new EnterpriseApiError('test', { status: 400 }).name).toBe('EnterpriseApiError');
});

test('downloads result content, exports versions and reports download failures', async () => {
  vi.stubGlobal('localStorage', { getItem: () => 'download-token' });
  const blob = new Blob(['версія']);
  let failing = false;
  const fetchMock = vi.fn(async (path) => {
    if (failing) return { ok: false, status: 404 };
    if (String(path).includes('/content')) return { ok: true, status: 200, text: async () => '# Требования' };
    return { ok: true, status: 200, blob: async () => blob };
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(enterpriseApi.getResultContent('job-1')).resolves.toBe('# Требования');
  await expect(enterpriseApi.exportRequirementsVersion('version/1', 'docx+print')).resolves.toBe(blob);
  await expect(enterpriseApi.downloadArtifact('artifact-1')).resolves.toBe(blob);
  expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer download-token' });
  expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/requirements/versions/version%2F1/export?format=docx%2Bprint');

  failing = true;
  await expect(enterpriseApi.getResultContent('missing')).rejects.toMatchObject({ status: 404, message: 'HTTP 404' });
  await expect(enterpriseApi.exportRequirementsVersion('missing', 'markdown')).rejects.toMatchObject({ status: 404, message: 'HTTP 404' });
  await expect(enterpriseApi.downloadArtifact('missing')).rejects.toMatchObject({ status: 404, message: 'HTTP 404' });
});

test('omits authorization headers when no access token is available', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const blob = new Blob(['без токена']);
  const fetchMock = vi.fn(async (path) => {
    if (String(path).includes('/content')) return { ok: true, status: 200, text: async () => 'content' };
    return { ok: true, status: 200, blob: async () => blob };
  });
  vi.stubGlobal('fetch', fetchMock);

  await enterpriseApi.getResultContent('job-unauthenticated');
  await enterpriseApi.exportRequirementsVersion('version-1', 'markdown');
  await enterpriseApi.downloadArtifact('artifact-1');

  expect(fetchMock.mock.calls.every(([, options]) => Object.keys(options.headers).length === 0)).toBe(true);
});

test('hashes multi-chunk files and handles successful, HTTP and network uploads', async () => {
  const bytes = new Uint8Array(1024 * 1024 + 7).fill(97);
  const expected = createHash('sha256').update(bytes).digest('hex');
  expect(await digestFile(new File([], 'empty.txt'))).toBe(createHash('sha256').digest('hex'));
  expect(await digestFile(new File([bytes], 'large.bin'))).toBe(expected);

  vi.stubGlobal('localStorage', { getItem: () => 'upload-token' });
  const responses = [
    { status: 201, responseText: JSON.stringify({ artifactId: 'artifact-1' }) },
    { status: 422, responseText: 'not-json' },
    { network: true },
  ];
  const instances = [];
  class FakeXHR {
    constructor() { this.headers = {}; this.upload = {}; instances.push(this); }
    open(method, path) { this.method = method; this.path = path; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      this.body = body;
      this.upload.onprogress?.({ lengthComputable: true, loaded: 2, total: 4 });
      const response = responses.shift();
      if (response.network) this.onerror?.();
      else { this.status = response.status; this.responseText = response.responseText; this.onload?.(); }
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
  const progress = vi.fn();

  await expect(enterpriseApi.uploadArtifact(file, progress)).resolves.toEqual({ artifactId: 'artifact-1' });
  expect(instances[0]).toMatchObject({ method: 'POST', path: '/api/v1/artifacts', body: file });
  expect(instances[0].headers).toMatchObject({ Authorization: 'Bearer upload-token', 'Content-Type': 'text/plain', 'X-Content-SHA256': '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' });
  expect(progress).toHaveBeenCalledWith(0.5);
  await expect(enterpriseApi.uploadArtifact(file)).rejects.toMatchObject({ name: 'EnterpriseApiError', status: 422, message: 'HTTP 422' });
  await expect(enterpriseApi.uploadArtifact(file)).rejects.toMatchObject({ name: 'EnterpriseApiError', retryable: true, message: 'Upload network failure' });
  await expect(enterpriseApi.uploadArtifact({ size: 1, type: '', slice: () => ({ arrayBuffer: () => Promise.reject(new Error('read failed')) }) })).rejects.toThrow('read failed');
});

test('uploads a file without a MIME type and reports zero for unknown progress', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const instances = [];
  class FakeXHR {
    constructor() { this.headers = {}; this.upload = {}; instances.push(this); }
    open(method, path) { this.method = method; this.path = path; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) {
      this.body = body;
      this.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
      this.status = 201;
      this.responseText = JSON.stringify({ artifactId: 'no-type-artifact' });
      this.onload?.();
    }
  }
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
  const progress = vi.fn();
  await expect(enterpriseApi.uploadArtifact(new File(['hello'], 'no-type.txt'), progress)).resolves.toEqual({ artifactId: 'no-type-artifact' });
  await expect(enterpriseApi.uploadArtifact(new File(['hello'], 'no-callback.txt'))).resolves.toEqual({ artifactId: 'no-type-artifact' });

  expect(progress).toHaveBeenCalledWith(0);
  expect(instances[0].headers).toMatchObject({ 'Content-Type': 'application/octet-stream' });
  expect(instances[0].headers.Authorization).toBeUndefined();
});

test('normalizes invalid events and records malformed SSE frames and cursor-only frames', async () => {
  expect(normalizeJobEvent(null)).toBeNull();
  expect(normalizeJobEvent([])).toEqual([]);
  expect(normalizeJobEvent({ data: [] })).toEqual({ data: [] });
  expect(normalizeJobEvent({ type: 'plain' })).toEqual({ type: 'plain' });

  vi.stubGlobal('localStorage', { getItem: () => null });
  const controller = new AbortController();
  const observations = [];
  const received = [];
  vi.stubGlobal('fetch', vi.fn(async (path) => {
    if (String(path).endsWith('/events')) return eventResponse('id: 2\ndata: {broken}\n\nid: 3\n\ndata: {"type":"job.progress","sequence":5}\n\nid: 4\ndata: {"type":"job.done","sequence":4}\n\n');
    return { ok: true, status: 200, json: async () => ({ status: 'RUNNING' }) };
  }));

  await subscribeJobEvents('job-1', {
    signal: controller.signal,
    onObservation: async (observation) => observations.push([observation.type, observation.cursor]),
    onEvent: async (event) => { received.push(event.sequence); if (event.sequence === 4) controller.abort(); },
  });

  expect(received).toEqual([5, 4]);
  expect(observations).toEqual([['connect', 0], ['connected', 0], ['parse-error', 2]]);
});

test('uses the generic parse error label when a parser throws a nameless error', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const controller = new AbortController();
  const observations = [];
  vi.stubGlobal('fetch', vi.fn(async (path) => {
    if (String(path).endsWith('/events')) return eventResponse('id: 1\ndata: {broken}\n\n');
    return { ok: true, status: 200, json: async () => ({ status: 'RUNNING' }) };
  }));
  const parse = vi.spyOn(JSON, 'parse').mockImplementationOnce(() => { throw {}; });
  try {
    await subscribeJobEvents('job-1', {
      signal: controller.signal,
      onObservation: async (observation) => {
        observations.push(observation);
        if (observation.type === 'parse-error') controller.abort();
      },
    });
  } finally {
    parse.mockRestore();
  }
  expect(observations).toContainEqual(expect.objectContaining({ type: 'parse-error', errorType: 'Error' }));
});

test('reports SSE HTTP disconnects, reconciles authoritative state and then stops on abort', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const originalSetTimeout = globalThis.setTimeout;
  vi.stubGlobal('setTimeout', (callback) => originalSetTimeout(callback, 0));
  const controller = new AbortController();
  const observations = [];
  vi.stubGlobal('fetch', vi.fn(async (path) => {
    if (String(path).endsWith('/events')) return { ok: false, status: 503 };
    return { ok: true, status: 200, json: async () => ({ jobId: 'job-1', status: 'RUNNING' }) };
  }));

  await subscribeJobEvents('job-1', {
    signal: controller.signal,
    onObservation: async (observation) => observations.push(observation.type),
    onEvent: async (event) => { if (event.type === 'reconcile') controller.abort(); },
  });

  expect(observations).toEqual(['connect', 'disconnected', 'reconcile']);
});

test('stops immediately when an SSE request fails after abort', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const controller = new AbortController();
  const observations = [];
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('request aborted'); }));

  await subscribeJobEvents('job-1', {
    signal: controller.signal,
    onObservation: async (observation) => {
      observations.push(observation);
      if (observation.type === 'connect') controller.abort();
    },
  });

  expect(observations).toHaveLength(1);
  expect(observations[0]).toMatchObject({ type: 'connect', cursor: 0 });
});

test('uses a safe error label for unknown SSE handler and disconnect failures', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null });
  const handlerController = new AbortController();
  const handlerObservations = [];
  vi.stubGlobal('fetch', vi.fn(async (path) => {
    if (String(path).endsWith('/events')) return eventResponse('id: 1\ndata: {"type":"job.progress"}\n\n');
    return { ok: true, status: 200, json: async () => ({ status: 'RUNNING' }) };
  }));

  await subscribeJobEvents('job-1', {
    signal: handlerController.signal,
    onObservation: async (observation) => {
      handlerObservations.push(observation);
      if (observation.type === 'event-handler-error') handlerController.abort();
    },
    onEvent: async () => { throw {}; },
  });
  expect(handlerObservations.find((item) => item.type === 'event-handler-error')).toMatchObject({ errorType: 'Error' });

  const disconnectController = new AbortController();
  const disconnectObservations = [];
  vi.stubGlobal('setTimeout', (callback) => { callback(); return 0; });
  vi.stubGlobal('fetch', vi.fn(async () => { throw {}; }));
  await subscribeJobEvents('job-2', {
    signal: disconnectController.signal,
    onObservation: async (observation) => {
      disconnectObservations.push(observation);
      if (observation.type === 'disconnected') disconnectController.abort();
    },
  });
  expect(disconnectObservations.find((item) => item.type === 'disconnected')).toMatchObject({ errorType: 'Error' });
});
