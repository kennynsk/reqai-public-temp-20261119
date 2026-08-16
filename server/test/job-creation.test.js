import assert from 'node:assert/strict';
import test from 'node:test';

import { JobRepository } from '../src/repositories/job-repository.js';
import { createJobService } from '../src/services/job-service.js';

function creationPool() {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT i.request_hash')) return { rowCount: 0, rows: [] };
      if (sql.includes('INSERT INTO "reqai".jobs')) {
        return { rowCount: 1, rows: [{ id: params[0], type: params[4], status: 'ACCEPTED' }] };
      }
      if (sql.includes('UPDATE "reqai".jobs') && sql.includes('RETURNING sequence')) {
        return { rowCount: 1, rows: [{ sequence: 2 }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return { calls, connect: async () => client };
}

function admissionPool(counters) {
  const pool = creationPool();
  const originalConnect = pool.connect;
  pool.connect = async () => {
    const client = await originalConnect();
    const originalQuery = client.query;
    client.query = async (sql, params) => {
      if (sql.includes('AS recent_count')) {
        pool.calls.push({ sql, params });
        return { rowCount: 1, rows: [counters] };
      }
      return originalQuery(sql, params);
    };
    return client;
  };
  return pool;
}

test('accepted job, idempotency, outbox and audit are committed in one transaction', async () => {
  const pool = creationPool();
  const repository = new JobRepository(pool);
  const result = await repository.createAccepted({
    tenantId: 'tenant-a',
    ownerUserId: 'user-a',
    idempotencyKey: 'request-00000001',
    requestHash: 'hash-a',
    idempotencyExpiresAt: new Date('2026-01-02T00:00:00Z'),
    job: {
      id: '00000000-0000-4000-8000-000000000001',
      type: 'DECOMPOSITION',
      parentJobId: null,
      inputArtifactId: '00000000-0000-4000-8000-000000000002',
      priority: 50,
      configurationSnapshot: { models: ['GC-Max', 'GC-M', 'GC-Lite'] },
      createdSite: 'dc-a',
      deadlineAt: new Date('2026-01-01T01:00:00Z'),
    },
    event: { id: '00000000-0000-4000-8000-000000000003', type: 'job.accepted', payload: { status: 'ACCEPTED' } },
    audit: { id: '00000000-0000-4000-8000-000000000004', action: 'job.create', actorRoles: ['user'], requestId: 'req-1', metadata: { type: 'DECOMPOSITION' } },
  });

  assert.equal(result.job.status, 'ACCEPTED');
  assert.equal(result.replayed, false);
  assert.ok(pool.calls.some(({ sql }) => sql.includes('idempotency_keys')));
  assert.ok(pool.calls.some(({ sql }) => sql.includes('outbox_events')));
  assert.ok(pool.calls.some(({ sql }) => sql.includes('audit_events')));
  assert.ok(pool.calls.some(({ sql }) => sql === 'COMMIT'));
});

test('job service snapshots GC model priority and returns repository replay state', async () => {
  let input;
  const config = {
    asyncEnabled: true,
    process: { siteId: 'dc-a' },
    jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000, maxResearchCategories: 10 },
    llm: { models: ['GC-Max', 'GC-M', 'GC-Lite'], maxModelsPerStep: 3, maxAttemptsPerModel: 2, requestTimeoutMs: 300_000 },
  };
  const service = createJobService({
    config,
    clock: () => new Date('2026-01-01T00:00:00Z'),
    uuid: (() => {
      let value = 0;
      return () => `00000000-0000-4000-8000-${String(++value).padStart(12, '0')}`;
    })(),
    jobRepository: { async createAccepted(value) { input = value; return { job: { id: value.job.id, status: 'ACCEPTED' }, replayed: false }; } },
  });

  const result = await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    idempotencyKey: 'request-00000001',
    body: { type: 'DECOMPOSITION', inputArtifactId: '00000000-0000-4000-8000-000000000099' },
    requestId: 'req-1',
  });

  assert.equal(result.job.status, 'ACCEPTED');
  assert.deepEqual(input.job.configurationSnapshot.models, ['GC-Max', 'GC-M', 'GC-Lite']);
  assert.equal(input.event.type, 'job.accepted');
  assert.equal(input.audit.requestId, 'req-1');
});

