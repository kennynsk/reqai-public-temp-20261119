import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('LLM workers and the discussion API receive provider credentials; event and maintenance roles do not', async () => {
  const compose = await readFile(new URL('../../compose.yaml', import.meta.url), 'utf8');
  assert.match(compose, /LLM_PROVIDER_MODE:\s+"\$\{LLM_PROVIDER_MODE:-zai\}"/);
  assert.match(compose, /ZAI_MODELS:\s+"\$\{ZAI_MODELS:-glm-5\.3-flash,glm-5\.3,glm-5\.2,glm-5-turbo,glm-4\.7,glm-4\.7-flash\}"/);
  assert.match(compose, /LLM_MODEL_PRIORITY:\s+"\$\{LLM_MODEL_PRIORITY:-glm-5\.3-flash,glm-5\.3,glm-5\.2\}"/);
  assert.equal((compose.match(/env_file:\n\s+- \.env\.dev/g) || []).length, 3);
  assert.doesNotMatch(compose, /synthesis-worker|requirements-synthesis/);

  const apiBlock = compose.slice(compose.indexOf('  api:'), compose.indexOf('  event-worker:'));
  const eventBlock = compose.slice(compose.indexOf('  event-worker:'), compose.indexOf('  decomposition-worker:'));
  const maintenanceBlock = compose.slice(compose.indexOf('  maintenance-worker:'), compose.indexOf('  frontend:'));
  assert.match(apiBlock, /env_file:/);
  for (const block of [eventBlock, maintenanceBlock]) assert.doesNotMatch(block, /env_file:/);
});
