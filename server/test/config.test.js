import assert from 'node:assert/strict';
import test from 'node:test';

import { loadConfig, redactedConfig } from '../src/config/env.js';

test('enterprise config parses documented defaults without infrastructure in legacy mode', () => {
  const config = loadConfig({}, { loadFiles: false });
  assert.equal(config.asyncEnabled, false);
  assert.equal(config.llm.providerMode, 'zai');
  assert.deepEqual(config.llm.availableModels, ['glm-5.3', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash']);
  assert.deepEqual(config.llm.models, ['glm-5.3', 'glm-5-turbo', 'glm-4.7']);
  assert.equal(config.jobs.inputMaxBytes, 104857600);
  assert.equal(config.diagnostics.captureProtected, false);
  assert.equal(config.diagnostics.maxPageSize, 100);
  assert.equal(config.slo.availabilityPercent, 99.5);
  assert.ok(Object.isFrozen(config));
});

test('async mode fails fast when infrastructure is missing', () => {
  assert.throws(() => loadConfig({ ASYNC_PLATFORM_ENABLED: 'true' }, { loadFiles: false }), /DATABASE_URL/);
});

test('config validates cross-field and model-map rules', () => {
  assert.throws(
    () => loadConfig({ QUEUE_SOFT_BACKLOG_LIMIT: '10', QUEUE_HARD_BACKLOG_LIMIT: '10' }, { loadFiles: false }),
    /SOFT_BACKLOG/,
  );
  assert.throws(
    () => loadConfig({ LLM_MODEL_PRIORITY: 'GC-Max,GC-Max' }, { loadFiles: false }),
    /distinct models/,
  );
});

test('effective config diagnostic redacts secret values', () => {
  const config = loadConfig({ DATABASE_URL: 'postgresql://user:secret@db/reqai', ZAI_API_KEY: 'zai-secret' }, { loadFiles: false });
  const safe = redactedConfig(config);
  assert.deepEqual(safe.database.url, { configured: true });
  assert.deepEqual(safe.llm.apiKey, { configured: true });
  assert.equal(JSON.stringify(safe).includes('postgresql://user:secret@db/reqai'), false);
  assert.equal(JSON.stringify(safe).includes('zai-secret'), false);
});

test('mock LLM is allowed locally and forbidden in production', () => {
  const local = loadConfig({ LLM_PROVIDER_MODE: 'mock' }, { loadFiles: false });
  assert.equal(local.llm.providerMode, 'mock');
  assert.throws(
    () => loadConfig({ NODE_ENV: 'production', AUTH_ENABLED: 'false', LLM_PROVIDER_MODE: 'mock' }, { loadFiles: false }),
    /forbidden in production/,
  );
});

test('GigaChat auto profile prefers refreshable personal credentials over a stale corp token', () => {
  const config = loadConfig({
    LLM_PROVIDER_MODE: 'gigachat',
    GIGACHAT_AUTH_KEY: 'personal-key',
    GIGACHAT_SCOPE: 'GIGACHAT_API_PERS',
    GIGACHAT_BASE_URL: 'https://personal.example/api/v1',
    GIGACHAT_OAUTH_URL: 'https://personal.example/oauth',
    GIGACHAT_CORP_ACCESS_TOKEN: 'stale-corp-token',
  }, { loadFiles: false });
  assert.equal(config.llm.providerProfile, 'personal');
  assert.equal(config.llm.credentials, 'personal-key');
  assert.equal(config.llm.accessToken, '');
  assert.equal(config.llm.scope, 'GIGACHAT_API_PERS');
  assert.equal(config.llm.baseUrl, 'https://personal.example/api/v1');
  assert.equal(config.llm.authUrl, 'https://personal.example/oauth');
});

test('GigaChat corp profile remains explicitly selectable', () => {
  const config = loadConfig({
    LLM_PROVIDER_MODE: 'gigachat',
    GIGACHAT_PROFILE: 'corp',
    GIGACHAT_AUTH_KEY: 'personal-key',
    GIGACHAT_CORP_ACCESS_TOKEN: 'corp-token',
  }, { loadFiles: false });
  assert.equal(config.llm.providerProfile, 'corp');
  assert.equal(config.llm.credentials, '');
  assert.equal(config.llm.accessToken, 'corp-token');
  assert.equal(config.llm.scope, 'GIGACHAT_API_CORP');
});
