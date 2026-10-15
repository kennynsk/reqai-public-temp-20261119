import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildDecomposePrompt, buildInsightsPrompt } from '../decomposer-prompts.js';
import { createPromptCatalog, defaultPromptBundleRoot } from '../src/prompts/prompt-catalog.js';
import { createPromptProfileResolver } from '../src/prompts/prompt-profile-resolver.js';
import { getOutputContract, outputContractIds } from '../src/prompts/output-contract-registry.js';
import { qualifyPromptCatalog } from '../src/prompts/prompt-qualification.js';

const policy = {
  'requirements-decomposition': { active: '1.0.0', released: ['1.0.0'] },
  'requirements-insights': { active: '1.0.0', released: ['1.0.0'] },
};

test('research snapshots all five directions and a separate budget while decomposition remains bounded to four minutes', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const resolver = createPromptProfileResolver({ catalog, policy: {
    'requirements-decomposition': { active: '2.11.0', released: ['2.11.0'] },
    'requirements-insights': { active: '2.12.0', released: ['2.12.0'] },
  } });
  const decomp = resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const research = resolver.resolve({ type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS' });
  assert.equal(decomp.performanceBudgetMs, 240000);
  assert.equal(research.performanceBudgetMs, 900000);
  assert.deepEqual(research.requiredResearchCategories, ['trends', 'patterns', 'risks', 'competitors', 'standards']);
  const prompt = catalog.render(research, 'insights', { babokIdentifierSet: '[]', businessContext: 'Сервис расчётов', requirementsSection: '{}', reviewContext: '{}', supportingMaterials: '[]' }).text;
  assert.match(prompt, /текущим знаниям LLM/);
  assert.match(prompt, /Обязательно охвати ВСЕ ПЯТЬ/);
  assert.doesNotMatch(prompt, /допустима только при соответствующих предоставленных материалах/);
  assert.match(catalog.get('requirements-insights', '2.12.0').templates['semantic-audit'].text, /явно помеченное знание модели|ясно помеченное знание модели/);
});

test('decomposition matches its builder and the historical insights release remains immutable', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const resolver = createPromptProfileResolver({ catalog, policy });
  const decomposition = resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  assert.equal(decomposition.id, 'requirements-decomposition');
  assert.deepEqual(Object.keys(decomposition.templates), ['decompose']);
  assert.equal(catalog.render(decomposition, 'decompose', { businessContext: 'Цель' }).text, buildDecomposePrompt('Цель'));

  const insights = resolver.resolve({ type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS' });
  assert.equal(insights.id, 'requirements-insights');
  const requirements = { business: [{ id: 'BT-1', text: 'Рост' }], functional: [], nonfunctional: [] };
  const section = `\nТекущие требования:\n${JSON.stringify(requirements, null, 2)}`;
  const historical = catalog.render(insights, 'insights', { businessContext: 'Контекст', requirementsSection: section }).text;
  assert.ok(historical.includes(section));
  assert.match(historical, /массив может быть пустым если инсайт только усиливает существующие/);
  // The unversioned builder evolved; do not rewrite retained 1.0.0 to match it.
  assert.notEqual(historical, buildInsightsPrompt('Контекст', requirements));

  assert.throws(() => resolver.resolve({ type: 'RESEARCH', mode: 'AGENT_RESEARCH' }), (error) => error.code === 'PROMPT_PROFILE_UNSUPPORTED');
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
  assert.deepEqual(outputContractIds(), ['babok-requirements.v1', 'decomposition.v1', 'requirements-insights.v1']);
  assert.deepEqual(getOutputContract('decomposition.v1').parse('{"business":[]}'), { business: [] });
  assert.throws(() => catalog.render({ ...resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' }), version: '9.9.9' }, 'decompose', { businessContext: 'x' }), (error) => error.code === 'PROMPT_BUNDLE_UNAVAILABLE');
});

test('BABOK prompt releases qualify and stay within the rendered artifact budget', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot(), maxRenderedBytes: 2_097_152 });
  const babokPolicy = {
    'requirements-decomposition': { active: '2.2.0', released: ['1.0.0', '2.0.0', '2.1.0', '2.2.0'] },
    'requirements-insights': { active: '2.0.0', released: ['1.0.0', '2.0.0'] },
  };
  const qualified = qualifyPromptCatalog({ catalog, policy: babokPolicy });
  assert.equal(qualified.filter((item) => item.active).length, 2);
  assert.equal(qualified.find((item) => item.id === 'requirements-decomposition' && item.version === '2.2.0').outputSchemaVersion, 'babok-requirements.v1');
  assert.equal(qualified.find((item) => item.id === 'requirements-insights' && item.version === '2.0.0').outputSchemaVersion, 'requirements-insights.v1');

  const resolver = createPromptProfileResolver({ catalog, policy: babokPolicy });
  const decomposition = resolver.resolve({ type: 'DECOMPOSITION', mode: 'DECOMPOSITION' });
  const decompositionVariables = {
    baselineMaterial: 'NOT_PROVIDED',
    businessContext: 'Сократить срок обработки заявок.',
    chunkContext: '{"chunkId":"chunk-001","section":"§1"}',
    materialDescriptors: '{"primary":{"artifactId":"primary-001"}}',
    referenceMaterials: '[]',
    sourceMaterial: 'Сократить срок обработки заявок.',
  };
  const renderedDecompose = catalog.render(decomposition, 'decompose', decompositionVariables).text;
  const renderedConsolidate = catalog.render(decomposition, 'consolidate', {
    baselineMaterial: 'NOT_PROVIDED',
    businessContext: decompositionVariables.businessContext,
    consolidationContext: '{"failedChunks":[]}',
    materialDescriptors: decompositionVariables.materialDescriptors,
    referenceMaterials: '[]',
    sectionArtifacts: '[{"artifactId":"section-001"}]',
  }).text;
  const insights = resolver.resolve({ type: 'RESEARCH', mode: 'REQUIREMENTS_INSIGHTS' });
  const renderedInsights = catalog.render(insights, 'insights', {
    babokIdentifierSet: '["BR-001","FR-001"]',
    businessContext: decompositionVariables.businessContext,
    requirementsSection: '{"schemaVersion":"babok-requirements.v1","groups":{"BR":[],"SR":[],"FR":[]}}',
  }).text;
  for (const rendered of [renderedDecompose, renderedConsolidate, renderedInsights]) {
    assert.ok(Buffer.byteLength(rendered, 'utf8') < 2_097_152);
  }
  const largeSource = 'Большой входной материал. '.repeat(18_000);
  const largeRendered = catalog.render(decomposition, 'decompose', { ...decompositionVariables, sourceMaterial: largeSource }).text;
  assert.ok(Buffer.byteLength(largeRendered, 'utf8') < 2_097_152);
  assert.throws(
    () => catalog.render(decomposition, 'decompose', { ...decompositionVariables, sourceMaterial: 'x'.repeat(2_100_000) }),
    (error) => error.type === 'PROMPT_RENDER_TOO_LARGE',
  );
  assert.match(renderedDecompose, /babok-requirements\.v1/);
  assert.match(renderedDecompose, /Закон, договор,\s+стандарт, политика/);
  assert.match(renderedDecompose, /Не\s+объединяй альтернативные результаты/);
  assert.match(renderedDecompose, /миграция,\s+перенос, обучение/);
  assert.match(renderedInsights, /targetType/);
});

test('structured GAP references are compatible with the quality enum during generation, independent audit and repair', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  const bundle = catalog.get('requirements-decomposition', '2.12.0');
  for (const step of ['decompose', 'semantic-audit', 'semantic-repair']) {
    assert.match(bundle.templates[step].text, /analysis.GAP перечисляет requirement.id в affectedIds/);
    assert.match(bundle.templates[step].text, /Общий пробел НФТ сам по себе не делает/);
    assert.match(bundle.templates[step].text, /точное значение перечисления/);
  }
  assert.equal(bundle.performanceBudgetMs, 240000);
});


test('research 2.15 preserves frozen releases and guides decision-focused copy through repair', () => {
  const catalog = createPromptCatalog({ rootDir: defaultPromptBundleRoot() });
  for (const step of ['insights', 'review', 'semantic-repair']) {
    const text = catalog.get('requirements-insights', '2.15.0').templates[step].text;
    assert.match(text, /показатель успеха/);
    assert.match(text, /не повторяй summary/);
    assert.match(text, /хотя бы одно реально отличающееся/);
    assert.match(text, /неподтверждённое утверждение/);
  }
  assert.equal(catalog.get('requirements-insights', '2.13.0').version, '2.13.0');
});
