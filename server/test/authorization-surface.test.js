import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile(new URL('../src/routes/api-v1-routes.js', import.meta.url), 'utf8');
test('history, result, artifact and SSE endpoints are authenticated and owner/tenant scoped', () => {
  for (const path of ["'/api/v1/jobs'", "'/api/v1/jobs/:jobId/result'", "'/api/v1/artifacts/:artifactId'", "'/api/v1/jobs/:jobId/events'", "'/api/v1/jobs/:jobId/trace'"]) {
    const offset = routes.indexOf(path); assert.ok(offset > 0, `${path} missing`); assert.match(routes.slice(offset, offset + 250), /requireAnyRole/);
  }
  assert.match(routes, /ownerScope\(req\.auth\)/); assert.match(routes, /jobQueryService\.get\(\{ auth: req\.auth/);
});
test('Temporal reset and webhook redelivery are system-admin only and audited before execution', () => {
  for (const marker of ["'/api/v1/admin/workflows/:jobId/reset'", "'/api/v1/admin/webhooks/:deliveryId/redeliver'"]) {
    const offset = routes.indexOf(marker); const block = routes.slice(offset, offset + 1400); assert.match(block, /requireAnyRole\('system-admin'\)/); assert.ok(block.indexOf('auditRepository.record') < block.indexOf(marker.includes('workflows') ? 'workflowEngine.reset' : 'webhookRepository.redeliver'));
  }
});
test('artifact upload bypasses JSON body parsing and remains a streaming endpoint', () => {
  const parser = routes.indexOf("req.originalUrl?.split('?')[0] === '/api/v1/artifacts'");
  const upload = routes.indexOf("router.post('/api/v1/artifacts'");
  assert.ok(parser > 0 && parser < upload);
  assert.match(routes.slice(parser, parser + 180), /return next\(\)/);
});
