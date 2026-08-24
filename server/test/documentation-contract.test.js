import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');

function routeOperations(source) {
  return [...source.matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)]
    .map((match) => `${match[1]} ${match[2].replace(/:([A-Za-z][A-Za-z0-9]*)/g, '{$1}')}`)
    .sort();
}

test('OpenAPI declares every v1 and system router operation', async () => {
  const [apiSource, systemSource, document] = await Promise.all([
    read('server/src/routes/api-v1-routes.js'),
    read('server/src/routes/system-routes.js'),
    read('docs/api/openapi.v1.json').then(JSON.parse),
  ]);
  const runtime = [...routeOperations(apiSource), ...routeOperations(systemSource)].sort();
  const documented = Object.entries(document.paths).flatMap(([path, methods]) =>
    Object.keys(methods).filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method)).map((method) => `${method} ${path}`),
  ).sort();
  assert.deepEqual(documented, runtime);
});

test('human documentation describes the current guided workflow and legacy boundary', async () => {
  const [readme, parity, integration] = await Promise.all([
    read('README.md'), read('docs/functional-parity.md'), read('docs/requirements-integration-api.md'),
  ]);
  for (const marker of ['Подготовка требований', 'Контекст', 'Требования', 'AI-исследование', 'Финальная версия', 'Дополнительные инструменты']) {
    assert.match(`${readme}\n${parity}`, new RegExp(marker));
  }
  assert.doesNotMatch(parity, /разделами «Бизнес-требования» и «Исследование рынка»/);
  assert.match(readme, /Node\.js-22/);
  assert.match(readme, /OpenRouter-переменные относятся только к `npm run dev:legacy`/);
  assert.match(integration, /http:\/\/localhost:5178/);
});

test('prompt documentation covers the shipped catalog and primary workflow separation', async () => {
  const [entries, prompts, qualification] = await Promise.all([
    readdir(new URL('server/prompt-bundles/', root), { withFileTypes: true }),
    read('docs/prompt-bundles.md'),
    read('docs/qualification.md'),
  ]);
  const bundleIds = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  assert.equal(bundleIds.length, 5);
  for (const id of bundleIds) assert.ok(prompts.includes(`\`${id}\``), `missing documented bundle ${id}`);
  assert.match(prompts, /`requirements-insights`[\s\S]*one `insights` template/);
  assert.match(qualification, /five active `1\.0\.0` bundles/);
});

test('configuration documentation uses current runtime environment names', async () => {
  const documentation = await read('docs/configuration.md');
  for (const name of ['KAFKA_SSL_ENABLED', 'SSE_POLL_INTERVAL_MS', 'TEMPORAL_TLS_CERT_PATH', 'TEMPORAL_TLS_KEY_PATH', 'TEMPORAL_TLS_SERVER_NAME']) {
    assert.ok(documentation.includes(`\`${name}\``), `missing documented variable ${name}`);
  }
  for (const stale of ['KAFKA_SECURITY_PROTOCOL', 'KAFKA_CA_CERT_PATH', 'SSE_RECONCILE_INTERVAL_MS', 'TEMPORAL_CA_CERT_PATH', 'TEMPORAL_CLIENT_CERT_PATH', 'TEMPORAL_CLIENT_KEY_PATH', 'ARTIFACT_INLINE_MAX_BYTES', 'WEBHOOK_ALLOWED_EVENTS', 'RETENTION_TECHNICAL_LOGS_DAYS']) {
    assert.ok(!documentation.includes(`\`${stale}\``), `stale documented variable ${stale}`);
  }
});
