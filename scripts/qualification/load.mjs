import { randomUUID } from 'node:crypto';
import { api, evidence, integer, percentile, required, sleep, tokens } from './lib.mjs';

const startedAt = new Date().toISOString(); const users = integer('QUAL_CONCURRENT_USERS', 100); const jobsPerMinute = integer('QUAL_JOBS_PER_MINUTE', 30); const durationMinutes = integer('QUAL_DURATION_MINUTES', 10);
const identities = await tokens(users); const inputArtifactId = required('QUAL_INPUT_ARTIFACT_ID'); const total = jobsPerMinute * durationMinutes; const intervalMs = 60_000 / jobsPerMinute; const results = [];
const categories = Array.from({ length: 10 }, (_, index) => `research-category-${index + 1}`);
const concurrentPulse = await Promise.all(identities.slice(0, users).map((token) => api('/api/v1/jobs?limit=1', token)));
await Promise.all(Array.from({ length: total }, async (_, index) => {
  await sleep(Math.floor(index * intervalMs)); const token = identities[index % users]; const type = index % 3 === 0 ? 'DECOMPOSITION' : 'RESEARCH';
  const response = await api('/api/v1/jobs', token, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': `qualification-${randomUUID()}` }, body: JSON.stringify({ type, inputArtifactId, ...(type === 'RESEARCH' ? { options: { researchCategories: categories.slice(0, index % 2 ? 5 : 10) } } : {}) }) });
  results.push({ status: response.status, durationMs: response.durationMs, type, errorCode: response.body?.error?.code || null });
}));
const accepted = results.filter((item) => item.status === 202); const p95 = percentile(results.map((item) => item.durationMs), 0.95); const acceptanceRate = accepted.length / results.length;
const checks = [
  { name: 'configured-concurrent-users', passed: users === 100, actual: users, expected: 100 },
  { name: 'concurrent-user-pulse', passed: concurrentPulse.length === 100 && concurrentPulse.every((item) => item.status === 200), actual: concurrentPulse.filter((item) => item.status === 200).length, expected: 100 },
  { name: 'configured-jobs-per-minute', passed: jobsPerMinute === 30, actual: jobsPerMinute, expected: 30 },
  { name: 'job-accept-p95-ms', passed: p95 <= 2000, actual: p95, expectedMax: 2000 },
  { name: 'acceptance-rate', passed: acceptanceRate >= 0.995, actual: acceptanceRate, expectedMin: 0.995 },
  { name: 'research-category-coverage', passed: results.some((item) => item.type === 'RESEARCH'), actual: '5 and 10 category requests emitted' },
];
const statusCounts = results.reduce((counts, item) => ({ ...counts, [item.status]: (counts[item.status] || 0) + 1 }), {});
const output = await evidence('load', startedAt, checks, { total, accepted: accepted.length, p95Ms: p95, acceptanceRate, concurrentPulseP95Ms: percentile(concurrentPulse.map((item) => item.durationMs), 0.95), statusCounts });
console.log(JSON.stringify({ evidence: output.path, passed: output.result.passed })); if (!output.result.passed) process.exitCode = 2;
