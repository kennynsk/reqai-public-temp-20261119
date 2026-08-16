// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';

import { normalizeJobEvent, subscribeJobEvents } from './api/enterprise-api.js';

afterEach(() => vi.unstubAllGlobals());

function eventResponse(block) {
  let delivered = false;
  return {
    ok: true,
    body: { getReader: () => ({ read: async () => delivered ? { done: true } : (delivered = true, { done: false, value: new TextEncoder().encode(block) }) }) },
  };
}

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
