import { access, readFile, readdir } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);

const forbiddenByFile = new Map([
  ['client/src/App.jsx', ['BizReqResearcher', 'RequirementsDecomposer']],
  ['client/src/AsyncJobWorkspace.jsx', ['Дополнительные инструменты', 'start_research']],
  ['server/src/routes/api-v1-routes.js', ["router.post('/api/v1/research'", 'standalone-research']],
  ['server/src/workflows/index.js', ['DECOMPOSITION_WITH_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST', 'requirements-synthesis']],
  ['server/src/activities/enterprise-handlers.js', ['analyzeCategories', 'researchCategory', 'synthesizeResearch', 'improveRequirements', 'promptTest']],
  ['server/src/config/env.js', ['TEMPORAL_TASK_QUEUE_SYNTHESIS', 'JOB_MAX_RESEARCH_CATEGORIES', 'LLM_CATEGORY_CONCURRENCY', 'PROMPT_STANDARD_RESEARCH', 'PROMPT_AGENT_RESEARCH', 'PROMPT_LEGACY_DECOMPOSITION_WITH_INSIGHTS']],
  ['mcp-gateway/src/schemas.js', ['start_research']],
  ['mcp-gateway/src/tools.js', ['start_research']],
  ['mcp-gateway/src/rest-client.js', ['start_research', 'startResearch']],
  ['compose.yaml', ['synthesis-worker', 'requirements-synthesis', 'MCP_TOOL_SCHEMA_VERSION: 1.0.0']],
  ['deploy/k8s/workers.yaml', ['synthesis-worker', 'requirements-synthesis']],
  ['deploy/k8s/platform.yaml', ['TEMPORAL_TASK_QUEUE_SYNTHESIS', 'JOB_MAX_RESEARCH_CATEGORIES']],
]);

const activeDocs = [
  'README.md',
  'docs/functional-parity.md',
  'docs/requirements-integration-api.md',
  'docs/mcp-requirements-adapter.md',
  'docs/mcp-qualification.md',
  'docs/configuration.md',
  'docs/prompt-bundles.md',
  'docs/local-development.md',
  'docs/qualification.md',
];
const retiredMarkers = ['Дополнительные инструменты', '/api/v1/research', 'start_research', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST', 'DECOMPOSITION_WITH_INSIGHTS'];
for (const file of activeDocs) forbiddenByFile.set(file, retiredMarkers);

const removedPaths = [
  'client/src/BizReqResearcher.jsx',
  'client/src/RequirementsDecomposer.jsx',
  'server/src/legacy-app.js',
  'server/prompts.js',
];

const failures = [];
for (const [path, markers] of forbiddenByFile) {
  const source = await readFile(new URL(path, root), 'utf8');
  for (const marker of markers) if (source.includes(marker)) failures.push(`${path}: contains ${marker}`);
}
for (const path of removedPaths) {
  try {
    await access(new URL(path, root));
    failures.push(`${path}: removed file still exists`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const bundles = [];
for (const entry of (await readdir(new URL('server/prompt-bundles/', root), { withFileTypes: true })).filter((candidate) => candidate.isDirectory())) {
  const versions = await readdir(new URL(`server/prompt-bundles/${entry.name}/`, root), { withFileTypes: true });
  if (versions.some((version) => version.isDirectory())) bundles.push(entry.name);
}
bundles.sort();
const expectedBundles = ['requirements-decomposition', 'requirements-insights'];
if (JSON.stringify(bundles) !== JSON.stringify(expectedBundles)) failures.push(`prompt bundle inventory is ${JSON.stringify(bundles)}`);

if (failures.length) {
  process.stderr.write(`Legacy surface qualification failed:\n- ${failures.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ qualified: true, promptBundles: bundles, removedPaths }, null, 2)}\n`);
}
