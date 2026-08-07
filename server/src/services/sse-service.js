import { increment } from '../observability/metrics.js';
export function streamJobEvents({ repository, tenantId, jobId, afterSequence, response, heartbeatMs, pollMs }) {
  let closed = false; let sequence = Number(afterSequence) || 0; let polling = false;
  response.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' }); response.flushHeaders?.(); increment('reqai_sse_connections_total');
  const poll = async () => { if (closed || polling) return; polling = true; try { const events = await repository.listJobEvents({ tenantId, jobId, afterSequence: sequence }); for (const event of events) { sequence = Number(event.sequence); response.write(`id: ${sequence}\nevent: ${event.event_type}\ndata: ${JSON.stringify({ eventId: event.event_id, schemaVersion: event.schema_version, tenantId, jobId, sequence, timestamp: event.created_at, ...event.payload })}\n\n`); } } finally { polling = false; } };
  const pollTimer = setInterval(() => poll().catch(() => { response.write('event: error\ndata: {"retryable":true}\n\n'); }), pollMs); const heartbeat = setInterval(() => response.write(`: heartbeat ${Date.now()}\n\n`), heartbeatMs); poll();
  const close = () => { if (closed) return; closed = true; clearInterval(pollTimer); clearInterval(heartbeat); response.end(); }; response.on('close', close); return close;
}
