import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';

const baseUrl = process.env.REQAI_BASE_URL || 'http://localhost:5178';
async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

const input = Buffer.from('Проверить восстановление длительной enterprise-задачи после аварийного завершения worker.', 'utf8');
const artifact = await json(await fetch(`${baseUrl}/api/v1/artifacts`, {
  method: 'POST',
  headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-sha256': createHash('sha256').update(input).digest('hex') },
  body: input,
}));
const accepted = await json(await fetch(`${baseUrl}/api/v1/jobs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': `local-recovery-${randomUUID()}` },
  body: JSON.stringify({ type: 'DECOMPOSITION', inputArtifactId: artifact.artifactId }),
}));

let beforeRestart;
const runningDeadline = Date.now() + 30_000;
while (Date.now() < runningDeadline) {
  beforeRestart = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}`));
  if (beforeRestart.status === 'RUNNING') break;
  await new Promise((resolve) => setTimeout(resolve, 100));
}
if (beforeRestart?.status !== 'RUNNING') throw new Error(`Job did not start: ${JSON.stringify(beforeRestart)}`);

execFileSync('docker', ['compose', 'kill', 'decomposition-worker'], { stdio: 'inherit' });
execFileSync('docker', ['compose', 'up', '-d', 'decomposition-worker'], { stdio: 'inherit' });

let afterRestart;
const completionDeadline = Date.now() + 90_000;
while (Date.now() < completionDeadline) {
  afterRestart = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}`));
  if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(afterRestart.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (afterRestart?.status !== 'SUCCEEDED') throw new Error(`Recovered job did not succeed: ${JSON.stringify(afterRestart)}`);
const result = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}/result`));
process.stdout.write(`${JSON.stringify({ jobId: accepted.jobId, beforeRestart, afterRestart, modelAttempts: result.modelAttempts }, null, 2)}\n`);
