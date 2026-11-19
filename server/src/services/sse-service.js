import { increment } from '../observability/metrics.js';
import { toJobEventEnvelope } from '../events/job-event-envelope.js';

export function streamJobEvents({ repository, tenantId, jobId, afterSequence, response, heartbeatMs, pollMs, sourceService = 'reqai-api', sourceSite = 'unknown' }) {
  let closed = false; let sequence = Number(afterSequence) || 0; let polling = false;
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); response.flushHeaders?.(); increment('reqai_sse_connections_total');
  const poll = async () => { if (closed || polling) return; polling = true; try { const events = await repository.listJobEvents({ tenantId, jobId, afterSequence: sequence }); for (const event of events) { const nextSequence = Number(event.sequence); response.write(`id: ${nextSequence}\nevent: ${event.event_type}\ndata: ${JSON.stringify(toJobEventEnvelope(event, { sourceService, sourceSite, tenantId, jobId }))}\n\n`); sequence = nextSequence; } } finally { polling = false; } };
  const pollTimer = setInterval(() => poll().catch(() => { response.write('event: error\ndata: {"retryable":true}\n\n'); }), pollMs); const heartbeat = setInterval(() => response.write(`: heartbeat ${Date.now()}\n\n`), heartbeatMs); poll();
  const close = () => { if (closed) return; closed = true; clearInterval(pollTimer); clearInterval(heartbeat); response.end(); }; response.on('close', close); return close;
}
