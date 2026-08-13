// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';

import { subscribeJobEvents } from './api/enterprise-api.js';

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
      return eventResponse(`id: ${streamCall}\ndata: {"jobId":"job-1","sequence":${streamCall}}\n\n`);
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
