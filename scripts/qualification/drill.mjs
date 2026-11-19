import { spawnSync } from 'node:child_process';
import { evidence, required } from './lib.mjs';

if (process.env.QUAL_ALLOW_DISRUPTION !== 'YES-I-UNDERSTAND') throw new Error('QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND is required');
const startedAt = new Date().toISOString(); const contextA = required('QUAL_KUBE_CONTEXT_DC_A'); const contextB = required('QUAL_KUBE_CONTEXT_DC_B'); const namespace = required('QUAL_KUBE_NAMESPACE');
if (!/^[A-Za-z0-9_.-]+$/.test(namespace)) throw new Error('Unsafe QUAL_KUBE_NAMESPACE');
const scenarios = JSON.parse(required('QUAL_DRILL_COMMANDS_JSON')); if (!Array.isArray(scenarios) || !scenarios.length) throw new Error('QUAL_DRILL_COMMANDS_JSON must be a non-empty array');
const results = [];
for (const scenario of scenarios) {
  if (!scenario?.name || !['dc-a', 'dc-b'].includes(scenario.site) || !Array.isArray(scenario.kubectlArgs) || scenario.kubectlArgs.some((arg) => typeof arg !== 'string')) throw new Error('Invalid drill scenario');
  const context = scenario.site === 'dc-a' ? contextA : contextB; const before = Date.now();
  const run = spawnSync('kubectl', ['--context', context, '--namespace', namespace, ...scenario.kubectlArgs], { encoding: 'utf8', timeout: 120_000 });
  results.push({ name: scenario.name, site: scenario.site, exitCode: run.status, durationMs: Date.now() - before, stderr: run.stderr.slice(0, 1000) });
}
const checks = results.map((item) => ({ name: item.name, passed: item.exitCode === 0, actual: item.exitCode }));
const output = await evidence('failure-drill', startedAt, checks, { scenarios: results }, { contexts: [contextA, contextB], namespace });
console.log(JSON.stringify({ evidence: output.path, passed: output.result.passed })); if (!output.result.passed) process.exitCode = 2;
