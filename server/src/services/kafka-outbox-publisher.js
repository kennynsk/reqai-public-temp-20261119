import { assertReferenceOnlyPayload } from '../events/reference-payload.js';
import { injectTrace } from '../observability/telemetry.js';
import { increment } from '../observability/metrics.js';

export function createKafkaOutboxPublisher({ repository, producer, tenantId, topic, batchSize }) {
  return { async runOnce() { const events = await repository.claimForKafka({ tenantId, limit: batchSize }); if (!events.length) return { claimed: 0, published: 0 };
    try { await producer.send({ topic, acks: -1, messages: events.map((event) => ({ key: String(event.aggregate_id), value: JSON.stringify(assertReferenceOnlyPayload({ eventId: event.event_id, schemaVersion: event.schema_version, tenantId: event.tenant_id, jobId: event.aggregate_id, sequence: Number(event.sequence), type: event.event_type, timestamp: event.created_at, ...event.payload })), headers: { eventId: String(event.event_id), schemaVersion: event.schema_version, ...injectTrace({}) } })) }); await repository.markPublished({ tenantId, eventIds: events.map((x) => x.event_id) }); increment('reqai_outbox_published_total', { topic }, events.length); return { claimed: events.length, published: events.length };
    } catch (error) { await repository.markFailed({ tenantId, eventIds: events.map((x) => x.event_id), reasonCode: 'KAFKA_PUBLISH_FAILED' }); throw error; }
  } };
}
