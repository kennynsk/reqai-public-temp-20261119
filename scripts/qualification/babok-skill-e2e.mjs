import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { json, waitForJob, readResult, verifyModel } from './requirements-e2e-helpers.mjs';
import { validateBabokConsolidation, validateBabokSkillResult } from '../../server/src/services/babok-requirements-contract.js';
import { renderBabokReport } from '../../server/src/services/babok-report-renderer.js';

const baseUrl = process.env.REQAI_BASE_URL || 'http://localhost:5178';
const model = process.env.REQAI_E2E_MODEL || 'glm-5.3-flash';
const scenario = JSON.parse(await readFile(new URL('../../server/test/fixtures/babok-skill-scenario.json', import.meta.url), 'utf8'));
async function upload(content) {
  return json(await fetch(`${baseUrl}/api/v1/artifacts`, { method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-sha256': createHash('sha256').update(content).digest('hex') }, body: content }));
}
let job;
if (process.env.REQAI_E2E_JOB_ID) {
  job = { jobId: process.env.REQAI_E2E_JOB_ID };
} else {
const baseline = await upload(scenario.baseline);
const reference = await upload(scenario.reference);
job = await json(await fetch(`${baseUrl}/api/v1/decompositions`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `babok-skill-${randomUUID()}` },
  body: JSON.stringify({ businessContext: scenario.primary, baselineArtifactId: baseline.artifactId, referenceArtifactIds: [reference.artifactId], model, temperature: 0.2, promptVersion: '2.3.0' }),
}));
}
console.log(JSON.stringify({ jobId: job.jobId, url: `http://localhost:5177/tasks/${job.jobId}`, phase: 'started' }));
const status = await waitForJob(baseUrl, job.jobId);
const result = await readResult(baseUrl, job.jobId);
verifyModel(result.metadata, model);
const r = result.content;
validateBabokConsolidation(r);
validateBabokSkillResult(r, { final: true });
assert.equal(r.outcome, 'COMPLETE');
for (const type of ['BR', 'SR', 'FR', 'NFR', 'TR', 'CON']) assert.ok(r.groups[type].length, `${type} missing`);
assert.ok(r.groups.FR.length >= 4, 'independent actions must remain atomic');
assert.ok(!r.groups.FR.some((item) => /суточн/i.test(item.text)), 'excluded per diem calculation became an FR');
assert.ok(r.groups.NFR.some((item) => /2/.test(item.text) && /100/.test(item.text) && item.verificationMethod));
assert.ok(r.analysis.GAP.length > 0, 'umbrella scope must have a GAP');
assert.ok(r.analysis.delta.some((item) => item.baselineId === 'FR-901' && item.kind === 'изменено'), 'changed baseline FR-901 lost');
assert.ok(r.analysis.delta.some((item) => item.baselineId === 'FR-903' && item.kind === 'заменено / исключено'), 'removed baseline FR-903 lost');
assert.ok(r.analysis.delta.length >= 2, 'independent DELTAs were lost');
for (const record of r.groups.FR.filter((item) => /согласует|возвращает/.test(item.text))) {
  assert.ok(r.analysis.delta.some((item) => item.newId === record.id && item.kind === 'новое' && item.baselineId === null), `new function ${record.id} missing from baseline comparison`);
}
const report = renderBabokReport(r);
assert.equal((report.match(/^## /gm) || []).length, 12);
if (Object.values(r.groups).flat().some((item) => item.quality === 'Требует уточнения')) assert.match(report, /Требует уточнения \(GAP-/);
assert.doesNotMatch(report, /\| дубликат \|/);
const evidence = { jobId: job.jobId, status: status.status, outcome: r.outcome, model, counts: r.summary.counts, questions: r.analysis.questions.length, reportSections: 12, checks: 'all passed', attempts: result.metadata.modelAttempts };
if (process.env.REQAI_E2E_EVIDENCE) await writeFile(process.env.REQAI_E2E_EVIDENCE, JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
