import { randomUUID } from 'node:crypto';

import { collectRequirements, json, readResult, summarizeJob, verifyModel, waitForJob } from './requirements-e2e-helpers.mjs';

const baseUrl = process.env.REQAI_BASE_URL || 'http://localhost:5178';
const model = process.env.REQAI_E2E_MODEL || 'glm-5.3-flash';
const scenario = String(process.argv[2] || 'FULL').toUpperCase();
if (!new Set(['DECOMPOSITION', 'RESEARCH', 'FULL']).has(scenario)) throw new Error(`Unsupported local E2E scenario: ${scenario}`);

const businessContext = process.env.REQAI_E2E_TASK || `
Разработать внутренний сервис согласования командировок. Сотрудник создаёт заявку с целью,
датами, маршрутом и сметой; руководитель согласует или возвращает на доработку; финансовый
контролёр проверяет бюджетные лимиты. Нужны SLA согласования, уведомления, история изменений,
аудит действий, разграничение доступа и отчётность по подразделениям.
`.trim();

const capabilities = await json(await fetch(`${baseUrl}/api/v1`));
if (!capabilities.capabilities?.models?.includes(model)) throw new Error(`Model ${model} is absent from the API model catalog`);

const decomposition = await json(await fetch(`${baseUrl}/api/v1/decompositions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'idempotency-key': `api-decompose-${randomUUID()}` },
  body: JSON.stringify({ businessContext, model, temperature: 0.2 }),
}));
const decompositionStatus = await waitForJob(baseUrl, decomposition.jobId);
const decompositionResult = await readResult(baseUrl, decomposition.jobId);
verifyModel(decompositionResult.metadata, model);

const evidence = { channel: 'direct-api', requestedModel: model, decomposition: summarizeJob(decompositionStatus, decompositionResult) };

if (scenario !== 'DECOMPOSITION') {
  const content = decompositionResult.content;
  const registry = content?.schemaVersion === 'babok-requirements.v1' ? content : null;
  const requirements = registry ? null : collectRequirements(content);
  if (!Object.values(registry?.groups || requirements).some((items) => Array.isArray(items) && items.length)) throw new Error('Decomposition returned no requirements to save');
  const version = await json(await fetch(`${baseUrl}/api/v1/requirements/versions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sourceJobId: decomposition.jobId, ...(registry ? { registry } : { requirements }), decisions: { qualification: 'direct-api' } }),
  }));
  const research = await json(await fetch(`${baseUrl}/api/v1/requirements/versions/${version.versionId}/research`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': `api-research-${randomUUID()}` },
    body: JSON.stringify({ model, temperature: 0.2 }),
  }));
  const researchStatus = await waitForJob(baseUrl, research.jobId);
  const researchResult = await readResult(baseUrl, research.jobId);
  verifyModel(researchResult.metadata, model);
  evidence.versionId = version.versionId;
  evidence.research = summarizeJob(researchStatus, researchResult);
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
