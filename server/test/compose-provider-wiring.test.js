import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('local durable workers use the real ZAI provider from env.dev without exposing secrets to non-LLM roles', async () => {
  const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');
  assert.match(compose, /LLM_PROVIDER_MODE:\s+"\$\{LLM_PROVIDER_MODE:-zai\}"/);
  assert.match(compose, /ZAI_MODELS:\s+"\$\{ZAI_MODELS:-glm-5\.2,glm-5-turbo,glm-4\.7,glm-4\.7-flash\}"/);
  assert.equal((compose.match(/env_file:\n\s+- \.env\.dev/g) || []).length, 3);

  const apiBlock = compose.slice(compose.indexOf('  reqai-api:'), compose.indexOf('  event-worker:'));
  const eventBlock = compose.slice(compose.indexOf('  event-worker:'), compose.indexOf('  decomposition-worker:'));
  const maintenanceBlock = compose.slice(compose.indexOf('  maintenance-worker:'), compose.indexOf('  frontend:'));
  for (const block of [apiBlock, eventBlock, maintenanceBlock]) assert.doesNotMatch(block, /env_file:/);
});