test('job service snapshots original application mode, temperature and comparison variants', async () => {
  let accepted;
  const config = {
    asyncEnabled: true,
    process: { siteId: 'dc-a' },
    jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000, maxResearchCategories: 10 },
    llm: {
      models: ['GC-Max', 'GC-M', 'GC-Lite'], maxModelsPerStep: 3, maxAttemptsPerModel: 2,
      requestTimeoutMs: 300_000, maxConcurrency: { 'GC-Max': 1, 'GC-M': 2, 'GC-Lite': 4 },
    },
  };
  const service = createJobService({
    config,
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    idempotencyKey: 'comparison-000001',
    requestId: 'req-compare',
    body: {
      type: 'RESEARCH', inputArtifactId: '00000000-0000-4000-8000-000000000099',
      options: {
        mode: 'MODEL_COMPARE', model: 'GC-M', temperature: 0.4, compareTarget: 'RESEARCH', researchKind: 'competitors',
        variantA: { model: 'GC-Max', temperature: 0.1 }, variantB: { model: 'GC-Lite', temperature: 0.8 },
      },
    },
  });
  const snapshot = accepted.job.configurationSnapshot;
  assert.equal(snapshot.featureMode, 'MODEL_COMPARE');
  assert.deepEqual(snapshot.models, ['GC-M', 'GC-Max', 'GC-Lite']);
  assert.deepEqual(snapshot.comparison.variantA.models, ['GC-Max', 'GC-M', 'GC-Lite']);
  assert.deepEqual(snapshot.comparison.variantB.models, ['GC-Lite', 'GC-Max', 'GC-M']);
  assert.equal(snapshot.comparison.variantB.temperature, 0.8);
  assert.equal(snapshot.compareTarget, 'RESEARCH');
  assert.equal(snapshot.researchKind, 'competitors');
});

test('ZAI catalog exposes four models but a selected model snapshots at most three fallbacks', async () => {
  let accepted;
  const availableModels = ['glm-5.3', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'];
  const service = createJobService({
    config: {
      asyncEnabled: true,
      process: { siteId: 'dc-a' },
      jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000, maxResearchCategories: 10 },
      llm: { availableModels, models: availableModels.slice(0, 3), maxModelsPerStep: 3, maxAttemptsPerModel: 2, requestTimeoutMs: 300_000 },
    },
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    idempotencyKey: 'zai-fourth-model-001',
    body: { type: 'RESEARCH', inputArtifactId: '00000000-0000-4000-8000-000000000099', options: { model: 'glm-4.7-flash' } },
  });
  assert.deepEqual(accepted.job.configurationSnapshot.configuredModels, availableModels);
  assert.deepEqual(accepted.job.configurationSnapshot.models, ['glm-4.7-flash', 'glm-5.3', 'glm-5-turbo']);
});

test('job service rejects a model outside the configured single provider policy', async () => {
  const service = createJobService({
    config: { asyncEnabled: true, llm: { models: ['GC-Max', 'GC-M', 'GC-Lite'] } },
    jobRepository: {},
  });
  await assert.rejects(
    () => service.create({
      auth: { tenantId: 'tenant-a' }, idempotencyKey: 'invalid-model-001',
      body: { type: 'RESEARCH', inputArtifactId: '00000000-0000-4000-8000-000000000099', options: { model: 'other-provider-model' } },
    }),
    (error) => error.code === 'MODEL_NOT_ALLOWED',
  );
});

test('job service rejects unsafe or short idempotency keys', async () => {
  const service = createJobService({
    config: { asyncEnabled: true },
    jobRepository: {},
  });
  await assert.rejects(
    () => service.create({ auth: {}, idempotencyKey: 'short', body: {} }),
    (error) => error.code === 'INVALID_IDEMPOTENCY_KEY',
  );
});

test('linked research validates parent ownership and requirements version before acceptance', async () => {
  let validation; let accepted;
  const service = createJobService({
    config: {
      asyncEnabled: true,
      process: { siteId: 'dc-a' },
      jobs: { decompositionDeadlineMs: 1, researchDeadlineMs: 2, maxResearchCategories: 10 },
      llm: { models: ['GC-Max'], maxModelsPerStep: 1, maxAttemptsPerModel: 1, requestTimeoutMs: 1000 },
    },
    requirementsVersionService: { async validateResearchInput(value) { validation = value; } },
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000010',
  });
  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    idempotencyKey: 'linked-research-0001',
    body: { type: 'RESEARCH', parentJobId: '00000000-0000-4000-8000-000000000001', inputArtifactId: '00000000-0000-4000-8000-000000000002', options: { mode: 'REQUIREMENTS_INSIGHTS' } },
  });
  assert.equal(validation.parentJobId, '00000000-0000-4000-8000-000000000001');
  assert.equal(validation.versionId, '00000000-0000-4000-8000-000000000002');
  assert.equal(accepted.job.parentJobId, validation.parentJobId);
  assert.equal(accepted.event.payload.inputArtifactId, validation.versionId);
  assert.equal(accepted.job.configurationSnapshot.featureMode, 'REQUIREMENTS_INSIGHTS');
});

