import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { evidence, integer, required, sleep, submitWorkloadJob, tokens } from './lib.mjs';

const startedAt = new Date().toISOString(); const [token] = await tokens(1); const versionId = required('QUAL_REQUIREMENTS_VERSION_ID');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(versionId)) throw new Error('QUAL_REQUIREMENTS_VERSION_ID must identify an immutable version owned by the test identity');
const bytes = 100 * 1024 * 1024; const chunk = Buffer.alloc(1024 * 1024, 'a'); const hash = createHash('sha256');
for (let offset = 0; offset < bytes; offset += chunk.length) hash.update(chunk); const checksum = hash.digest('hex'); let sent = 0;
const body = new ReadableStream({ pull(controller) { if (sent >= bytes) return controller.close(); controller.enqueue(chunk); sent += chunk.length; } });
const uploadStarted = performance.now(); const uploadResponse = await fetch(`${required('QUAL_API_BASE_URL').replace(/\/$/, '')}/api/v1/artifacts`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-SHA256': checksum }, body, duplex: 'half' });
const artifact = await uploadResponse.json(); const uploadMs = performance.now() - uploadStarted; const hours = integer('QUAL_SOAK_HOURS', 24); const intervalMinutes = integer('QUAL_SOAK_JOB_INTERVAL_MINUTES', 5); const deadline = Date.now() + hours * 3_600_000; const jobs = [];
if (uploadResponse.status !== 201 || !artifact.artifactId) throw new Error(`Qualification text upload failed: HTTP ${uploadResponse.status}`);
while (Date.now() < deadline) {
  const created = await submitWorkloadJob(jobs.length % 2 ? 'RESEARCH' : 'DECOMPOSITION', token, { inputArtifactId: artifact.artifactId, versionId }, `soak-${randomUUID()}`);
  jobs.push({ status: created.status, jobId: created.body?.jobId || null }); await sleep(intervalMinutes * 60_000);
}
const dbCommand = JSON.parse(required('QUAL_DB_VERIFY_COMMAND_JSON')); if (!Array.isArray(dbCommand) || dbCommand.length < 2) throw new Error('QUAL_DB_VERIFY_COMMAND_JSON must be an argv array');
const db = spawnSync(dbCommand[0], dbCommand.slice(1), { encoding: 'utf8', timeout: 900_000 });
const checks = [
  { name: '100mb-upload', passed: uploadResponse.status === 201 && Number(artifact.size) === bytes, actual: { status: uploadResponse.status, size: artifact.size } },
  { name: 'soak-duration', passed: hours >= 24, actual: hours, expectedMin: 24 },
  { name: 'job-acceptance', passed: jobs.every((job) => job.status === 202), actual: jobs.filter((job) => job.status === 202).length, total: jobs.length },
  { name: 'database-growth-query-backup-restore', passed: db.status === 0, actual: db.status },
];
const output = await evidence('soak', startedAt, checks, { bytes, uploadMs, jobs: jobs.length, dbVerifierOutputDigest: createHash('sha256').update(db.stdout || '').digest('hex') });
console.log(JSON.stringify({ evidence: output.path, passed: output.result.passed })); if (!output.result.passed) process.exitCode = 2;
