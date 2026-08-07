import { createHash, randomUUID } from 'node:crypto';

const baseUrl = process.env.REQAI_BASE_URL || 'http://localhost:5178';
const requested = String(process.argv[2] || 'DECOMPOSITION_WITH_INSIGHTS').toUpperCase();
const aliases = { DECOMPOSITION: 'DECOMPOSITION_WITH_INSIGHTS', RESEARCH: 'AGENT_RESEARCH' };
const mode = aliases[requested] || requested;
const modes = new Set(['DECOMPOSITION_WITH_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST']);
if (!modes.has(mode)) throw new Error(`Unsupported local E2E mode: ${mode}`);
const type = mode === 'DECOMPOSITION_WITH_INSIGHTS' ? 'DECOMPOSITION' : 'RESEARCH';

async function json(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${JSON.stringify(body)}`);
  return body;
}

const capabilities = await json(await fetch(`${baseUrl}/api/v1`));
const availableModels = capabilities.capabilities?.models || [];
if (!availableModels.length) throw new Error('API returned an empty model catalog');
const primaryModel = availableModels[0];
const secondaryModel = availableModels[1] || primaryModel;

const requirementsText = `
Создать production enterprise платформу анализа требований.
Frontend инициирует длительную задачу через REST API и может отключиться.
Backend обязан завершить задачу, пережить перезапуск worker и предоставить историю и результат.
Нагрузка: 100 одновременных пользователей и 30 новых задач в минуту.
`;
const requirements = Buffer.from(mode === 'PROMPT_TEST'
  ? JSON.stringify({ systemPrompt: 'Ты системный аналитик.', userPrompt: `Проверь требования:\n${requirementsText}` })
  : requirementsText, 'utf8');
const options = {
  mode,
  model: primaryModel,
  temperature: 0.2,
  allCategories: false,
  ...(mode === 'STANDARD_RESEARCH' || mode === 'AGENT_COMPARE' ? { researchKinds: ['trends', 'competitors', 'practices'] } : {}),
  ...(mode === 'MODEL_COMPARE' ? {
    compareTarget: 'RESEARCH', researchKind: 'trends', researchCategories: ['Надёжное длительное выполнение'],
    variantA: { model: primaryModel, temperature: 0.1 }, variantB: { model: secondaryModel, temperature: 0.8 },
  } : {}),
  ...(mode === 'PROMPT_TEST' ? { inputFormat: 'PROMPT_JSON' } : {}),
};

const artifact = await json(await fetch(`${baseUrl}/api/v1/artifacts`, {
  method: 'POST',
  headers: {
    'content-type': mode === 'PROMPT_TEST' ? 'application/json' : 'text/plain; charset=utf-8',
    'x-content-sha256': createHash('sha256').update(requirements).digest('hex'),
  },
  body: requirements,
}));

const accepted = await json(await fetch(`${baseUrl}/api/v1/jobs`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'idempotency-key': `local-e2e-${mode.toLowerCase()}-${randomUUID()}`,
  },
  body: JSON.stringify({ type, inputArtifactId: artifact.artifactId, options }),
}));

const deadline = Date.now() + 90_000;
let status;
while (Date.now() < deadline) {
  status = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}`));
  if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(status.status)) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (status?.status !== 'SUCCEEDED') throw new Error(`Job did not succeed: ${JSON.stringify(status)}`);

const result = await json(await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}/result`));
const contentResponse = await fetch(`${baseUrl}/api/v1/jobs/${accepted.jobId}/result/content`);
if (!contentResponse.ok) throw new Error(`Result content failed with ${contentResponse.status}`);
const content = await contentResponse.text();
let parsedContent;
try { parsedContent = JSON.parse(content); } catch { parsedContent = content; }

process.stdout.write(`${JSON.stringify({ artifact, accepted, status, result, content: parsedContent }, null, 2)}\n`);
