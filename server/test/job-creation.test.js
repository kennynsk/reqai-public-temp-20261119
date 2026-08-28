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

test('inline input artifact and accepted job are committed in the same idempotent transaction', async () => {
  const pool = creationPool();
  const repository = new JobRepository(pool, { artifactSchema: 'reqai_artifacts' });
  await repository.createAcceptedWithInlineArtifact({
    tenantId: 'tenant-a', ownerUserId: 'user-a', idempotencyKey: 'inline-request-0001', requestHash: 'hash-inline',
    idempotencyExpiresAt: new Date('2026-01-02T00:00:00Z'),
    inlineArtifact: { content: 'business context', contentType: 'text/plain', sha256: 'a'.repeat(64), expiresAt: new Date('2026-01-02T00:00:00Z') },
    job: { id: '00000000-0000-4000-8000-000000000011', type: 'DECOMPOSITION', parentJobId: null, inputArtifactId: '00000000-0000-4000-8000-000000000012', priority: 50, configurationSnapshot: {}, createdSite: 'dc-a', deadlineAt: new Date('2026-01-01T01:00:00Z') },
    event: { id: '00000000-0000-4000-8000-000000000013', type: 'job.accepted', payload: { status: 'ACCEPTED' } },
    audit: { id: '00000000-0000-4000-8000-000000000014', action: 'job.create', actorRoles: ['user'], requestId: 'req-inline', metadata: {} },
  });
  const artifactInsert = pool.calls.find(({ sql }) => sql.includes('INSERT INTO "reqai".artifacts'));
  const contentInsert = pool.calls.find(({ sql }) => sql.includes('INSERT INTO "reqai_artifacts".artifact_content'));
  const jobInsert = pool.calls.find(({ sql }) => sql.includes('INSERT INTO "reqai".jobs'));
  assert.ok(artifactInsert && contentInsert && jobInsert);
  assert.ok(pool.calls.indexOf(artifactInsert) < pool.calls.indexOf(jobInsert));
  assert.equal(pool.calls.filter(({ sql }) => sql === 'COMMIT').length, 1);
});

test('identical inline replay returns one job without another artifact and changed hash conflicts', async () => {
  const calls = []; let existing = null;
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT i.request_hash')) return { rowCount: existing ? 1 : 0, rows: existing ? [existing] : [] };
      if (sql.includes('INSERT INTO "reqai".jobs')) {
        existing = { id: params[0], type: params[4], status: 'ACCEPTED', request_hash: 'same-hash' };
        return { rowCount: 1, rows: [{ id: params[0], type: params[4], status: 'ACCEPTED' }] };
      }
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  const repository = new JobRepository({ connect: async () => client });
  const submission = (requestHash) => repository.createAcceptedWithInlineArtifact({
    tenantId: 'tenant-a', ownerUserId: 'user-a', idempotencyKey: 'inline-replay-0001', requestHash,
    idempotencyExpiresAt: new Date('2026-01-02T00:00:00Z'),
    inlineArtifact: { content: 'context', contentType: 'text/plain', sha256: 'a'.repeat(64), expiresAt: null },
    job: { id: '00000000-0000-4000-8000-000000000021', type: 'DECOMPOSITION', parentJobId: null, inputArtifactId: '00000000-0000-4000-8000-000000000022', priority: 50, configurationSnapshot: {}, createdSite: 'dc-a', deadlineAt: new Date() },
    event: { id: '00000000-0000-4000-8000-000000000023', type: 'job.accepted', payload: {} },
    audit: { id: '00000000-0000-4000-8000-000000000024', action: 'job.create', actorRoles: ['user'], metadata: {} },
  });
  assert.equal((await submission('same-hash')).replayed, false);
  assert.equal((await submission('same-hash')).replayed, true);
  await assert.rejects(() => submission('changed-hash'), (error) => error.code === 'IDEMPOTENCY_KEY_CONFLICT');
  assert.equal(calls.filter(({ sql }) => sql.includes('INSERT INTO "reqai".artifacts')).length, 1);
  assert.equal(calls.filter(({ sql }) => sql.includes('INSERT INTO "reqai".jobs')).length, 1);
});

