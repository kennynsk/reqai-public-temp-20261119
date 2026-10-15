import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadAll } from 'js-yaml';
import { renderKubernetes, validateKubernetes } from './kubernetes.mjs';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'reqai-k8s-'));
cpSync(new URL('../../deploy/k8s', import.meta.url), join(fixtureRoot, 'deploy/k8s'), { recursive: true });
function replaceInputs(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { replaceInputs(path); continue; }
    if (!/\.(yaml|env)$/.test(name)) continue;
    const source = readFileSync(path, 'utf8')
      .replaceAll('replace.registry.invalid', 'registry.test')
      .replaceAll(/replace-([a-z-]+)\.invalid/g, '$1.test')
      .replaceAll(/replace-([a-z-]+)/g, 'production-$1')
      .replaceAll(`sha256:${'0'.repeat(64)}`, `sha256:${'a'.repeat(64)}`)
      .replaceAll('"glm-5.3-flash":0', '"glm-5.3-flash":1')
      .replaceAll('FAILOVER_RPO_TARGET_SECONDS=0', 'FAILOVER_RPO_TARGET_SECONDS=300')
      .replaceAll('FAILOVER_RTO_TARGET_SECONDS=0', 'FAILOVER_RTO_TARGET_SECONDS=1800');
    writeFileSync(path, source);
  }
}
replaceInputs(join(fixtureRoot, 'deploy/k8s'));
const plain = renderKubernetes('production', fixtureRoot);
const enabled = renderKubernetes('production-mcp', fixtureRoot);
const docs = () => loadAll(plain);
const cm = (ds) => ds.find((d) => d.kind === 'ConfigMap' && d.data.AUTH_ENABLED);
const dep = (ds, role) => ds.find((d) => d.kind === 'Deployment' && d.spec.template.metadata.labels?.role === role);
const rolePod = (ds, role) => dep(ds, role).spec.template.spec;

