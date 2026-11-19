import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evidence, required } from './lib.mjs';

const startedAt = new Date().toISOString(); const directory = resolve(process.env.QUAL_EVIDENCE_DIR || 'qualification/evidence'); const records = [];
for (const name of await readdir(directory)) { if (!name.endsWith('.json')) continue; const record = JSON.parse(await readFile(resolve(directory, name), 'utf8')); if (record.environment === required('QUAL_ENVIRONMENT')) records.push(record); }
const requiredKinds = ['load', 'soak', 'security', 'failure-drill', 'dc-failover']; const checks = requiredKinds.map((kind) => { const matches = records.filter((record) => record.kind === kind); return { name: `evidence-${kind}`, passed: matches.some((record) => record.passed), evidenceIds: matches.map((record) => record.evidenceId) }; });
checks.push({ name: 'security-signoff', passed: process.env.QUAL_SECURITY_SIGNOFF_ID?.startsWith('SEC-') === true, actual: process.env.QUAL_SECURITY_SIGNOFF_ID || null });
checks.push({ name: 'operations-signoff', passed: process.env.QUAL_OPERATIONS_SIGNOFF_ID?.startsWith('OPS-') === true, actual: process.env.QUAL_OPERATIONS_SIGNOFF_ID || null });
checks.push({ name: 'compatibility-window-expired', passed: Date.now() >= new Date(required('QUAL_COMPATIBILITY_WINDOW_END')).getTime(), actual: required('QUAL_COMPATIBILITY_WINDOW_END') });
const output = await evidence('rollout', startedAt, checks, { sourceEvidenceCount: records.length }, { changeId: required('QUAL_CHANGE_ID') });
console.log(JSON.stringify({ evidence: output.path, passed: output.result.passed })); if (!output.result.passed) process.exitCode = 2;
