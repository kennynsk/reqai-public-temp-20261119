import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { json, summarizeJob } from './requirements-e2e-helpers.mjs';

const baseUrl = process.env.REQAI_BASE_URL || 'http://localhost:5178';
if (process.env.QUAL_ALLOW_DISRUPTION !== 'YES-I-UNDERSTAND') throw new Error('QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND is required before a worker recovery drill');
const workerContainer = process.env.REQAI_RECOVERY_WORKER_CONTAINER || 'reqai-decomposition-worker-1';
const project = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.project" }}', workerContainer], { encoding: 'utf8' }).trim();
const service = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "com.docker.compose.service" }}', workerContainer], { encoding: 'utf8' }).trim();
if (project !== 'reqai' || service !== 'decomposition-worker') throw new Error('Recovery drill requires the existing reqai decomposition worker');
const input = Buffer.from('Проверить восстановление длительной enterprise-задачи после аварийного завершения worker.', 'utf8');
const artifact = await json(await fetch(`${baseUrl}/api/v1/artifacts`, {
  method: 'POST',
  headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-sha256': createHash('sha256').update(input).digest('hex') },
  body: input,
}));
const accepted = await json(await fetch(`${baseUrl}/api/v1/decompositions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': `local-recovery-${randomUUID()}` },
  body: JSON.stringify({ inputArtifactId: artifact.artifactId }),
}));

let beforeRestart;
const runningDeadline = Date.now() + 30_000;
while (Date.now() < runningDeadline) {
  beforeRestart = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}`));
  if (beforeRestart.status === 'RUNNING') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (beforeRestart?.status !== 'RUNNING') throw new Error(`Job did not start; status=${beforeRestart?.status || 'UNKNOWN'}`);

execFileSync('docker', ['kill', '--signal=KILL', workerContainer], { stdio: 'inherit' });
execFileSync('docker', ['start', workerContainer], { stdio: 'inherit' });

let afterRestart;
const completionDeadline = Date.now() + 90_000;
while (Date.now() < completionDeadline) {
  afterRestart = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}`));
  if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(afterRestart.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (afterRestart?.status !== 'SUCCEEDED') throw new Error(`Recovered job did not succeed; status=${afterRestart?.status || 'UNKNOWN'}`);
const result = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}/result`));
process.stdout.write(`${JSON.stringify({ beforeRestart: { jobId: beforeRestart.jobId, status: beforeRestart.status }, ...summarizeJob(afterRestart, { metadata: result, content: null }) }, null, 2)}\n`);