test('linked requirements research publishes an ordered discovery event on its parent stream', async () => {
  const pool = creationPool();
  const repository = new JobRepository(pool);
  await repository.createAccepted({
    tenantId: 'tenant-a', ownerUserId: 'user-a', idempotencyKey: 'linked-event-0001', requestHash: 'hash-a',
    idempotencyExpiresAt: new Date('2026-01-02T00:00:00Z'),
    job: {
      id: 'research-1', parentJobId: 'decomposition-1', type: 'RESEARCH', inputArtifactId: 'version-1', priority: 50,
      configurationSnapshot: { featureMode: 'REQUIREMENTS_INSIGHTS' }, createdSite: 'dc-a', deadlineAt: new Date('2026-01-01T01:00:00Z'),
    },
    event: { id: 'event-1', type: 'job.accepted', payload: { jobId: 'research-1', occurredAt: '2026-01-01T00:00:00.000Z' } },
    audit: { id: 'audit-1', action: 'job.create', actorRoles: ['user'], requestId: 'req-1', metadata: {} },
  });
  const linkedEvent = pool.calls.find(({ sql }) => sql.includes("'linked-research.created'"));
  assert.equal(linkedEvent.params[2], 'decomposition-1');
  assert.equal(linkedEvent.params[3], 2);
  assert.deepEqual(JSON.parse(linkedEvent.params[4]), {
    jobId: 'decomposition-1', linkedJobId: 'research-1', requirementsVersionId: 'version-1', occurredAt: '2026-01-01T00:00:00.000Z',
  });
});

test('authorized retry links the new job and preserves the original immutable snapshot', async () => {
  let created;
  const originalSnapshot = Object.freeze({ models: ['GC-Max', 'GC-M', 'GC-Lite'], maxAttemptsPerModel: 2 });
  const repository = {
    async findVisibleById() {
      return {
        id: '00000000-0000-4000-8000-000000000010', owner_user_id: 'user-a', status: 'FAILED', type: 'RESEARCH',
        input_artifact_id: '00000000-0000-4000-8000-000000000011', priority: 70, configuration_snapshot: originalSnapshot,
      };
    },
    async createAccepted(value) { created = value; return { job: { id: value.job.id, status: 'ACCEPTED' }, replayed: false }; },
  };
  const config = {
    asyncEnabled: true,
    process: { siteId: 'dc-b' },
    jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
  };
  const service = createJobService({ config, jobRepository: repository, clock: () => new Date('2026-01-01T00:00:00Z') });
  await service.retry({
    auth: { tenantId: 'tenant-a', userId: 'admin-a', roles: ['tenant-admin'] },
    jobId: '00000000-0000-4000-8000-000000000010',
    idempotencyKey: 'retry-request-0001',
    requestId: 'req-2',
  });
  assert.equal(created.job.parentJobId, '00000000-0000-4000-8000-000000000010');
  assert.equal(created.job.configurationSnapshot, originalSnapshot);
  assert.equal(created.audit.action, 'job.retry');
  assert.equal(created.event.payload.retryOf, '00000000-0000-4000-8000-000000000010');
});

test('soft backlog rejects research while preserving decomposition capacity', async () => {
  const pool = admissionPool({ recent_count: 1, user_active: 1, backlog: 1000 });
  const repository = new JobRepository(pool);
  await assert.rejects(
    () => repository.createAccepted({
      tenantId: 'tenant-a', ownerUserId: 'user-a', idempotencyKey: 'request-00000001', requestHash: 'hash-a',
      idempotencyExpiresAt: new Date('2026-01-02T00:00:00Z'),
      admission: { maxPerMinute: 30, maxActivePerUser: 5, softBacklog: 1000, hardBacklog: 5000 },
      job: { id: '00000000-0000-4000-8000-000000000001', type: 'RESEARCH' },
      event: {}, audit: {},
    }),
    (error) => error.code === 'SOFT_BACKLOG_LIMIT' && error.status === 429,
  );
  assert.equal(pool.calls.some(({ sql }) => sql.includes('INSERT INTO "reqai".jobs')), false);
});

test('hard backlog rejects every job before durable acceptance', async () => {
  const pool = admissionPool({ recent_count: 1, user_active: 1, backlog: 5000 });
  const repository = new JobRepository(pool);
  await assert.rejects(
    () => repository.createAccepted({
      tenantId: 'tenant-a', ownerUserId: 'user-a', idempotencyKey: 'request-00000001', requestHash: 'hash-a',
      idempotencyExpiresAt: new Date('2026-01-02T00:00:00Z'),
      admission: { maxPerMinute: 30, maxActivePerUser: 5, softBacklog: 1000, hardBacklog: 5000 },
      job: { id: '00000000-0000-4000-8000-000000000001', type: 'DECOMPOSITION' },
      event: {}, audit: {},
    }),
    (error) => error.code === 'HARD_BACKLOG_LIMIT' && error.status === 503,
  );
});
