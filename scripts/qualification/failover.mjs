import { spawnSync } from 'node:child_process';
import { api, evidence, integer, required, sleep, tokens } from './lib.mjs';

if (process.env.QUAL_ALLOW_DISRUPTION !== 'YES-I-UNDERSTAND') throw new Error('QUAL_ALLOW_DISRUPTION=YES-I-UNDERSTAND is required');
const startedAt = new Date().toISOString(); const [token] = await tokens(1); const command = JSON.parse(required('QUAL_FAILOVER_COMMAND_JSON')); const probeIntervalMs = integer('QUAL_PROBE_INTERVAL_MS', 1000); const maxSeconds = integer('QUAL_FAILOVER_MAX_SECONDS', 1800);
if (!Array.isArray(command) || command.length < 2) throw new Error('QUAL_FAILOVER_COMMAND_JSON must be an argv array');
const before = await api('/health/ready', token); const triggerAt = Date.now(); const trigger = spawnSync(command[0], command.slice(1), { encoding: 'utf8', timeout: 120_000 }); const probes = [];
while (Date.now() - triggerAt <= maxSeconds * 1000) { const probe = await api('/health/ready', token); probes.push({ at: new Date().toISOString(), status: probe.status, durationMs: probe.durationMs }); if (probe.status === 200 && probes.some((item) => item.status !== 200)) break; await sleep(probeIntervalMs); }
const firstFailure = probes.findIndex((probe) => probe.status !== 200); const recovered = probes.findIndex((probe, index) => index > firstFailure && probe.status === 200); const rtoSeconds = recovered >= 0 ? (new Date(probes[recovered].at) - new Date(probes[Math.max(firstFailure, 0)].at)) / 1000 : null;
const observedGapSeconds = probes.filter((probe) => probe.status !== 200).length * probeIntervalMs / 1000;
const checks = [
  { name: 'pre-drill-ready', passed: before.status === 200, actual: before.status },
  { name: 'failover-trigger', passed: trigger.status === 0, actual: trigger.status },
  { name: 'availability-design', passed: observedGapSeconds <= maxSeconds * 0.005, actualGapSeconds: observedGapSeconds, targetPercent: 99.5 },
  { name: 'rto', passed: rtoSeconds != null && rtoSeconds <= 1800, actualSeconds: rtoSeconds, expectedMax: 1800 },
  { name: 'rpo', passed: process.env.QUAL_MEASURED_RPO_SECONDS && Number(process.env.QUAL_MEASURED_RPO_SECONDS) <= 300, actualSeconds: Number(process.env.QUAL_MEASURED_RPO_SECONDS), expectedMax: 300 },
];
const output = await evidence('dc-failover', startedAt, checks, { probes, rtoSeconds, observedGapSeconds }, { triggerOutput: trigger.stdout.slice(0, 1000) });
console.log(JSON.stringify({ evidence: output.path, passed: output.result.passed })); if (!output.result.passed) process.exitCode = 2;
