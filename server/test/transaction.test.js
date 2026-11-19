import assert from 'node:assert/strict';
import test from 'node:test';

import { withTenantTransaction } from '../src/db/transaction.js';

function fakePool({ fail = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (fail && sql === 'work') throw new Error('failed');
      return { rows: [] };
    },
    release() {
      calls.push({ sql: 'RELEASE' });
    },
  };
  return { calls, connect: async () => client };
}

test('tenant transaction sets local tenant and commits', async () => {
  const pool = fakePool();
  await withTenantTransaction(pool, 'tenant-a', (client) => client.query('work'));
  assert.deepEqual(pool.calls.map((call) => call.sql), [
    'BEGIN',
    "SELECT set_config('app.tenant_id', $1, true)",
    'work',
    'COMMIT',
    'RELEASE',
  ]);
  assert.deepEqual(pool.calls[1].params, ['tenant-a']);
});

test('tenant transaction rolls back and releases on failure', async () => {
  const pool = fakePool({ fail: true });
  await assert.rejects(() => withTenantTransaction(pool, 'tenant-a', (client) => client.query('work')));
  assert.deepEqual(pool.calls.map((call) => call.sql), [
    'BEGIN',
    "SELECT set_config('app.tenant_id', $1, true)",
    'work',
    'ROLLBACK',
    'RELEASE',
  ]);
});
