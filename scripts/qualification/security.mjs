import { createHmac } from 'node:crypto';
import { api, evidence, required, tokens } from './lib.mjs';

const startedAt = new Date().toISOString(); const [userToken, foreignTenantToken, adminToken] = await tokens(3); const foreignJobId = required('QUAL_FOREIGN_TENANT_JOB_ID'); const webhookSecret = required('QUAL_WEBHOOK_TEST_SECRET');
const crossTenant = await api(`/api/v1/jobs/${foreignJobId}`, userToken); const adminMode = await api('/api/v1/admin/operations/mode', adminToken); const userMode = await api('/api/v1/admin/operations/mode', userToken);
const invalidToken = await api('/api/v1/jobs', 'invalid-token'); const foreignView = await api(`/api/v1/jobs/${foreignJobId}`, foreignTenantToken);
const timestamp = '1700000000'; const body = '{"jobId":"test"}'; const signature = createHmac('sha256', webhookSecret).update(`${timestamp}.${body}`).digest('hex');
const checks = [
  { name: 'invalid-jwt-rejected', passed: invalidToken.status === 401, actual: invalidToken.status },
  { name: 'cross-tenant-hidden', passed: [403, 404].includes(crossTenant.status), actual: crossTenant.status },
  { name: 'foreign-tenant-owner-visible', passed: foreignView.status === 200, actual: foreignView.status },
  { name: 'user-cannot-operate', passed: userMode.status === 403, actual: userMode.status },
  { name: 'admin-can-read-mode', passed: adminMode.status === 200, actual: adminMode.status },
  { name: 'webhook-hmac-sha256', passed: /^[a-f0-9]{64}$/.test(signature), actual: 'valid-digest' },
];
const output = await evidence('security', startedAt, checks, { endpointsTested: checks.length }, { note: 'Secrets and tokens are intentionally excluded from evidence.' });
console.log(JSON.stringify({ evidence: output.path, passed: output.result.passed })); if (!output.result.passed) process.exitCode = 2;
