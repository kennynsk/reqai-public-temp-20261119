import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildDecomposePrompt, buildInsightsPrompt } from '../decomposer-prompts.js';
import { buildAgentAnalyzePrompt, buildAgentResearchPrompt, buildAnalyzePrompt, buildResearchPrompt } from '../prompts.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../src/prompts/prompt-profile-resolver.js';
import { getOutputContract, outputContractIds } from '../src/prompts/output-contract-registry.js';

const policy = {
  'requirements-decomposition': { active: '1.0.0', released: ['1.0.0'] },
  'legacy-decomposition-with-insights': { active: '1.0.0', released: ['1.0.0'] },
  'requirements-insights': { active: '1.0.0', released: ['1.0.0'] },
  'standard-research': { active: '1.0.0', released: ['1.0.0'] },
  'agent-research': { active: '1.0.0', released: ['1.0.0'] },
};

test('initial prompt bundles render byte-for-byte like legacy builders', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const resolver = createPromptProfileResolver({ catalog, policy });
  const decomposition = resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  assert.equal(decomposition.id, 'requirements-decomposition');
  assert.deepEqual(Object.keys(decomposition.templates), ['decompose']);
  assert.equal(catalog.render(decomposition, 'decompose', { businessContext: 'Цель' }).text, buildDecomposePrompt('Цель'));

  const legacyCombined = resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION_WITH_INSIGHTS' });
  assert.equal(legacyCombined.id, 'legacy-decomposition-with-insights');
  assert.deepEqual(Object.keys(legacyCombined.templates), ['decompose', 'insights']);

  const insights = resolver.resolve({ type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS' });
  assert.equal(insights.id, 'requirements-insights');
  const requirements = { business: [{ id: 'BT-1', text: 'Рост' }], functional: [], nonfunctional: [] };
  const section = `\nТекущие требования:\n${JSON.stringify(requirements, null, 2)}`;
  assert.equal(catalog.render(insights, 'insights', { businessContext: 'Контекст', requirementsSection: section }).text, buildInsightsPrompt('Контекст', requirements));

  const standard = resolver.resolve({ type: 'RESEARCH', mode: 'STANDARD_RESEARCH' });
  assert.equal(catalog.render(standard, 'analyze', { requirements: 'R' }).text, buildAnalyzePrompt('R'));
  assert.equal(catalog.render(standard, 'research-trends', { name: 'N', description: 'D', level: 'L', requirements: 'R' }).text, buildResearchPrompt('trends', 'N', 'D', 'L', 'R'));

  const agent = resolver.resolve({ type: 'RESEARCH', mode: 'AGENT_RESEARCH' });
  assert.equal(catalog.render(agent, 'agent-analyze', { requirements: 'R' }).text, buildAgentAnalyzePrompt('R'));
  assert.equal(catalog.render(agent, 'agent-research', { name: 'N', description: 'D', level: 'L', requirements: 'R' }).text, buildAgentResearchPrompt({ name: 'N', description: 'D', level: 'L', originalRequirements: 'R' }));
});

test('catalog fails closed on altered templates and renderer enforces exact variables', async () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const resolver = createPromptProfileResolver({ catalog, policy });
  const profile = resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  assert.throws(() => catalog.render(profile, 'decompose', {}), /exactly match/);
  assert.throws(() => catalog.render(profile, 'decompose', { businessContext: 'x', template: 'evil' }), /exactly match/);

  const temporary = await mkdtemp(join(tmpdir(), 'reqai-prompts-'));
  await cp(defaultPromptBundleRoot(), temporary, { recursive: true });
  const path = join(temporary, 'requirements-decomposition/1.0.0/decompose.md');
  await writeFile(path, `${await readFile(path, 'utf8')}changed`, 'utf8');
  assert.throws(() => createPromptCatalog({ rootDir: temporary }), /hash mismatch/);
});

test('profile policy rejects unreleased versions and contracts are explicit', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const resolver = createPromptProfileResolver({ catalog, policy });
  assert.throws(() => resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION', requestedVersion: '2.0.0' }), (error) => error.code === 'PROMPT_VERSION_NOT_RELEASED');
  assert.deepEqual(outputContractIds(), ['agent-research.v1', 'decomposition.v1', 'requirements-insights.v1', 'standard-research.v1']);
  assert.deepEqual(getOutputContract('decomposition.v1').parse('{"business":[]}'), { business: [] });
  assert.throws(() => catalog.render({ ...resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' }), version: '9.9.9' }, 'decompose', { businessContext: 'x' }), (error) => error.code === 'PROMPT_BUNDLE_UNAVAILABLE');
});
