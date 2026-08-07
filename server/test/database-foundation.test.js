import assert from 'node:assert/strict';
import test from 'node:test';

import { checkDatabaseHealth, createDatabasePool } from '../src/db/pool.js';
import { createReadinessService } from '../src/services/readiness-service.js';

test('database pool uses bounded application settings', () => {
  let options;
  class FakePool {
    constructor(value) {
      options = value;
    }
  }
  const pool = createDatabasePool({
    process: { role: 'api', siteId: 'dc-a' },
    database: {
      url: 'postgresql://db/reqai',
      poolMin: 2,
      poolMax: 20,
      connectTimeoutMs: 5000,
      statementTimeoutMs: 30000,
      sslMode: 'disable',
      caCertPath: '',
    },
  }, { PoolClass: FakePool });
  assert.ok(pool instanceof FakePool);
  assert.equal(options.max, 20);
  assert.equal(options.application_name, 'reqai-api-dc-a');
});

test('database readiness reports success and failure without leaking errors', async () => {
  const healthy = await checkDatabaseHealth({ query: async () => ({ rows: [{ ok: 1 }] }) });
  assert.equal(healthy.ok, true);

  const readiness = createReadinessService({
    checks: [{ name: 'postgresql', check: async () => { throw new Error('password secret'); } }],
  });
  const result = await readiness.checkReady();
  assert.deepEqual(result, { ok: false, checks: [{ name: 'postgresql', ok: false, errorType: 'Error' }] });
});
