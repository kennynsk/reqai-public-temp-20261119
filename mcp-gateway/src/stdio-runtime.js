import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { parseBearer } from './rest-client.js';
import { createRequirementsMcpServer } from './tools.js';

export async function startStdioRuntime({ config, client, metrics, env = process.env }) {
  if (config.production) throw new Error('stdio transport is forbidden in production');
  const token = parseBearer(env.MCP_STDIO_BEARER_TOKEN);
  await client.authenticate(token);
  const server = createRequirementsMcpServer({ client, token, config, metrics });
  const transport = new StdioServerTransport(process.stdin, process.stdout, { maxBufferSize: config.bodyLimitBytes });
  await server.connect(transport);
  return { close: async () => { await transport.close(); await server.close(); } };
}
