import assert from 'node:assert/strict';
import test from 'node:test';

import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { createRequirementsIntegrationService } from '../src/services/requirements-integration-service.js';
import { MockLlmProvider } from '../src/provider/mock-llm-provider.js';
import { ApiError } from '../src/errors/api-error.js';

const UUID = '00000000-0000-4000-8000-000000000001';

async function withServer(run, serviceOverrides = {}) {
  const config = loadConfig({ LLM_PROVIDER_MODE: 'mock' }, { loadFiles: false });
  const accepted = [];
  const jobService = { create: async (input) => { accepted.push(input); return { job: { id: UUID, status: 'ACCEPTED' }, replayed: false }; } };
  const requirementsIntegrationService = createRequirementsIntegrationService({
    config,
    artifactRepository: { validateMaterial: async () => ({ id: UUID, sha256: 'a'.repeat(64) }) },
    requirementsVersionService: { resolveResearchSource: async ({ versionId }) => ({ versionId, inputArtifactId: versionId, parentJobId: UUID, inputSha256: 'b'.repeat(64) }) },
    jobService,
    uuid: () => UUID,
  });
  const { app } = createApp({ config, services: { requirementsIntegrationService, jobService, ...serviceOverrides } });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`, accepted); } finally { await new Promise((resolve) => server.close(resolve)); }
}

async function post(base, path, body, key = 'route-key-0000001') {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
}

test('saved-version exports authorize retrieval first and keep errors free of document content', () => withServer(async (base) => {
  const response = await fetch(`${base}/api/v1/requirements/versions/${UUID}/export?format=html`);
  assert.equal(response.status, 404);
  assert.ok(!(await response.text()).includes('private document'));
}, { requirementsVersionService: { async get({ auth, versionId }) { assert.ok(auth.tenantId); assert.ok(auth.userId); assert.equal(versionId, UUID); throw new ApiError({ status: 404, code: 'REQUIREMENTS_VERSION_NOT_FOUND', message: 'Version unavailable' }); } } }));

test('saved-version export returns downloadable document without changing job-result endpoints', () => withServer(async (base) => {
  for (const format of ['markdown', 'html', 'docx']) {
    const response = await fetch(`${base}/api/v1/requirements/versions/${UUID}/export?format=${format}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-disposition'), /attachment/);
    assert.ok((await response.arrayBuffer()).byteLength > 100);
  }
  assert.equal((await fetch(`${base}/api/v1/requirements/versions/${UUID}/export?format=pdf`)).status, 400);
}, { requirementsVersionService: { async get() { return { versionId: UUID, createdAt: '2026-08-28', requirements: { business: [{ id: 'BT-1', text: 'Сохранённая цель' }], functional: [], nonfunctional: [] } }; } } }));

test('domain routes return canonical asynchronous job references', () => withServer(async (base, accepted) => {
  for (const [path, body] of [
    ['/api/v1/decompositions', { businessContext: 'Задача' }],
    [`/api/v1/requirements/versions/${UUID}/research`, {}],
  ]) {
    const response = await post(base, path, body, `route-key-${String(accepted.length + 1).padStart(7, '0')}`);
    assert.equal(response.status, 202);
    const value = await response.json();
    assert.equal(value.jobId, UUID);
    assert.equal(value.statusUrl, `/api/v1/jobs/${UUID}`);
    assert.equal(value.resultUrl, `/api/v1/jobs/${UUID}/result`);
    assert.equal(value.eventsUrl, `/api/v1/jobs/${UUID}/events`);
  }
  assert.equal(accepted.length, 2);
}));

test('removed standalone research route does not accept work', () => withServer(async (base, accepted) => {
  const response = await post(base, '/api/v1/research', { researchContext: 'Контекст' });
  assert.equal(response.status, 404);
  assert.equal(accepted.length, 0);
}));

test('capability discovery advertises only supported creation paths', () => withServer(async (base) => {
  const response = await fetch(`${base}/api/v1`);
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.deepEqual(value.capabilities.decompositionModes, ['DECOMPOSITION']);
  assert.deepEqual(value.capabilities.researchModes, ['REQUIREMENTS_INSIGHTS']);
  assert.deepEqual(value.capabilities.domainOperations, ['decomposition', 'requirements-research']);
  assert.equal(value.capabilities.researchKinds, undefined);
}));

test('generic job creation is unavailable before persistence', () => withServer(async (base, accepted) => {
  const response = await post(base, '/api/v1/jobs', {
    type: 'RESEARCH',
    inputArtifactId: UUID,
    options: { mode: 'AGENT_RESEARCH' },
  });
  assert.equal(response.status, 404);
  assert.equal(accepted.length, 0);
}));

