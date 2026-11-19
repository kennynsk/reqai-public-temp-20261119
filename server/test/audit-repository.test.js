import assert from 'node:assert/strict';
import test from 'node:test';

import { AuditRepository } from '../src/repositories/audit-repository.js';

test('audit repository only appends trusted actor and tenant context', async () => {
  const calls = [];
  const client = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('INSERT INTO')) return { rows: [{ id: params[0], occurred_at: new Date() }] };
      return { rows: [] };
    },
    release() {},
  };
  const repository = new AuditRepository({ connect: async () => client });
  const result = await repository.record({
    tenantId: 'tenant-a',
    actorId: 'admin-a',
    actorRoles: ['system-admin'],
    action: 'workflow.reset',
    targetType: 'job',
    targetId: 'job-a',
    requestId: 'request-a',
    sourceSite: 'dc-a',
  });
  assert.ok(result.id);
  const insert = calls.find((call) => call.sql.includes('INSERT INTO'));
  assert.equal(insert.params[1], 'tenant-a');
  assert.equal(insert.params[2], 'admin-a');
  assert.doesNotMatch(insert.sql, /UPDATE|DELETE/);
});
