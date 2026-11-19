import { assertReferenceOnlyPayload } from './reference-payload.js';

function occurredAt(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function toJobEventEnvelope(event, { sourceService = 'reqai', sourceSite = 'unknown', tenantId = event.tenant_id, jobId = event.aggregate_id } = {}) {
  const resolvedTenantId = tenantId ?? event.payload?.tenantId;
  const resolvedJobId = jobId ?? event.payload?.jobId;
  if (!resolvedTenantId || !resolvedJobId) throw new Error('Job event envelope requires tenantId and jobId');
  const data = assertReferenceOnlyPayload(event.payload || {});
  return {
    eventId: String(event.event_id),
    schemaVersion: String(event.schema_version),
    eventType: String(event.event_type),
    tenantId: String(resolvedTenantId),
    jobId: String(resolvedJobId),
    sequence: Number(event.sequence),
    occurredAt: occurredAt(event.created_at),
    source: {
      service: sourceService,
      site: sourceSite,
      instance: null,
    },
    data,
  };
}
