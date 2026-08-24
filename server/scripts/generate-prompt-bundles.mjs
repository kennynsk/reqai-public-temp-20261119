import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDecomposePrompt, buildInsightsPrompt } from '../decomposer-prompts.js';
import { buildAnalyzePrompt, buildAgentAnalyzePrompt, buildAgentImproveRequirementsPrompt, buildAgentResearchPrompt, buildAgentSynthesisPrompt, buildImproveRequirementsPrompt, buildResearchPrompt } from '../prompts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../prompt-bundles');
const token = (name) => `__REQAI_${name}__`;
const substitute = (text, names) => names.reduce((value, name) => value.replaceAll(token(name), `{{${name}}}`), text);
const hash = (text) => createHash('sha256').update(text).digest('hex');

function insightTemplate() {
  const value = buildInsightsPrompt(token('businessContext'), null);
  return substitute(value.replace(`${token('businessContext')}\n\n</input>`, `${token('businessContext')}\n${token('requirementsSection')}\n</input>`), ['businessContext', 'requirementsSection']);
}

const commonResearch = {
  analyze: { text: substitute(buildAnalyzePrompt(token('requirements')), ['requirements']), variables: ['requirements'] },
  'research-trends': { text: substitute(buildResearchPrompt('trends', token('name'), token('description'), token('level'), token('requirements')), ['name', 'description', 'level', 'requirements']), variables: ['name', 'description', 'level', 'requirements'] },
  'research-competitors': { text: substitute(buildResearchPrompt('competitors', token('name'), token('description'), token('level'), token('requirements')), ['name', 'description', 'level', 'requirements']), variables: ['name', 'description', 'level', 'requirements'] },
  'research-practices': { text: substitute(buildResearchPrompt('practices', token('name'), token('description'), token('level'), token('requirements')), ['name', 'description', 'level', 'requirements']), variables: ['name', 'description', 'level', 'requirements'] },
  improve: { text: substitute(buildImproveRequirementsPrompt(token('requirements'), [token('researchReport')]), ['requirements', 'researchReport']), variables: ['requirements', 'researchReport'] },
  'agent-analyze': { text: substitute(buildAgentAnalyzePrompt(token('requirements')), ['requirements']), variables: ['requirements'] },
  'agent-research': { text: substitute(buildAgentResearchPrompt({ name: token('name'), description: token('description'), level: token('level'), originalRequirements: token('requirements') }), ['name', 'description', 'level', 'requirements']), variables: ['name', 'description', 'level', 'requirements'] },
  'agent-improve': { text: substitute(buildAgentImproveRequirementsPrompt(token('requirements'), token('researchReport')), ['requirements', 'researchReport']), variables: ['requirements', 'researchReport'] },
  synthesis: { text: substitute(buildAgentSynthesisPrompt(token('requirements'), token('combinedReport'), token('metadata')), ['requirements', 'combinedReport', 'metadata']), variables: ['requirements', 'combinedReport', 'metadata'] },
};

const bundles = [
  { id: 'requirements-decomposition', purposes: ['DECOMPOSITION'], output: 'decomposition.v1', templates: {
    decompose: { text: substitute(buildDecomposePrompt(token('businessContext')), ['businessContext']), variables: ['businessContext'] },
  } },
  { id: 'legacy-decomposition-with-insights', purposes: ['DECOMPOSITION_WITH_INSIGHTS'], output: 'decomposition.v1', templates: {
    decompose: { text: substitute(buildDecomposePrompt(token('businessContext')), ['businessContext']), variables: ['businessContext'] },
    insights: { text: insightTemplate(), variables: ['businessContext', 'requirementsSection'] },
  } },
  { id: 'requirements-insights', purposes: ['REQUIREMENTS_INSIGHTS'], output: 'requirements-insights.v1', templates: { insights: { text: insightTemplate(), variables: ['businessContext', 'requirementsSection'] } } },
  { id: 'standard-research', purposes: ['STANDARD_RESEARCH', 'MODEL_COMPARE'], output: 'standard-research.v1', templates: commonResearch },
  { id: 'agent-research', purposes: ['AGENT_RESEARCH', 'AGENT_COMPARE'], output: 'agent-research.v1', templates: commonResearch },
];

for (const bundle of bundles) {
  const dir = resolve(root, bundle.id, '1.0.0');
  await mkdir(dir, { recursive: true });
  const templates = {};
  for (const [step, value] of Object.entries(bundle.templates)) {
    const path = `${step}.md`;
    await writeFile(resolve(dir, path), value.text, 'utf8');
    const requiredVariables = [...new Set([...value.text.matchAll(/{{([A-Za-z][A-Za-z0-9]*)}}/g)].map((match) => match[1]))];
    templates[step] = { path, requiredVariables, sha256: hash(value.text) };
  }
  await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify({ id: bundle.id, version: '1.0.0', workflowPurposes: bundle.purposes, outputSchemaVersion: bundle.output, templates }, null, 2)}\n`, 'utf8');
}