test('job service snapshots GC model priority and returns repository replay state', async () => {
  let input;
  const config = {
    asyncEnabled: true,
    process: { siteId: 'dc-a' },
    jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
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
  assert.equal(input.job.configurationSnapshot.reasoning, 'disabled');
  assert.equal(input.event.type, 'job.accepted');
  assert.equal(input.audit.requestId, 'req-1');
});

test('decomposition job snapshots dedicated latency experiment settings', async () => {
  let accepted;
  const service = createJobService({
    config: {
      asyncEnabled: true,
      process: { siteId: 'dc-a' },
      jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
      llm: {
        models: ['glm-5.3'], maxModelsPerStep: 1, maxAttemptsPerModel: 1, requestTimeoutMs: 300_000,
        outputTokens: { 'glm-5.3': 32000 }, decompositionOutputTokens: { 'glm-5.3': 16000 }, decompositionThinking: 'disabled',
      },
    },
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });

  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    idempotencyKey: 'latency-settings-001',
    body: { type: 'DECOMPOSITION', inputArtifactId: '00000000-0000-4000-8000-000000000099' },
  });

  assert.equal(accepted.job.configurationSnapshot.outputTokens['glm-5.3'], 16000);
  assert.equal(accepted.job.configurationSnapshot.thinking, 'disabled');
  assert.equal(accepted.job.configurationSnapshot.reasoning, 'disabled');
});

test('new production jobs snapshot the resolved immutable prompt profile', async () => {
  let accepted;
  const promptProfile = { id: 'requirements-decomposition', version: '1.0.0', manifestHash: 'a'.repeat(64), outputSchemaVersion: 'decomposition.v1', templates: { decompose: { sha256: 'b'.repeat(64) } } };
  const service = createJobService({
    config: {
      asyncEnabled: true, features: { versionedPrompts: true }, process: { siteId: 'dc-a' },
      jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
      llm: { models: ['GC-Max'], maxModelsPerStep: 1, maxAttemptsPerModel: 1, requestTimeoutMs: 300_000 },
    },
    promptProfileResolver: { resolve(input) { assert.equal(input.requestedVersion, '1.0.0'); return promptProfile; } },
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] }, idempotencyKey: 'profile-request-001',
    body: { type: 'DECOMPOSITION', inputArtifactId: '00000000-0000-4000-8000-000000000099', options: { mode: 'DECOMPOSITION', promptVersion: '1.0.0' } },
  });
  assert.equal(accepted.job.configurationSnapshot.promptProfile, promptProfile);
  assert.equal(accepted.audit.metadata.promptProfile.manifestHash, promptProfile.manifestHash);
  assert.equal(JSON.stringify(accepted.event.payload).includes('prompt'), false);
});

test('decomposition jobs snapshot authorized materials and the selected BABOK skill profile', async () => {
  let accepted;
  const babokSkillProfile = { id: 'babok-requirements-v3', version: '1.0.0', release: 'babok-requirements.v1', manifestHash: 'c'.repeat(64) };
  const materials = {
    primary: { artifactId: '00000000-0000-4000-8000-000000000099', role: 'primary', name: 'primary', sha256: 'a'.repeat(64), status: 'AVAILABLE' },
    baseline: [{ artifactId: '00000000-0000-4000-8000-000000000098', role: 'baseline', name: 'baseline', sha256: 'b'.repeat(64), status: 'AVAILABLE' }],
    references: [{ artifactId: '00000000-0000-4000-8000-000000000097', role: 'reference', name: 'reference', sha256: 'd'.repeat(64), status: 'AVAILABLE' }],
  };
  const service = createJobService({
    config: {
      asyncEnabled: true, features: { versionedPrompts: false }, process: { siteId: 'dc-a' },
      jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
      llm: { models: ['GC-Max'], maxModelsPerStep: 1, maxAttemptsPerModel: 1, requestTimeoutMs: 300_000 },
    },
    babokSkillProfile,
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] }, idempotencyKey: 'materials-profile-001',
    body: { type: 'DECOMPOSITION', inputArtifactId: materials.primary.artifactId, materials },
  });
  assert.deepEqual(accepted.job.configurationSnapshot.materials, {
    primary: materials.primary,
    baseline: { status: 'AVAILABLE', artifacts: materials.baseline },
    references: materials.references,
  });
  assert.deepEqual(accepted.job.configurationSnapshot.babokSkillProfile, babokSkillProfile);
  assert.deepEqual(accepted.audit.metadata.babokSkillProfile, babokSkillProfile);
  assert.deepEqual(accepted.audit.metadata.materials.referenceArtifactIds, [materials.references[0].artifactId]);
});

