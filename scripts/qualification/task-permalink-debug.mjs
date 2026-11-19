import { createHash, randomUUID } from 'node:crypto';
import { json } from './requirements-e2e-helpers.mjs';

const baseUrl = (process.env.REQAI_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

async function firstSseEvent(jobId, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`${label} SSE timeout`)), 15_000);
  try {
    const response = await fetch(`${baseUrl}/api/v1/jobs/${jobId}/events`, {
      headers: { Accept: 'text/event-stream', 'Last-Event-ID': '0' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${label} SSE returned ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`${label} SSE closed before an event`);
      buffer += decoder.decode(value, { stream: true });
      const boundary = buffer.indexOf('\n\n');
      if (boundary < 0) continue;
      const block = buffer.slice(0, boundary);
      const id = block.match(/^id: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!id || !data) continue;
      await reader.cancel();
      return { id: Number(id), data: JSON.parse(data) };
    }
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

const requirements = Buffer.from('Проверить постоянную маршрутизацию и синхронизацию одной задачи.', 'utf8');
const artifact = await json(await fetch(`${baseUrl}/api/v1/artifacts`, {
  method: 'POST',
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-sha256': createHash('sha256').update(requirements).digest('hex'),
  },
  body: requirements,
}));
const accepted = await json(await fetch(`${baseUrl}/api/v1/decompositions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': `permalink-debug-${randomUUID()}` },
  body: JSON.stringify({
    inputArtifactId: artifact.artifactId,
  }),
}));
const jobId = accepted.jobId;
if (!jobId) throw new Error('Creation response has no canonical jobId');

const permalink = `${baseUrl}/tasks/${jobId}`;
const deepLink = await fetch(permalink, { headers: { Accept: 'text/html' } });
if (!deepLink.ok || !deepLink.headers.get('content-type')?.includes('text/html')) {
  throw new Error(`Frontend deep link failed: ${deepLink.status} ${deepLink.headers.get('content-type')}`);
}

const [clientAEvent, clientBEvent] = await Promise.all([
  firstSseEvent(jobId, 'client-a'),
  firstSseEvent(jobId, 'client-b'),
]);
if (clientAEvent.id !== clientBEvent.id || clientAEvent.data.jobId !== jobId || clientBEvent.data.jobId !== jobId) {
  throw new Error('Clients did not observe the same ordered job event');
}

const [clientAState, clientBState] = await Promise.all([
  json(await fetch(`${baseUrl}/api/v1/jobs/${jobId}`)),
  json(await fetch(`${baseUrl}/api/v1/jobs/${jobId}`)),
]);
if (clientAState.jobId !== jobId || clientBState.jobId !== jobId || clientAState.status !== clientBState.status) {
  throw new Error('Authorized clients did not load the same persisted state');
}

const firstTrace = await json(await fetch(`${baseUrl}/api/v1/jobs/${jobId}/trace?limit=10`));
if (firstTrace.jobId !== jobId || !Array.isArray(firstTrace.timeline)) throw new Error('Trace contract is not job-scoped');
let secondTrace = null;
if (firstTrace.nextCursor) {
  secondTrace = await json(await fetch(`${baseUrl}/api/v1/jobs/${jobId}/trace?limit=10&cursor=${encodeURIComponent(firstTrace.nextCursor)}`));
  const firstIds = new Set(firstTrace.timeline.map((entry) => entry.id));
  if (secondTrace.timeline.some((entry) => firstIds.has(entry.id))) throw new Error('Trace pagination returned duplicate entries');
}

process.stdout.write(`${JSON.stringify({
  passed: true,
  jobId,
  permalink,
  sharedEventSequence: clientAEvent.id,
  sharedStatus: clientAState.status,
  traceEntries: firstTrace.timeline.length + (secondTrace?.timeline.length || 0),
  tracePaginated: Boolean(firstTrace.nextCursor),
}, null, 2)}\n`);
