import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redact } from '../src/redaction.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('redaction removes tokens, inline requirements and prompt metadata recursively', () => {
  const value = redact({ authorization: 'Bearer raw-token', args: { businessContext: 'private requirements', promptVersion: '1.0.0' }, error: 'Bearer other-token' });
  assert.deepEqual(value, { authorization: '[REDACTED]', args: { businessContext: '[REDACTED]', promptVersion: '[REDACTED]' }, error: 'Bearer [REDACTED]' });
  assert.doesNotMatch(JSON.stringify(value), /raw-token|other-token|private requirements|1\.0\.0/);
});

test('gateway source imports no backend repositories, workflows, prompts or providers', () => {
  const files = ['config.js', 'http-server.js', 'index.js', 'metrics.js', 'redaction.js', 'rest-client.js', 'schemas.js', 'stdio-runtime.js', 'tools.js'];
  const source = files.map((file) => readFileSync(join(root, 'src', file), 'utf8')).join('\n');
  assert.doesNotMatch(source, /server\/src|repositories|workflow\/|workflows\/|activities|prompt-catalog|provider-executor|model-executor/);
});

test('main ReqAI API does not advertise MCP capabilities', () => {
  const routes = readFileSync(join(root, '..', 'server', 'src', 'routes', 'api-v1-routes.js'), 'utf8');
  assert.doesNotMatch(routes, /mcp/i);
});

test('deployment is independent, restricted and disabled by default', () => {
  const manifest = readFileSync(join(root, '..', 'deploy', 'k8s', 'mcp-gateway.yaml'), 'utf8');
  const compose = readFileSync(join(root, '..', 'compose.yaml'), 'utf8');
  assert.match(manifest, /replicas: 0/);
  assert.match(manifest, /MCP_ENABLED: "false"/);
  assert.match(manifest, /kind: NetworkPolicy/);
  assert.match(manifest, /secretKeyRef: \{ name: reqai-mcp-readiness/);
  assert.match(manifest, /readOnlyRootFilesystem: true/);
  assert.match(compose, /profiles: \["mcp"\]/);
  assert.match(compose, /MCP_TOOL_SCHEMA_VERSION: 2\.0\.0/);
});

test('operations documentation records client, IAM, polling, large artifacts and rollback', () => {
  const contract = readFileSync(join(root, '..', 'docs', 'mcp-requirements-adapter.md'), 'utf8');
  const runbook = readFileSync(join(root, '..', 'docs', 'runbooks', 'enterprise-operations.md'), 'utf8');
  for (const phrase of ['forward-same-audience', 'inputArtifactId', 'get_task_status', 'MCP_BACKEND_TIMEOUT', 'Threat model']) assert.match(contract, new RegExp(phrase));
  assert.match(runbook, /MCP gateway: canary, incident и rollback/);
  assert.match(runbook, /уже принятые REST jobs продолжаются/);
});