test.after(() => rmSync(fixtureRoot, { recursive: true }));
test('both Kustomize profiles render deterministically, have no literal secrets and pass production policy', () => {
  assert.equal(renderKubernetes('production', fixtureRoot), plain);
  assert.equal(renderKubernetes('production-mcp', fixtureRoot), enabled);
  for (const [source, mcpEnabled] of [[plain, false], [enabled, true]]) {
    const result = validateKubernetes(loadAll(source));
    assert.deepEqual(result.errors, []);
    assert.equal(result.offlineValid, true);
    assert.equal(result.runtimeVerified, false);
    assert.equal(result.mcpEnabled, mcpEnabled);
    assert.equal(result.promptReleases.length, 2);
    assert.equal(loadAll(source).some((d) => d.kind === 'Secret'), false);
    assert.equal(source.includes('$patch'), false);
  }
});
test('repository templates intentionally fail until real target inputs are supplied', () => {
  const result = validateKubernetes(loadAll(renderKubernetes('production')));
  assert.equal(result.offlineValid, false);
  assert.ok(result.errors.some((e) => e.code === 'UNRESOLVED_INPUT'));
  assert.ok(result.errors.some((e) => e.code === 'IMMUTABLE_DIGEST_REQUIRED'));
  assert.ok(result.errors.some((e) => e.code === 'RUNTIME_CONFIG_REJECTED'));
});
for (const [name, mutate, code] of [
  ['disabled auth', (ds) => { cm(ds).data.AUTH_ENABLED = 'false'; }, 'PRODUCTION_POLICY_REQUIRED'],
  ['default tenant fallback', (ds) => { cm(ds).data.IAM_DEFAULT_TENANT_ALLOWED = 'true'; }, 'PRODUCTION_POLICY_REQUIRED'],
  ['unverified database TLS', (ds) => { cm(ds).data.DATABASE_SSL_MODE = 'require'; }, 'PRODUCTION_POLICY_REQUIRED'],
  ['plaintext Kafka', (ds) => { cm(ds).data.KAFKA_SSL_ENABLED = 'false'; }, 'PRODUCTION_POLICY_REQUIRED'],
  ['plaintext Temporal', (ds) => { cm(ds).data.TEMPORAL_TLS_ENABLED = 'false'; }, 'PRODUCTION_POLICY_REQUIRED'],
  ['unknown env key', (ds) => { cm(ds).data.TEMPORAL_TLS_CA_PATH = '/ignored'; }, 'UNKNOWN_ENV_KEY'],
  ['secret in ConfigMap', (ds) => { cm(ds).data.ZAI_API_KEY = 'synthetic-value-must-not-leak'; }, 'LITERAL_CREDENTIAL_FORBIDDEN'],
  ['dev endpoint', (ds) => { cm(ds).data.TEMPORAL_ADDRESS = 'localhost:7233'; }, 'TARGET_REQUIRED'],
  ['invalid prompt release', (ds) => { cm(ds).data.PROMPT_DECOMPOSITION_ACTIVE_VERSION = '99.0.0'; cm(ds).data.PROMPT_DECOMPOSITION_RELEASED_VERSIONS = '99.0.0'; }, 'MISSING_OR_INVALID_BUNDLE'],
  ['missing trust mount', (ds) => { rolePod(ds, 'api').containers[0].volumeMounts = []; }, 'MOUNTED_TRUST_REQUIRED'],
  ['bulk secret import', (ds) => { rolePod(ds, 'event-worker').containers[0].envFrom.push({ secretRef: { name: 'reqai-zai' } }); }, 'BULK_SECRET_IMPORT_FORBIDDEN'],
  ['LLM key on maintenance', (ds) => { rolePod(ds, 'maintenance-worker').containers[0].env.push({ name: 'ZAI_API_KEY', valueFrom: { secretKeyRef: { name: 'reqai-zai', key: 'api-key' } } }); }, 'ROLE_SCOPE_MISMATCH'],
  ['wrong secret key', (ds) => { rolePod(ds, 'api').containers[0].env.find((e) => e.name === 'ZAI_API_KEY').valueFrom.secretKeyRef.key = 'wrong'; }, 'UNAPPROVED_SECRET_REFERENCE'],
  ['mutable image', (ds) => { rolePod(ds, 'api').containers[0].image = 'registry.test/backend:latest'; }, 'IMMUTABLE_DIGEST_REQUIRED'],
  ['mixed backend release', (ds) => { rolePod(ds, 'event-worker').containers[0].image = `registry.test/backend@sha256:${'b'.repeat(64)}`; }, 'COORDINATED_DIGEST_REQUIRED'],
  ['API service token', (ds) => { rolePod(ds, 'api').automountServiceAccountToken = true; }, 'TOKEN_MOUNT_FORBIDDEN'],
  ['writable root', (ds) => { rolePod(ds, 'api').containers[0].securityContext.readOnlyRootFilesystem = false; }, 'READ_ONLY_REQUIRED'],
  ['Nginx PID path', (ds) => { rolePod(ds, 'frontend').containers[0].volumeMounts = []; }, 'WRITABLE_VOLUME_REQUIRED'],
  ['short worker drain', (ds) => { rolePod(ds, 'research-worker').terminationGracePeriodSeconds = 30; }, 'DRAIN_WINDOW_TOO_SHORT'],
  ['host volume', (ds) => { rolePod(ds, 'api').volumes.push({ name: 'dev', hostPath: { path: '/dev-data' } }); }, 'NO_DEV_OR_HOST_STORAGE'],
  ['provider secret volume on maintenance', (ds) => { rolePod(ds, 'maintenance-worker').volumes.push({ name: 'provider', secret: { secretName: 'reqai-zai' } }); }, 'ROLE_SCOPE_MISMATCH'],
  ['missing IAM mapping', (ds) => { delete cm(ds).data.IAM_ROLE_MAPPING_JSON; }, 'TARGET_REQUIRED'],
  ['credentials in endpoint', (ds) => { cm(ds).data.IAM_JWKS_URI = 'https://user:synthetic-value-must-not-leak@iam.test/jwks'; }, 'CLEAN_HTTPS_URL_REQUIRED'],
  ['credentials in Kafka address', (ds) => { cm(ds).data.KAFKA_BROKERS = 'user:synthetic-value-must-not-leak@kafka.test:9093'; }, 'HOST_PORT_REQUIRED'],
  ['same database schemas', (ds) => { cm(ds).data.DATABASE_ARTIFACT_SCHEMA = cm(ds).data.DATABASE_SCHEMA; }, 'ISOLATED_SCHEMAS_REQUIRED'],
  ['missing workflow build ID', (ds) => { delete cm(ds).data.TEMPORAL_WORKFLOW_BUILD_ID; }, 'TARGET_REQUIRED'],
  ['missing provider quota', (ds) => { delete cm(ds).data.LLM_MODEL_RPM_JSON; }, 'OWNER_VALUE_REQUIRED'],
  ['missing RPO', (ds) => { delete cm(ds).data.FAILOVER_RPO_TARGET_SECONDS; }, 'OWNER_VALUE_REQUIRED'],
  ['impossible disruption budget', (ds) => { dep(ds, 'api').spec.replicas = 1; }, 'DISRUPTION_MUST_BE_POSSIBLE'],
  ['mismatched certificate host', (ds) => { ds.find((d) => d.kind === 'Ingress').spec.tls[0].hosts = ['other.test']; }, 'HOST_CERTIFICATE_REQUIRED'],
  ['migration auto-run', (ds) => { ds.find((d) => d.kind === 'Job').spec.suspend = false; }, 'MANUAL_CONTROL_REQUIRED'],
  ['missing API', (ds) => { ds.splice(ds.indexOf(dep(ds, 'api')), 1); }, 'EXACTLY_ONE_REQUIRED'],
  ['public MCP while disabled', (ds) => { ds.push(loadAll(enabled).find((d) => d.kind === 'Ingress' && d.metadata.name === 'reqai-mcp-gateway')); }, 'PUBLIC_ROUTE_FORBIDDEN'],
]) {
  test(`rejects ${name} without disclosing values`, () => {
    const ds = docs(); mutate(ds);
    const result = validateKubernetes(ds);
    assert.equal(result.offlineValid, false);
    assert.ok(result.errors.some((e) => e.code === code), JSON.stringify(result.errors));
    assert.equal(JSON.stringify(result.errors).includes('synthetic-value-must-not-leak'), false);
  });
}
for (const [name, mutate, code] of [
  ['stale MCP schema', (ds) => { ds.find((d) => d.kind === 'ConfigMap' && d.data.MCP_ENABLED).data.MCP_TOOL_SCHEMA_VERSION = '2.1.0'; }, 'PRODUCTION_SCHEMA_REQUIRED'],
  ['wrong allowed host', (ds) => { ds.find((d) => d.kind === 'ConfigMap' && d.data.MCP_ENABLED).data.MCP_ALLOWED_HOSTS = 'other.test'; }, 'HOST_ROUTE_MISMATCH'],
  ['broken MCP API selector', (ds) => { ds.find((d) => d.kind === 'NetworkPolicy' && d.metadata.name === 'reqai-mcp-gateway').spec.egress = []; }, 'API_SELECTOR_MISMATCH'],
]) test(`rejects ${name}`, () => {
  const ds = loadAll(enabled); mutate(ds);
  const result = validateKubernetes(ds);
  assert.equal(result.offlineValid, false);
  assert.ok(result.errors.some((e) => e.code === code));
});

