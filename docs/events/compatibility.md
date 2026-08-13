# Event compatibility policy

`job-event.v1.schema.json` is the canonical payload for Kafka topic `reqai.job-events.v1` and for the JSON `data` field of SSE notifications. `webhook-event.v1.schema.json` is the reduced terminal-event contract sent outside the application.

## Identity and ordering

- `eventId` is globally unique and is the idempotency key for every consumer.
- Kafka messages use `jobId` as the partition key.
- `sequence` increases monotonically within one job; consumers ignore an already applied sequence and reconcile gaps through the REST job endpoint.
- Delivery is at-least-once. Consumers must not infer business state from receipt count.
- `jobId` remains the sole durable identity. The user-facing route `/tasks/{jobId}` and the
  diagnostic routes beneath `/api/v1/jobs/{jobId}` do not introduce a `taskId` or task API alias.

## Versioning

- `schemaVersion` uses `major.minor` format.
- A minor revision may add optional fields or new event types without changing existing field meaning.
- Removing a field, making an optional field required, changing a type or changing field meaning requires a new major schema and Kafka topic.
- Producers publish only one major version per topic. A migration that needs dual publishing uses separate versioned topics.
- Unknown optional fields and unknown minor versions must be ignored; an unknown major version must be rejected and reported.

## Channel rules

- Kafka and SSE events must remain metadata-only and reference large results by `artifactId` or REST URL.
- SSE is advisory; clients reconcile authoritative state through `GET /api/v1/jobs/{jobId}`.
- A reconnect resumes the same job stream from `Last-Event-ID`; browser connection/reconnect and
  parse observations shown in Debug are labelled as current-tab data and are not durable events.
- Webhooks contain terminal metadata and a REST URL, never full prompt, requirement or result content.
- Webhook signatures cover the exact request bytes and timestamp; receivers deduplicate by `eventId`.
