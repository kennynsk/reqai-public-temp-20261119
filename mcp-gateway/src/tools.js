import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GatewayError } from './rest-client.js';
import { TOOL_DEFINITIONS } from './schemas.js';
import { safeLog } from './redaction.js';

const OPERATIONS = Object.freeze({
  upload_artifact: 'uploadArtifact',
  cancel_task: 'cancelTask',
  decompose_requirements: 'decompose',
  research_requirements: 'researchRequirements',
  get_task_status: 'getStatus',
  get_task_result: 'getResult',
  get_task_result_content: 'getResultContent',
});

function gatewayError(error) {
  if (error instanceof GatewayError) return error;
  return new GatewayError({ code: 'MCP_INTERNAL_ERROR', message: 'MCP gateway failed to process the request', retryable: false });
}

function resultContent(value, isError = false) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value, ...(isError ? { isError: true } : {}) };
}

export function createRequirementsMcpServer({ client, token, config, metrics, clock = () => Date.now() }) {
  const server = new McpServer({ name: 'reqai-requirements', version: config.buildVersion }, {
    capabilities: { tools: {} },
    instructions: `ReqAI requirements tools; schema ${config.schemaVersion}. Start operations are asynchronous and return canonical job references. After a job succeeds, call get_task_result_content with format=markdown to read the full human-readable requirements report.`,
  });

  for (const [name, definition] of Object.entries(TOOL_DEFINITIONS)) {
    server.registerTool(name, {
      title: name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      annotations: {
        readOnlyHint: name.startsWith('get_'),
        destructiveHint: name === 'cancel_task',
        idempotentHint: name.startsWith('get_'),
        openWorldHint: false,
      },
      _meta: { 'reqai/toolSchemaVersion': config.schemaVersion, 'reqai/asynchronous': ['decompose_requirements', 'research_requirements', 'cancel_task'].includes(name) },
    }, async (input) => {
      const started = clock();
      try {
        const payload = await client[OPERATIONS[name]](token, input);
        const validated = definition.successSchema.safeParse(payload);
        if (!validated.success) throw new GatewayError({ code: 'MCP_BACKEND_CONTRACT_MISMATCH', message: 'ReqAI API returned an incompatible response', retryable: false, status: 502 });
        metrics.increment('reqai_mcp_tool_calls_total', { tool: name, outcome: 'success' });
        safeLog('info', 'mcp.tool.completed', { tool: name, outcome: 'success', durationMs: clock() - started });
        return resultContent(validated.data);
      } catch (rawError) {
        const error = gatewayError(rawError);
        const safe = { code: error.code, message: error.message, retryable: error.retryable, requestId: error.requestId, ...(error.details ? { details: error.details } : {}) };
        metrics.increment('reqai_mcp_tool_calls_total', { tool: name, outcome: 'error' });
        metrics.increment('reqai_mcp_backend_errors_total', { code: error.code });
        safeLog('info', 'mcp.tool.completed', { tool: name, outcome: 'error', errorCode: error.code, durationMs: clock() - started });
        return resultContent({ error: safe }, true);
      } finally {
        metrics.observe('reqai_mcp_tool_latency_ms', clock() - started, { tool: name });
      }
    });
  }
  return server;
}

export { OPERATIONS };
