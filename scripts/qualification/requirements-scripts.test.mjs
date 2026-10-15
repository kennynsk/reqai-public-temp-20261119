import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { json, summarizeJob, verifyModel } from './requirements-e2e-helpers.mjs';

// Execute actual qualification entrypoints with a network-denying fetch stub and
// accelerated timers. These tests verify request contracts, never load/soak SLOs.
const ID = '00000000-0000-4000-8000-000000000001';
const hook = String.raw`
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const mode = process.env.QUAL_TEST_MODE;
const fixtures = JSON.parse(await readFile(process.env.QUAL_WORKLOAD_FIXTURES_FILE, 'utf8'));
const identities = JSON.parse(await readFile(process.env.QUAL_BEARER_TOKENS_FILE, 'utf8'));
const id = '00000000-0000-4000-8000-000000000001';
const calls = [];
let now = Date.now();
if (['load', 'soak'].includes(mode)) {
  const realTimeout = globalThis.setTimeout;
  Date.now = () => now;
  globalThis.setTimeout = (fn, ms, ...args) => {
    if (ms > 0) { now += ms; queueMicrotask(() => fn(...args)); return 0; }
    return realTimeout(fn, ms, ...args);
  };
}
const response = (value, status = 200, type = 'application/json') => new Response(typeof value === 'string' ? value : JSON.stringify(value), { status, headers: { 'content-type': type } });
const registry = { schemaVersion: 'babok-requirements.v1', groups: Object.fromEntries(['BR', 'SR', 'FR', 'NFR', 'TR', 'CON'].map(type => [type, [{ id: type + '-001', text: 'SYNTHETIC_REQUIREMENT' }]])) };
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  assert.equal(url.origin, 'https://qualification.invalid', 'real network access forbidden');
  const method = options.method || 'GET';
  const token = (options.headers?.Authorization || '').replace('Bearer ', '');
  const identity = identities.indexOf(token);
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : null;
  calls.push({ path: url.pathname, method, identity, body });
  await writeFile(process.env.QUAL_TEST_CALLS_FILE, JSON.stringify(calls));
  if (url.pathname === '/api/v1/artifacts' && method === 'POST') {
    assert.match(options.headers['Content-Type'], /^text\/plain/);
    const hash = createHash('sha256'); let size = 0;
    for await (const chunk of options.body) { assert.equal(chunk.includes(0), false); hash.update(chunk); size += chunk.byteLength; }
    assert.equal(size, 100 * 1024 * 1024);
    assert.equal(hash.digest('hex'), options.headers['X-Content-SHA256']);
    return response({ artifactId: id, size }, 201);
  }
  if (url.pathname === '/api/v1/jobs' && method === 'GET') return response({ items: [] });
  if (url.pathname === '/api/v1' && method === 'GET') return response({ capabilities: { models: ['glm-5.3-flash'] } });
  if (url.pathname === '/api/v1/decompositions' && method === 'POST') {
    if (mode === 'e2e') assert.equal(typeof body.businessContext, 'string');
    else assert.deepEqual(body, { inputArtifactId: mode === 'load' ? fixtures[identity].inputArtifactId : id });
    return response({ jobId: id }, 202);
  }
  if (/^\/api\/v1\/requirements\/versions\/[^/]+\/research$/.test(url.pathname) && method === 'POST') {
    const versionId = mode === 'load' ? fixtures[identity].versionId : mode === 'soak' ? process.env.QUAL_REQUIREMENTS_VERSION_ID : id;
    assert.equal(url.pathname, '/api/v1/requirements/versions/' + versionId + '/research');
    if (mode !== 'e2e') assert.deepEqual(body, {});
    return response({ jobId: id }, 202);
  }
  if (mode === 'e2e') {
    if (url.pathname === '/api/v1/requirements/versions' && method === 'POST') {
      assert.deepEqual(body.registry, registry); assert.equal(body.requirements, undefined);
      return response({ versionId: id }, 201);
    }
    if (url.pathname === '/api/v1/jobs/' + id) return response({ jobId: id, status: 'SUCCEEDED' });
    if (url.pathname === '/api/v1/jobs/' + id + '/result') return response({ jobId: id, outcome: 'COMPLETE', failedSteps: [], modelAttempts: [{ requestedModel: 'glm-5.3-flash', model: 'glm-5.3-flash', result: 'SUCCEEDED' }] });
    if (url.pathname === '/api/v1/jobs/' + id + '/result/content') return response(registry);
  }
  throw new Error('Unexpected qualification request: ' + method + ' ' + url.pathname);
};
`;

