import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GatewayError } from './rest-client.js';
import { TOOL_DEFINITIONS } from './schemas.js';
import { safeLog } from './redaction.js';

const OPERATIONS = Object.freeze({
  decompose_requirements: 'decompose',
  research_requirements: 'researchRequirements',
  get_task_status: 'getStatus',
  get_task_result: 'getResult',
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
    instructions: `ReqAI requirements tools; schema ${config.schemaVersion}. Start operations are asynchronous and return canonical job references. Results contain metadata only; artifact content and cancellation use the authorized REST API.`,
  });

  for (const [name, definition] of Object.entries(TOOL_DEFINITIONS)) {
    server.registerTool(name, {
      title: name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      annotations: {
        readOnlyHint: name.startsWith('get_'),
        destructiveHint: false,
        idempotentHint: name.startsWith('get_'),
        openWorldHint: false,
      },
      _meta: { 'reqai/toolSchemaVersion': config.schemaVersion, 'reqai/asynchronous': ['decompose_requirements', 'research_requirements'].includes(name) },
    }, async (input) => {
      const started = clock();
      try {
        const payload = await client[OPERATIONS[name]](token, input);
        // REST may add user-visible fields (title/search settings) without
        // expanding the metadata-only MCP contract. Project before validating.
        const metadata = payload && typeof payload === 'object'
          ? Object.fromEntries(Object.keys(definition.successSchema.shape).filter((key) => Object.hasOwn(payload, key)).map((key) => [key, payload[key]])) : payload;
        if (metadata && name === 'get_task_status') metadata.message = null;
        if (metadata && name === 'get_task_result') {
          metadata.summary = null;
          if (Array.isArray(metadata.failedSteps)) metadata.failedSteps = metadata.failedSteps.map(({ stepId, stepType }) => ({ stepId, stepType, summary: null }));
        }
        const validated = definition.successSchema.safeParse(metadata);
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