test('job service rejects every retired mode before persistence', async () => {
  let persisted = false;
  const config = {
    asyncEnabled: true,
    process: { siteId: 'dc-a' },
    jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
    llm: {
      models: ['GC-Max', 'GC-M', 'GC-Lite'], maxModelsPerStep: 3, maxAttemptsPerModel: 2,
      requestTimeoutMs: 300_000, maxConcurrency: { 'GC-Max': 1, 'GC-M': 2, 'GC-Lite': 4 },
    },
  };
  const service = createJobService({
    config,
    jobRepository: { async createAccepted() { persisted = true; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  for (const mode of ['DECOMPOSITION_WITH_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST']) {
    await assert.rejects(() => service.create({
      auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
      idempotencyKey: `retired-${mode.toLowerCase()}`,
      body: { type: mode === 'DECOMPOSITION_WITH_INSIGHTS' ? 'DECOMPOSITION' : 'RESEARCH', inputArtifactId: '00000000-0000-4000-8000-000000000099', options: { mode } },
    }), (error) => error.code === 'UNSUPPORTED_JOB_MODE');
  }
  assert.equal(persisted, false);
});

test('configured ZAI catalog snapshots a selected model with at most three fallbacks', async () => {
  let accepted;
  const availableModels = ['glm-5.3', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'];
  const service = createJobService({
    config: {
      asyncEnabled: true,
      process: { siteId: 'dc-a' },
      jobs: { decompositionDeadlineMs: 3_600_000, researchDeadlineMs: 14_400_000 },
      llm: { availableModels, models: availableModels.slice(0, 3), maxModelsPerStep: 3, maxAttemptsPerModel: 2, requestTimeoutMs: 300_000 },
    },
    jobRepository: { async createAccepted(value) { accepted = value; return { job: value.job, replayed: false }; } },
    uuid: () => '00000000-0000-4000-8000-000000000001',
  });
  await service.create({
    auth: { tenantId: 'tenant-a', userId: 'user-a', roles: ['user'] },
    idempotencyKey: 'zai-fourth-model-001',
    body: { type: 'DECOMPOSITION', inputArtifactId: '00000000-0000-4000-8000-000000000099', options: { model: 'glm-4.7-flash', reasoning: 'high' } },
  });
  assert.deepEqual(accepted.job.configurationSnapshot.configuredModels, availableModels);
  assert.deepEqual(accepted.job.configurationSnapshot.models, ['glm-4.7-flash', 'glm-5.3', 'glm-5-turbo']);
  assert.equal(accepted.job.configurationSnapshot.reasoning, 'high');
});

test('job service rejects a model outside the configured single provider policy', async () => {
  const service = createJobService({
    config: { asyncEnabled: true, llm: { models: ['GC-Max', 'GC-M', 'GC-Lite'] } },
    jobRepository: {},
  });
  await assert.rejects(
    () => service.create({
      auth: { tenantId: 'tenant-a' }, idempotencyKey: 'invalid-model-001',
      body: { type: 'DECOMPOSITION', inputArtifactId: '00000000-0000-4000-8000-000000000099', options: { model: 'other-provider-model' } },
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
      jobs: { decompositionDeadlineMs: 1, researchDeadlineMs: 2 },
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
  const originalSnapshot = Object.freeze({ featureMode: 'REQUIREMENTS_INSIGHTS', models: ['GC-Max', 'GC-M', 'GC-Lite'], maxAttemptsPerModel: 2 });
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

test('retry rejects a retained job whose mode is retired', async () => {
  const repository = {
    async findVisibleById() {
      return {
        id: '00000000-0000-4000-8000-000000000010', owner_user_id: 'user-a', status: 'FAILED', type: 'RESEARCH',
        input_artifact_id: '00000000-0000-4000-8000-000000000011', configuration_snapshot: { featureMode: 'AGENT_RESEARCH' },
      };
    },
    async createAccepted() { assert.fail('retired retry must not persist'); },
  };
  const service = createJobService({ config: { asyncEnabled: true }, jobRepository: repository });
  await assert.rejects(() => service.retry({
    auth: { tenantId: 'tenant-a', userId: 'admin-a', roles: ['tenant-admin'] },
    jobId: '00000000-0000-4000-8000-000000000010', idempotencyKey: 'retry-retired-0001',
  }), (error) => error.code === 'JOB_MODE_RETIRED');
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