async function execute(mode, { invalidFixture = false } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'reqai-contract-'));
  const tokens = ['identity-a-test-token-0001', 'identity-b-test-token-0002', 'identity-c-test-token-0003'];
  const fixtures = tokens.map((_, i) => ({ inputArtifactId: `00000000-0000-4000-8000-00000000000${i + 1}`, versionId: `00000000-0000-4000-8000-00000000010${i + 1}` }));
  if (invalidFixture) delete fixtures[1].versionId;
  const paths = { hook: join(directory, 'hook.mjs'), tokens: join(directory, 'tokens.json'), fixtures: join(directory, 'fixtures.json'), calls: join(directory, 'calls.json') };
  await Promise.all([writeFile(paths.hook, hook), writeFile(paths.tokens, JSON.stringify(tokens)), writeFile(paths.fixtures, JSON.stringify(fixtures))]);
  const script = mode === 'e2e' ? 'local-e2e' : mode;
  const result = spawnSync(process.execPath, ['--import', paths.hook, new URL(`./${script}.mjs`, import.meta.url).pathname], {
    encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, QUAL_TEST_MODE: mode, QUAL_TEST_CALLS_FILE: paths.calls, QUAL_WORKLOAD_FIXTURES_FILE: paths.fixtures, QUAL_BEARER_TOKENS_FILE: paths.tokens, QUAL_API_BASE_URL: 'https://qualification.invalid', REQAI_BASE_URL: 'https://qualification.invalid', QUAL_EVIDENCE_DIR: directory, QUAL_ENVIRONMENT: 'synthetic-contract-test', QUAL_CONCURRENT_USERS: '3', QUAL_JOBS_PER_MINUTE: '3', QUAL_DURATION_MINUTES: '1', QUAL_SOAK_HOURS: '1', QUAL_SOAK_JOB_INTERVAL_MINUTES: '31', QUAL_REQUIREMENTS_VERSION_ID: fixtures[0].versionId, QUAL_DB_VERIFY_COMMAND_JSON: JSON.stringify([process.execPath, '-e', 'process.exit(0)']) },
  });
  let calls = []; try { calls = JSON.parse(await readFile(paths.calls, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  return { result, calls };
}

test('load preserves both guided operations and per-identity immutable lineage', async () => {
  const { result, calls } = await execute('load');
  assert.equal(result.status, 2, result.stderr); // Three fake identities do not qualify the real 100-user gate.
  assert.equal(JSON.parse(result.stdout).passed, false);
  const admissions = calls.filter(call => call.method === 'POST');
  assert.equal(admissions.length, 3);
  assert.deepEqual(admissions.map(call => call.identity).sort(), [0, 1, 2]);
  assert.equal(admissions.filter(call => call.path.endsWith('/research')).length, 2);
});

test('missing research fixtures fail before any workload is submitted', async () => {
  const { result, calls } = await execute('load', { invalidFixture: true });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /one inputArtifactId\/versionId pair per test identity/);
  assert.deepEqual(calls, []);
});

test('soak uploads valid text and researches a saved version rather than the upload', async () => {
  const { result, calls } = await execute('soak');
  assert.equal(result.status, 2, result.stderr); // Accelerated one-hour fixture is not real 24-hour qualification.
  assert.equal(JSON.parse(result.stdout).passed, false);
  assert.equal(calls.filter(call => call.method === 'POST' && call.path.endsWith('/research')).length, 1);
  assert.equal(calls.filter(call => call.path === '/api/v1/decompositions').length, 1);
});

test('direct E2E persists the complete current registry before version-linked research', async () => {
  const { result, calls } = await execute('e2e');
  assert.equal(result.status, 0, result.stderr);
  const saved = calls.find(call => call.path === '/api/v1/requirements/versions');
  assert.deepEqual(Object.keys(saved.body.registry.groups), ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON']);
  assert.equal(calls.filter(call => call.path.endsWith('/research')).length, 1);
  assert.doesNotMatch(result.stdout, /SYNTHETIC_REQUIREMENT/);
});

test('qualification errors and evidence omit historical free-form content', async () => {
  await assert.rejects(json(new Response(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'PRIVATE_CANARY', details: { text: 'PRIVATE_CANARY' } } }), { status: 400 })), error => error.message === 'HTTP 400: VALIDATION_ERROR');
  assert.throws(() => verifyModel({ jobId: ID, modelAttempts: [{ result: 'FAILED', text: 'PRIVATE_CANARY' }] }, 'glm'), error => !error.message.includes('PRIVATE_CANARY'));
  const summary = summarizeJob({ jobId: ID, status: 'SUCCEEDED' }, { metadata: { failedSteps: [{ stepId: 'chunk-1', stepType: 'decompose', summary: 'PRIVATE_CANARY' }], modelAttempts: [{ stepId: 'chunk-1', model: 'glm', raw: 'PRIVATE_CANARY' }] }, content: 'PRIVATE_CANARY' });
  assert.doesNotMatch(JSON.stringify(summary), /PRIVATE_CANARY/);
});

test('worker recovery refuses to run without explicit disruption authorization', () => {
  const result = spawnSync(process.execPath, [new URL('./local-restart-recovery.mjs', import.meta.url).pathname], {
    encoding: 'utf8', timeout: 5000, env: { ...process.env, QUAL_ALLOW_DISRUPTION: '' },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND is required/);
});
