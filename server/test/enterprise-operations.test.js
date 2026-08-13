import assert from 'node:assert/strict';
import test from 'node:test';

import { OperationalRepository } from '../src/repositories/operational-repository.js';
import { RetentionRepository } from '../src/repositories/retention-repository.js';
import { createReadinessService } from '../src/services/readiness-service.js';
import { renderMetrics } from '../src/observability/metrics.js';

function poolWith(handler) {
  return { async connect() { return { async query(sql, args) { if (/BEGIN|COMMIT|ROLLBACK|set_config/.test(sql)) return { rows: [], rowCount: 0 }; return handler(sql, args); }, release() {} }; } };
}

test('operational mode is scoped per data center and readiness drains only selected API', async () => {
  const queries = [];
  const repository = new OperationalRepository(poolWith((sql, args) => { queries.push([sql, args]); if (sql.includes('SELECT *')) return { rows: [{ scope: 'site:dc-a', mode: 'DRAIN', version: 2 }] }; if (sql.includes('UPDATE')) return { rows: [{ scope: 'site:dc-a', mode: 'NORMAL', version: 3 }] }; return { rows: [] }; }), { siteId: 'dc-a' });
  assert.equal((await repository.get({ tenantId: 't' })).mode, 'DRAIN');
  await repository.set({ tenantId: 't', mode: 'NORMAL', reason: 'recovered', actorId: 'operator', expectedVersion: 2 });
  assert.ok(queries.some(([, args]) => args?.includes('site:dc-a')));
  const dcA = createReadinessService({ checks: [{ name: 'mode', check: async () => ({ ok: false }) }] });
  const dcB = createReadinessService({ checks: [{ name: 'mode', check: async () => ({ ok: true }) }] });
  assert.equal((await dcA.checkReady()).ok, false); assert.equal((await dcB.checkReady()).ok, true);
});

test('retention excludes legal-hold and active-job artifacts, deletes in a batch and emits metrics', async () => {
  const sql = [];
  const repository = new RetentionRepository(poolWith((statement) => {
    sql.push(statement);
    if (statement.includes('DELETE FROM "reqai".job_trace_entries')) return { rows: [{ id: '00000000-0000-4000-8000-000000000002' }] };
    if (statement.includes('WITH expired')) return { rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
    return { rows: [], rowCount: 1 };
  }));
  const deleted = await repository.cleanup({ tenantId: 't', batchSize: 25, siteId: 'dc-a' });
  assert.equal(deleted.length, 1);
  assert.match(sql[0], /job_trace_entries/); assert.match(sql[0], /expires_at<=now\(\)/); assert.match(sql[0], /LIMIT \$2/);
  assert.match(sql[1], /legal_hold=false/); assert.match(sql[1], /status IN \('ACCEPTED','QUEUED','RUNNING'/); assert.match(sql[1], /LIMIT \$2/);
  assert.match(renderMetrics(), /reqai_retention_deleted_total 1/);
  assert.match(renderMetrics(), /reqai_trace_retention_deleted_total 1/);
});
