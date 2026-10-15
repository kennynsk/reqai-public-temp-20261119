import { randomUUID, createHash } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { collectRequirements, json, readResult, summarizeJob, verifyModel, waitForJob } from './requirements-e2e-helpers.mjs';

const baseUrl = process.env.REQAI_BASE_URL || 'http://localhost:5178';
const mcpUrl = process.env.REQAI_MCP_URL || 'http://localhost:5180/mcp';
const model = process.env.REQAI_E2E_MODEL || 'glm-5.3-flash';
const token = process.env.REQAI_MCP_TOKEN || 'local-e2e-token';
const businessContext = process.env.REQAI_E2E_TASK || `
Разработать внутренний сервис согласования командировок. Сотрудник создаёт заявку с целью,
датами, маршрутом и сметой; руководитель согласует или возвращает на доработку; финансовый
контролёр проверяет бюджетные лимиты. Нужны SLA согласования, уведомления, история изменений,
аудит действий, разграничение доступа и отчётность по подразделениям.
`.trim();

const client = new Client({ name: 'reqai-live-qualification', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), { requestInit: { headers: { authorization: `Bearer ${token}` } } });
await client.connect(transport);

async function call(name, args) {
  const response = await client.callTool({ name, arguments: args });
  if (response.isError || response.structuredContent?.error) throw new Error(`${name} failed: ${response.structuredContent?.error?.code || 'MCP_TOOL_ERROR'}`);
  return response.structuredContent;
}

try {
  const listed = await client.listTools();
  const tools = listed.tools.map((tool) => tool.name);
  const expectedTools = ['decompose_requirements', 'research_requirements', 'get_task_status', 'get_task_result'];
  if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) throw new Error(`Unexpected MCP tools: ${JSON.stringify(tools)}`);
  if (listed.tools.some((tool) => tool._meta?.['reqai/toolSchemaVersion'] !== '3.0.0')) throw new Error('MCP client requires tool schema 3.0.0');

  const material = await json(await fetch(`${baseUrl}/api/v1/artifacts`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'text/plain', 'X-Content-SHA256': createHash('sha256').update(businessContext).digest('hex') }, body: businessContext }));
  const decomposition = await call('decompose_requirements', {
    idempotencyKey: `mcp-decompose-${randomUUID()}`,
    inputArtifactId: material.artifactId,
    promptVersion: '2.17.0',
    model,
    temperature: 0.2,
  });
  const readMcpStatus = (jobId) => call('get_task_status', { jobId });
  const decompositionStatus = await waitForJob(baseUrl, decomposition.jobId, readMcpStatus);
  const decompositionMetadata = await call('get_task_result', { jobId: decomposition.jobId });
  verifyModel(decompositionMetadata, model);
  const raw = { content: await (await fetch(`${baseUrl}/api/v1/jobs/${decomposition.jobId}/result/content?format=raw`, { headers: { authorization: `Bearer ${token}` } })).text() };
  const decompositionResult = { metadata: decompositionMetadata, content: JSON.parse(raw.content) };
  const report = { content: await (await fetch(`${baseUrl}/api/v1/jobs/${decomposition.jobId}/result/content?format=markdown`, { headers: { authorization: `Bearer ${token}` } })).text() };
  if ((report.content.match(/^## /gm) || []).length !== 12) throw new Error('Expected 12 BABOK report sections');
  const registry = decompositionResult.content;
  const requirements = registry.schemaVersion === 'babok-requirements.v1' ? registry : collectRequirements(registry);
  if (!Object.values(registry.groups || requirements).some((items) => Array.isArray(items) && items.length)) throw new Error('MCP decomposition returned no requirements to save');

  // Version persistence is a REST domain resource; MCP starts and metadata stay on the four-tool surface.
  const version = await json(await fetch(`${baseUrl}/api/v1/requirements/versions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sourceJobId: decomposition.jobId, ...(registry.schemaVersion === 'babok-requirements.v1' ? { registry } : { requirements }), decisions: { qualification: 'direct-mcp' } }),
  }));
  const research = await call('research_requirements', {
    idempotencyKey: `mcp-research-${randomUUID()}`,
    versionId: version.versionId,
    model,
    temperature: 0.2,
  });
  const researchStatus = await waitForJob(baseUrl, research.jobId, readMcpStatus);
  const researchMetadata = await call('get_task_result', { jobId: research.jobId });
  verifyModel(researchMetadata, model);
  const researchResult = await readResult(baseUrl, research.jobId);

  process.stdout.write(`${JSON.stringify({
    channel: 'direct-mcp', requestedModel: model, tools,
    decomposition: summarizeJob(decompositionStatus, { ...decompositionResult, metadata: decompositionMetadata }),
    versionId: version.versionId,
    research: summarizeJob(researchStatus, { ...researchResult, metadata: researchMetadata }),
  }, null, 2)}\n`);
} finally {
  await client.close();
}
