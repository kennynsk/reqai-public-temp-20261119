import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDecomposePrompt, buildInsightsPrompt } from '../decomposer-prompts.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../prompt-bundles');
const token = (name) => `__REQAI_${name}__`;
const substitute = (text, names) => names.reduce((value, name) => value.replaceAll(token(name), `{{${name}}}`), text);
const hash = (text) => createHash('sha256').update(text).digest('hex');

function insightTemplate() {
  const value = buildInsightsPrompt(token('businessContext'), null);
  return substitute(value.replace(`${token('businessContext')}\n\n</input>`, `${token('businessContext')}\n${token('requirementsSection')}\n</input>`), ['businessContext', 'requirementsSection']);
}

const bundles = [
  { id: 'requirements-decomposition', purposes: ['DECOMPOSITION'], output: 'decomposition.v1', templates: {
    decompose: { text: substitute(buildDecomposePrompt(token('businessContext')), ['businessContext']), variables: ['businessContext'] },
  } },
  { id: 'requirements-insights', purposes: ['REQUIREMENTS_INSIGHTS'], output: 'requirements-insights.v1', templates: { insights: { text: insightTemplate(), variables: ['businessContext', 'requirementsSection'] } } },
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