test('operator reset cannot restart a retained retired-mode job', () => {
  let resetCalled = false;
  return withServer(async (base) => {
    const response = await post(base, `/api/v1/admin/workflows/${UUID}/reset`, {
      runId: 'run-1',
      workflowTaskFinishEventId: 42,
      reason: 'operator recovery',
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, 'JOB_MODE_RETIRED');
    assert.equal(resetCalled, false);
  }, {
    jobQueryService: { get: async () => ({ jobId: UUID, mode: 'PROMPT_TEST' }) },
    auditRepository: { record: async () => {} },
    workflowEngine: { reset: async () => { resetCalled = true; } },
  });
});

test('domain routes reject ambiguous, technical and unsupported request fields', () => withServer(async (base) => {
  const cases = [
    ['/api/v1/decompositions', {}, 'VALIDATION_ERROR'],
    ['/api/v1/decompositions', { businessContext: 'x', inputArtifactId: UUID }, 'VALIDATION_ERROR'],
    ['/api/v1/decompositions', { businessContext: 'x', withInsights: true }, 'VALIDATION_ERROR'],
    [`/api/v1/requirements/versions/${UUID}/research`, { parentJobId: UUID }, 'VALIDATION_ERROR'],
    ['/api/v1/decompositions', { businessContext: 'x', tenantId: 'other' }, 'TENANT_CONTEXT_FORBIDDEN'],
  ];
  for (const [path, body, code] of cases) {
    const response = await post(base, path, body);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, code);
  }
}));

test('oversized domain JSON returns a controlled artifact-upload error', () => withServer(async (base) => {
  const response = await post(base, '/api/v1/decompositions', { businessContext: 'x'.repeat(1024 * 1024) });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'REQUEST_BODY_TOO_LARGE');
}));

test('mock-provider domain flow accepts, completes and exposes canonical status and result', () => withServer(async (base) => {
  const provider = new MockLlmProvider({ delayMs: 0 });
  const config = loadConfig({ LLM_PROVIDER_MODE: 'mock' }, { loadFiles: false });
  const jobs = new Map(); let sequence = 10;
  const nextUuid = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const jobService = {
    async create({ body }) {
      const id = nextUuid();
      jobs.set(id, { jobId: id, status: 'ACCEPTED', outcome: null, type: body.type, mode: body.options.mode });
      setImmediate(async () => {
        const marker = body.type === 'DECOMPOSITION' ? 'Разложи бизнес-задачу на три типа требований' : 'Проведи исследование требований';
        const response = await provider.complete({ model: 'mock', messages: [{ role: 'user', content: marker }] });
        jobs.set(id, { ...jobs.get(id), status: 'SUCCEEDED', outcome: 'COMPLETE', resultArtifactId: nextUuid(), result: response.text });
      });
      return { job: { id, status: 'ACCEPTED' }, replayed: false };
    },
  };
  const operations = createRequirementsIntegrationService({
    config, jobService, uuid: nextUuid,
    artifactRepository: { validateMaterial: async () => ({ id: UUID, sha256: 'a'.repeat(64) }) },
    requirementsVersionService: { resolveResearchSource: async ({ versionId }) => ({ inputArtifactId: versionId, parentJobId: UUID, inputSha256: 'b'.repeat(64) }) },
  });
  const jobQueryService = {
    async get({ jobId }) { return jobs.get(jobId); },
    async result({ jobId }) { const job = jobs.get(jobId); return { ...job, resultContentUrl: `/api/v1/jobs/${jobId}/result/content` }; },
  };
  const { app } = createApp({ config, services: { requirementsIntegrationService: operations, jobQueryService } });
  const nested = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => nested.once('listening', resolve));
  const nestedBase = `http://127.0.0.1:${nested.address().port}`;
  try {
    const submissions = [
      ['/api/v1/decompositions', { businessContext: 'Задача' }],
      [`/api/v1/requirements/versions/${UUID}/research`, {}],
    ];
    for (const [index, [path, body]] of submissions.entries()) {
      const accepted = await (await post(nestedBase, path, body, `mock-e2e-key-${String(index).padStart(5, '0')}`)).json();
      await new Promise((resolve) => setImmediate(resolve));
      const status = await (await fetch(`${nestedBase}${accepted.statusUrl}`)).json();
      const result = await (await fetch(`${nestedBase}${accepted.resultUrl}`)).json();
      assert.equal(status.status, 'SUCCEEDED');
      assert.equal(result.jobId, accepted.jobId);
      assert.equal(result.outcome, 'COMPLETE');
    }
  } finally { await new Promise((resolve) => nested.close(resolve)); }
}));
