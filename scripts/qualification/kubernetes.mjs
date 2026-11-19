// Offline only: kubectl kustomize does not contact a Kubernetes API server.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dump, loadAll } from 'js-yaml';
import { loadConfig } from '../../server/src/config/env.js';
import { loadConfig as loadMcpConfig } from '../../mcp-gateway/src/config.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../../server/src/prompts/prompt-catalog.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const unresolved = /replace[-_.]|\bTBD\b|example\.(invalid|com)|\.invalid\b|\$\{|<[^>]+>/i;
const development = /localhost|127\.0\.0\.1|0\.0\.0\.0|(?:^|[./_-])(dev|development|local)(?:$|[./_:-])/i;
const safeKey = (s) => /^[A-Z][A-Z0-9_]*$/.test(s) ? s : 'invalid-key';
const expectedRoles = ['api', 'frontend', 'decomposition-worker', 'research-worker', 'event-worker', 'maintenance-worker'];
const roleCredentials = {
  api: ['DATABASE_URL', 'ZAI_API_KEY'], frontend: [],
  'decomposition-worker': ['DATABASE_URL', 'ZAI_API_KEY'],
  'research-worker': ['DATABASE_URL', 'ZAI_API_KEY'],
  'event-worker': ['DATABASE_URL', 'KAFKA_USERNAME', 'KAFKA_PASSWORD'],
  'maintenance-worker': ['DATABASE_URL'], gateway: ['MCP_READINESS_BEARER_TOKEN'],
  'schema-migration': ['DATABASE_URL'],
};
const secretKeys = {
  DATABASE_URL: ['reqai-runtime-database', 'url'], ZAI_API_KEY: ['reqai-zai', 'api-key'],
  KAFKA_USERNAME: ['reqai-kafka', 'username'], KAFKA_PASSWORD: ['reqai-kafka', 'password'],
  MCP_READINESS_BEARER_TOKEN: ['reqai-mcp-readiness', 'bearer-token'],
};
const backendSource = readFileSync(new URL('../../server/src/config/env.js', import.meta.url), 'utf8');
const backendKeys = new Set([...backendSource.matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map((m) => m[1]));
for (const prefix of ['PROMPT_DECOMPOSITION', 'PROMPT_REQUIREMENTS_INSIGHTS', 'SKILL_BABOK_REQUIREMENTS']) {
  for (const suffix of ['ACTIVE_VERSION', 'RELEASED_VERSIONS']) backendKeys.add(`${prefix}_${suffix}`);
}
backendKeys.add('NODE_ENV'); backendKeys.add('NODE_EXTRA_CA_CERTS');
const gatewaySource = readFileSync(new URL('../../mcp-gateway/src/config.js', import.meta.url), 'utf8');
const gatewayKeys = new Set([...gatewaySource.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));

export function validateKubernetes(docs) {
  const errors = [];
  const check = (ok, field, code) => { if (!ok) errors.push({ field, code }); };
  const find = (kind, name) => docs.find((d) => d.kind === kind && d.metadata?.name === name);
  const maps = new Map(docs.filter((d) => d.kind === 'ConfigMap').map((d) => [d.metadata.name, d.data || {}]));
  const deployments = docs.filter((d) => d.kind === 'Deployment');
  const namespaces = docs.filter((d) => d.kind === 'Namespace');
  check(namespaces.length === 1, 'namespace', 'EXACTLY_ONE_REQUIRED');
  const namespace = namespaces[0]?.metadata?.name;
  check(namespace && !unresolved.test(namespace) && !development.test(namespace), 'namespace', 'TARGET_REQUIRED');
  for (const d of docs) {
    check(d.apiVersion && d.metadata?.name, 'manifest', 'MISSING_IDENTITY');
    check(d.kind === 'Namespace' || d.metadata?.namespace === namespace, 'namespace', 'NAMESPACE_MISMATCH');
    check(!['Secret', 'PersistentVolume', 'PersistentVolumeClaim', 'StatefulSet', 'LoadBalancer'].includes(d.kind), 'resources', 'EXTERNAL_STORAGE_AND_SECRETS_ONLY');
    check(!unresolved.test(JSON.stringify(d)), `${d.kind}.configuration`, 'UNRESOLVED_INPUT');
    if (d.kind === 'Service') check(!d.spec.type || d.spec.type === 'ClusterIP', 'Service.type', 'INTERNAL_ONLY');
  }
  for (const role of expectedRoles) check(deployments.filter((d) => d.spec.template.metadata.labels?.role === role).length === 1, role, 'EXACTLY_ONE_REQUIRED');
  const ingress = find('Ingress', 'reqai');
  check(Boolean(ingress), 'Ingress.reqai', 'REQUIRED');
  for (const d of docs.filter((d) => d.kind === 'Ingress')) {
    check(d.spec.ingressClassName && !unresolved.test(d.spec.ingressClassName), 'Ingress.ingressClassName', 'TARGET_REQUIRED');
    check(d.metadata.annotations?.['nginx.ingress.kubernetes.io/ssl-redirect'] === 'true', 'Ingress.https', 'REQUIRED');
    for (const rule of d.spec.rules || []) {
      check(rule.host && !development.test(rule.host) && d.spec.tls?.some((tls) => tls.hosts?.includes(rule.host) && tls.secretName), 'Ingress.tls', 'HOST_CERTIFICATE_REQUIRED');
    }
  }
  const paths = ingress?.spec.rules?.[0]?.http?.paths || [];
  check(paths.some((p) => p.path === '/api' && p.pathType === 'Prefix' && p.backend.service.name === 'reqai-api'), 'Ingress.api', 'CANONICAL_ROUTE_REQUIRED');
  check(paths.some((p) => p.path === '/' && p.pathType === 'Prefix' && p.backend.service.name === 'reqai-frontend'), 'Ingress.frontend', 'SPA_ROUTE_REQUIRED');

  let runtimeConfig; let gatewayConfig; let runtimeEnv;
  const workloads = [...deployments, ...docs.filter((d) => d.kind === 'Job')];
  for (const d of workloads) {
    const pod = d.spec.template.spec;
    const role = d.spec.template.metadata.labels?.role || (d.metadata.name === 'reqai-mcp-gateway' ? 'gateway' : 'unknown');
    const sa = find('ServiceAccount', pod.serviceAccountName);
    check(pod.automountServiceAccountToken === false && sa?.automountServiceAccountToken === false, `${role}.serviceAccount`, 'TOKEN_MOUNT_FORBIDDEN');
    check(pod.securityContext?.runAsNonRoot === true && pod.securityContext?.runAsUser > 0 && pod.securityContext?.seccompProfile?.type === 'RuntimeDefault', `${role}.securityContext`, 'NON_ROOT_REQUIRED');
    check(!(pod.volumes || []).some((v) => v.hostPath || v.persistentVolumeClaim), `${role}.volumes`, 'NO_DEV_OR_HOST_STORAGE');
    const allowedVolumes = ['frontend', 'gateway'].includes(role) ? []
      : ['maintenance-worker', 'schema-migration'].includes(role) ? ['reqai-trust']
        : ['reqai-trust', 'reqai-temporal-client'];
    check((pod.volumes || []).every((v) => !v.secret || allowedVolumes.includes(v.secret.secretName)), `${role}.volumeSecrets`, 'ROLE_SCOPE_MISMATCH');
    for (const c of pod.containers) {
      check(/@sha256:[a-f0-9]{64}$/.test(c.image) && !/@sha256:0{64}$/.test(c.image), `${role}.image`, 'IMMUTABLE_DIGEST_REQUIRED');
      check(c.securityContext?.readOnlyRootFilesystem === true && c.securityContext?.allowPrivilegeEscalation === false && c.securityContext?.capabilities?.drop?.includes('ALL'), `${role}.containerSecurity`, 'READ_ONLY_REQUIRED');
      check(c.resources?.requests?.cpu && c.resources?.requests?.memory && c.resources?.limits?.cpu && c.resources?.limits?.memory, `${role}.resources`, 'BOUNDS_REQUIRED');
      if (d.kind === 'Deployment') {
        check(c.readinessProbe?.httpGet && c.livenessProbe?.httpGet, `${role}.probes`, 'REQUIRED');
        check(role === 'gateway' || d.spec.replicas >= 1, `${role}.replicas`, 'AT_LEAST_ONE');
        const grace = role.includes('worker') ? 660 : role === 'api' ? 45 : 30;
        check(pod.terminationGracePeriodSeconds >= grace, `${role}.terminationGrace`, 'DRAIN_WINDOW_TOO_SHORT');
      }
      const env = {};
      for (const source of c.envFrom || []) {
        check(!source.secretRef, `${role}.envFrom`, 'BULK_SECRET_IMPORT_FORBIDDEN');
        const values = maps.get(source.configMapRef?.name);
        check(Boolean(values), `${role}.configMapRef`, 'MISSING_CONFIG_MAP');
        Object.assign(env, values);
      }
      const credentials = [];
      for (const entry of c.env || []) {
        if (entry.value !== undefined) env[entry.name] = entry.value;
        else {
          const ref = entry.valueFrom?.secretKeyRef;
          check(Boolean(ref), `${role}.${safeKey(entry.name)}`, 'EXPLICIT_SECRET_KEY_REQUIRED');
          credentials.push(entry.name);
          const expected = role === 'schema-migration' ? ['reqai-migration-database', 'url'] : secretKeys[entry.name];
          check(expected && ref?.name === expected[0] && ref?.key === expected[1] && !ref?.optional, `${role}.${safeKey(entry.name)}`, 'UNAPPROVED_SECRET_REFERENCE');
        }
      }
      check(JSON.stringify([...credentials].sort()) === JSON.stringify([...(roleCredentials[role] || [])].sort()), `${role}.credentials`, 'ROLE_SCOPE_MISMATCH');
      const allowedKeys = role === 'gateway' ? gatewayKeys : backendKeys;
      for (const key of Object.keys(env)) {
        check(allowedKeys.has(key), `${role}.${safeKey(key)}`, 'UNKNOWN_ENV_KEY');
        check(!roleCredentials.api.includes(key) && !['KAFKA_PASSWORD', 'KAFKA_USERNAME', 'MCP_READINESS_BEARER_TOKEN', 'IAM_CLIENT_SECRET', 'WEBHOOK_SECRET'].includes(key), `${role}.${safeKey(key)}`, 'LITERAL_CREDENTIAL_FORBIDDEN');
      }
      if (role === 'frontend') {
        check(Object.keys(env).length === 0 && credentials.length === 0, 'frontend.env', 'NO_SERVER_CONFIG');
        check(pod.securityContext.runAsUser === 101 && pod.securityContext.fsGroup === 101, 'frontend.uid', 'NGINX_UID_REQUIRED');
        for (const path of ['/var/cache/nginx', '/var/run']) check((c.volumeMounts || []).some((m) => m.mountPath === path && pod.volumes.some((v) => v.name === m.name && v.emptyDir)), `frontend.${path}`, 'WRITABLE_VOLUME_REQUIRED');
        continue;
      }
      if (role === 'gateway') {
        try { gatewayConfig = loadMcpConfig({ ...env, MCP_READINESS_BEARER_TOKEN: 'offline-synthetic-token' }); }
        catch { check(false, 'gateway.config', 'RUNTIME_CONFIG_REJECTED'); }
        check(env.NODE_ENV === 'production' && env.MCP_ENVIRONMENT === 'production' && env.MCP_TOOL_SCHEMA_VERSION === '3.0.0', 'gateway.policy', 'PRODUCTION_SCHEMA_REQUIRED');
        continue;
      }
      for (const [key, value] of Object.entries({ NODE_ENV: 'production', ASYNC_PLATFORM_ENABLED: 'true', AUTH_ENABLED: 'true', IAM_DEFAULT_TENANT_ALLOWED: 'false', DATABASE_SSL_MODE: 'verify-full', KAFKA_SSL_ENABLED: 'true', TEMPORAL_TLS_ENABLED: 'true', DIAGNOSTIC_CAPTURE_PROTECTED: 'false', VERSIONED_PROMPTS_ENABLED: 'true', WEBHOOK_ENABLED: 'false' })) {
        check(env[key] === value, `${role}.${key}`, 'PRODUCTION_POLICY_REQUIRED');
      }
      check(env.LLM_PROVIDER_MODE === 'zai' && env.LOG_LEVEL !== 'debug', `${role}.provider`, 'ZAI_PRODUCTION_PROFILE_REQUIRED');
      for (const key of ['IAM_ISSUER', 'IAM_AUDIENCE', 'IAM_JWKS_URI', 'IAM_ROLE_MAPPING_JSON', 'IAM_TENANT_CLAIM', 'IAM_USER_ID_CLAIM', 'IAM_ROLES_CLAIM', 'TEMPORAL_ADDRESS', 'TEMPORAL_NAMESPACE', 'KAFKA_BROKERS', 'KAFKA_JOB_EVENTS_TOPIC', 'KAFKA_WEBHOOK_DLQ_TOPIC', 'DEPLOYMENT_SITE_ID', 'DEFAULT_TENANT_ID']) {
        check(env[key] && !development.test(env[key]), `${role}.${key}`, 'TARGET_REQUIRED');
      }
      for (const key of ['IAM_ISSUER', 'IAM_JWKS_URI', 'ZAI_BASE_URL']) {
        try {
          const url = new URL(env[key]);
          check(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash, `${role}.${key}`, 'CLEAN_HTTPS_URL_REQUIRED');
        } catch { check(false, `${role}.${key}`, 'CLEAN_HTTPS_URL_REQUIRED'); }
      }
      for (const key of ['TEMPORAL_TLS_SERVER_NAME', 'TEMPORAL_WORKFLOW_BUILD_ID']) check(Boolean(env[key]), `${role}.${key}`, 'TARGET_REQUIRED');
      for (const key of ['LLM_MODEL_RPM_JSON', 'LLM_MODEL_TPM_JSON', 'LLM_MODEL_MAX_CONCURRENCY_JSON', 'FAILOVER_RPO_TARGET_SECONDS', 'FAILOVER_RTO_TARGET_SECONDS']) check(Boolean(env[key]), `${role}.${key}`, 'OWNER_VALUE_REQUIRED');
      for (const key of ['TEMPORAL_ADDRESS', 'KAFKA_BROKERS']) check(String(env[key] || '').split(',').every((address) => /^(?:[a-z0-9.-]+|\[[0-9a-f:]+\]):[1-9]\d{0,4}$/i.test(address) && Number(address.slice(address.lastIndexOf(':') + 1)) <= 65535), `${role}.${key}`, 'HOST_PORT_REQUIRED');
      check(env.DATABASE_SCHEMA !== env.DATABASE_ARTIFACT_SCHEMA && [env.DATABASE_SCHEMA, env.DATABASE_ARTIFACT_SCHEMA].every((s) => s && s !== 'public' && !s.startsWith('pg_')), `${role}.databaseSchemas`, 'ISOLATED_SCHEMAS_REQUIRED');
      check(env.TEMPORAL_TASK_QUEUE_DECOMPOSITION === 'requirements-decomposition' && env.TEMPORAL_TASK_QUEUE_RESEARCH === 'requirements-research', `${role}.taskQueues`, 'CANONICAL_QUEUES_REQUIRED');
      for (const key of ['DATABASE_CA_CERT_PATH', 'NODE_EXTRA_CA_CERTS', ...(role === 'maintenance-worker' || role === 'schema-migration' ? [] : ['TEMPORAL_TLS_CA_CERT_PATH', 'TEMPORAL_TLS_CERT_PATH', 'TEMPORAL_TLS_KEY_PATH'])]) {
        check(env[key] && (c.volumeMounts || []).some((m) => env[key].startsWith(`${m.mountPath}/`) && m.readOnly && pod.volumes.some((v) => v.name === m.name && v.secret?.items?.some((item) => `${m.mountPath}/${item.path}` === env[key]))), `${role}.${key}`, 'MOUNTED_TRUST_REQUIRED');
      }
      try {
        const config = loadConfig({ ...env, DATABASE_URL: 'postgresql://offline:synthetic@db.test/reqai', ZAI_API_KEY: 'offline-synthetic-key' }, { loadFiles: false });
        if (role === 'api') { runtimeConfig = config; runtimeEnv = env; }
      } catch { check(false, `${role}.config`, 'RUNTIME_CONFIG_REJECTED'); }
    }
  }
  const mcp = find('Deployment', 'reqai-mcp-gateway');
  check(Boolean(mcp), 'gateway', 'REQUIRED');
  const mcpIngress = find('Ingress', 'reqai-mcp-gateway');
  if (gatewayConfig?.enabled) {
    check(mcp?.spec.replicas >= 1 && Boolean(mcpIngress), 'gateway.enabled', 'WORKLOAD_AND_HTTPS_ROUTE_REQUIRED');
    check(mcpIngress?.spec.rules?.some((r) => `https://${r.host}/mcp` === gatewayConfig.publicEndpoint && gatewayConfig.allowedHosts.includes(r.host)), 'gateway.endpoint', 'HOST_ROUTE_MISMATCH');
  } else check(mcp?.spec.replicas === 0 && !mcpIngress, 'gateway.disabled', 'PUBLIC_ROUTE_FORBIDDEN');
  const policy = find('NetworkPolicy', 'reqai-mcp-gateway');
  check(policy?.spec.egress?.some((e) => e.to?.some((to) => to.podSelector?.matchLabels?.app === 'reqai' && to.podSelector.matchLabels.role === 'api') && e.ports?.some((p) => p.port === 5178)), 'gateway.networkPolicy', 'API_SELECTOR_MISMATCH');
  const job = find('Job', 'reqai-schema-migration');
  check(job?.spec.suspend === true && job?.spec.backoffLimit === 0, 'migrationJob', 'MANUAL_CONTROL_REQUIRED');
  check(job?.spec.template.spec.containers[0]?.command?.join(' ') === 'node server/scripts/migrate.mjs', 'migrationJob.command', 'RELEASED_MIGRATIONS_REQUIRED');
  const backendImages = workloads.filter((d) => !['reqai-frontend', 'reqai-mcp-gateway'].includes(d.metadata.name)).flatMap((d) => d.spec.template.spec.containers.map((c) => c.image));
  check(new Set(backendImages).size === 1, 'release.backendImage', 'COORDINATED_DIGEST_REQUIRED');
  for (const budget of docs.filter((d) => d.kind === 'PodDisruptionBudget')) {
    const match = deployments.find((d) => Object.entries(budget.spec.selector.matchLabels).every(([key, value]) => d.spec.template.metadata.labels[key] === value));
    check(match && Number(budget.spec.minAvailable) >= 0 && Number(budget.spec.minAvailable) < match.spec.replicas, 'PodDisruptionBudget.capacity', 'DISRUPTION_MUST_BE_POSSIBLE');
  }
  const promptReleases = [];
  if (runtimeConfig) {
    try {
      const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
      for (const [id, release] of Object.entries(runtimeConfig.prompts.policy)) {
        for (const version of release.released) {
          const bundle = catalog.get(id, version);
          promptReleases.push({ id, version, active: release.active === version, manifestHash: bundle.manifestHash, outputSchemaVersion: bundle.outputSchemaVersion });
        }
      }
    } catch { check(false, 'release.prompts', 'MISSING_OR_INVALID_BUNDLE'); }
  }
  return { offlineValid: errors.length === 0, errors, runtimeVerified: false, resources: docs.length, namespace, promptReleases,
    images: [...new Set(workloads.flatMap((d) => d.spec.template.spec.containers.map((c) => c.image)))],
    buildId: runtimeEnv?.TEMPORAL_WORKFLOW_BUILD_ID, mcpEnabled: gatewayConfig?.enabled || false };
}

export function renderKubernetes(profile, cwd = root) {
  if (!['production', 'production-mcp'].includes(profile)) throw new Error('INVALID_PROFILE');
  const rendered = spawnSync('kubectl', ['kustomize', `deploy/k8s/${profile}`], { cwd, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { PATH: process.env.PATH } });
  if (rendered.error || rendered.status !== 0) throw new Error('KUSTOMIZE_RENDER_FAILED');
  return rendered.stdout;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const profile = args.shift() || 'production';
    let outDir;
    if (args.length) {
      if (args.length !== 2 || args[0] !== '--out-dir') throw new Error('USAGE: kubernetes.mjs [production|production-mcp] [--out-dir NEW_DIRECTORY]');
      outDir = resolve(args[1]);
    }
    const rendered = renderKubernetes(profile);
    const docs = loadAll(rendered);
    const result = validateKubernetes(docs);
    if (result.offlineValid && outDir) {
      // An existing release directory is never overwritten.
      mkdirSync(outDir, { recursive: false });
      const yaml = (ds) => ds.map((d) => dump(d, { noRefs: true, lineWidth: 110 })).join('---\n');
      writeFileSync(resolve(outDir, 'bootstrap.yaml'), yaml(docs.filter((d) => ['Namespace', 'ServiceAccount', 'ConfigMap', 'Job'].includes(d.kind))), { flag: 'wx' });
      writeFileSync(resolve(outDir, 'workloads.yaml'), yaml(docs.filter((d) => d.kind !== 'Job')), { flag: 'wx' });
      writeFileSync(resolve(outDir, 'release.json'), `${JSON.stringify({ ...result, renderedSha256: sha256(rendered) }, null, 2)}\n`, { flag: 'wx' });
    }
    // Only error codes and field names are shown on failure, never input values or manifests.
    process.stdout.write(`${JSON.stringify(result.offlineValid ? { offlineValid: true, runtimeVerified: false, resources: result.resources, mcpEnabled: result.mcpEnabled } : { offlineValid: false, errors: result.errors }, null, 2)}\n`);
    if (!result.offlineValid) process.exitCode = 1;
  } catch {
    process.stderr.write('OFFLINE_QUALIFICATION_FAILED: check profile, YAML syntax, kubectl availability and output directory\n');
    process.exitCode = 1;
  }
}
