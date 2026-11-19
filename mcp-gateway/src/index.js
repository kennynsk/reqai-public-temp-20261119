import { loadConfig } from './config.js';
import { createMetrics } from './metrics.js';
import { createReqAiClient } from './rest-client.js';
import { createHttpRuntime } from './http-server.js';
import { startStdioRuntime } from './stdio-runtime.js';
import { safeLog } from './redaction.js';

async function main() {
  const config = loadConfig();
  const metrics = createMetrics();
  const client = createReqAiClient({ config });
  let runtime;
  if (config.transport === 'stdio') {
    if (!config.enabled) throw new Error('MCP_ENABLED must be true for stdio');
    runtime = await startStdioRuntime({ config, client, metrics });
  } else {
    runtime = createHttpRuntime({ config, client, metrics });
    if (config.enabled) {
      try {
        await client.health();
        if (config.readinessBearerToken) await client.authenticate(config.readinessBearerToken);
        runtime.setBackendReady(Boolean(config.readinessBearerToken) || !config.production);
      } catch { runtime.setBackendReady(false); }
    }
    await runtime.listen();
    safeLog('info', 'mcp.gateway.started', { host: config.host, port: config.port, enabled: config.enabled, schemaVersion: config.schemaVersion });
  }
  const shutdown = async (signal) => { safeLog('info', 'mcp.gateway.stopping', { signal }); await runtime.close(); process.exit(0); };
  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  safeLog('error', 'mcp.gateway.start_failed', { errorType: error?.name || 'Error', errorCode: error?.code || 'CONFIGURATION_ERROR' });
  process.exit(1);
});