test('runtime values are explicit and generated configuration references track changes', () => {
  const envFile = join(fixtureRoot, 'deploy/k8s/production/runtime.env');
  const before = readFileSync(envFile, 'utf8');
  const oldConfig = cm(docs()).metadata.name;
  try {
    writeFileSync(envFile, before.replace('DATABASE_POOL_MAX=20', 'DATABASE_POOL_MAX=21'));
    const updated = loadAll(renderKubernetes('production', fixtureRoot));
    const newConfig = cm(updated).metadata.name;
    assert.notEqual(oldConfig, newConfig);
    assert.ok(rolePod(updated, 'api').containers[0].envFrom.some((e) => e.configMapRef?.name === newConfig));
    assert.equal(validateKubernetes(updated).offlineValid, true);
  } finally { writeFileSync(envFile, before); }
});

test('render and validation ignore .env.dev and process service credentials', () => {
  const keys = ['AUTH_ENABLED', 'DATABASE_URL', 'ZAI_API_KEY'];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    for (const key of keys) process.env[key] = 'synthetic-value-must-not-leak';
    writeFileSync(join(fixtureRoot, '.env.dev'), 'AUTH_ENABLED=false\nZAI_API_KEY=synthetic-value-must-not-leak\n');
    const rendered = renderKubernetes('production', fixtureRoot);
    assert.equal(rendered, plain);
    assert.equal(rendered.includes('synthetic-value-must-not-leak'), false);
    assert.equal(validateKubernetes(loadAll(rendered)).offlineValid, true);
    assert.throws(() => renderKubernetes('other'), /INVALID_PROFILE/);
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
  }
});

test('CLI exports a qualified synthetic release, keeps migrations suspended and refuses overwrites', () => {
  mkdirSync(join(fixtureRoot, 'scripts/qualification'), { recursive: true });
  cpSync(new URL('./kubernetes.mjs', import.meta.url), join(fixtureRoot, 'scripts/qualification/kubernetes.mjs'));
  for (const name of ['server', 'mcp-gateway', 'node_modules']) symlinkSync(new URL(`../../${name}`, import.meta.url), join(fixtureRoot, name));
  const target = join(fixtureRoot, 'release');
  const args = [join(fixtureRoot, 'scripts/qualification/kubernetes.mjs'), 'production', '--out-dir', target];
  const first = spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(first.status, 0, first.stderr + first.stdout);
  assert.equal(JSON.parse(first.stdout).runtimeVerified, false);
  const bootstrap = loadAll(readFileSync(join(target, 'bootstrap.yaml'), 'utf8'));
  const workloads = loadAll(readFileSync(join(target, 'workloads.yaml'), 'utf8'));
  const release = readFileSync(join(target, 'release.json'), 'utf8');
  assert.equal(bootstrap.find((d) => d.kind === 'Job').spec.suspend, true);
  assert.equal(workloads.some((d) => d.kind === 'Job'), false);
  assert.equal(JSON.parse(release).renderedSha256, createHash('sha256').update(plain).digest('hex'));
  assert.equal(release.includes('offline-synthetic-key'), false);
  const second = spawnSync(process.execPath, args, { encoding: 'utf8', env: { PATH: process.env.PATH } });
  assert.equal(second.status, 1);
  assert.equal(readFileSync(join(target, 'release.json'), 'utf8'), release);
});
