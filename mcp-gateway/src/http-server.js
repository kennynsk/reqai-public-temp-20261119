import http from 'node:http';
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { parseBearer, GatewayError } from './rest-client.js';
import { createRequirementsMcpServer } from './tools.js';
import { safeLog } from './redaction.js';

function jsonRpcError(res, status, message) {
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });
}
function hostAllowed(config, header) {
  if (!config.allowedHosts.length) return ['127.0.0.1', 'localhost', '[::1]'].includes(String(header || '').split(':')[0]);
  const hostname = String(header || '').replace(/^\[|\](:\d+)?$/g, '').split(':')[0];
  return config.allowedHosts.includes(hostname) || config.allowedHosts.includes(String(header || ''));
}

export function createHttpRuntime({ config, client, metrics }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!hostAllowed(config, req.get('host'))) return res.status(421).json({ error: 'Misdirected request' });
    next();
  });
  app.use(express.json({ limit: config.bodyLimitBytes, strict: true }));

  let active = 0;
  let draining = false;
  let backendReady = false;

  app.get('/health/live', (req, res) => res.json({ ok: true, service: 'reqai-mcp-gateway', buildVersion: config.buildVersion, schemaVersion: config.schemaVersion }));
  app.get('/health/ready', (req, res) => res.status(config.enabled && !draining && backendReady ? 200 : 503).json({ ok: config.enabled && !draining && backendReady, enabled: config.enabled, backendCompatible: backendReady, draining }));
  app.get('/version', (req, res) => res.json({ buildVersion: config.buildVersion, toolSchemaVersion: config.schemaVersion, sdk: '1.32.1', transport: 'streamable-http' }));
  app.get('/metrics', (req, res) => { res.type('text/plain; version=0.0.4').send(metrics.render()); });

  app.all(config.path, async (req, res) => {
    if (!config.enabled) return jsonRpcError(res, 404, 'MCP gateway is disabled');
    if (draining) return jsonRpcError(res, 503, 'MCP gateway is draining');
    if (active >= config.maxConcurrency) return jsonRpcError(res, 429, 'MCP concurrency limit reached');
    active += 1;
    let mcpServer;
    let transport;
    try {
      const token = parseBearer(req.get('authorization'));
      await client.authenticate(token);
      backendReady = true;
      if (req.method !== 'POST') return jsonRpcError(res, 405, 'Method not allowed');
      mcpServer = createRequirementsMcpServer({ client, token, config, metrics });
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (error instanceof GatewayError) {
        metrics.increment('reqai_mcp_auth_rejections_total', { code: error.code });
        const status = [401, 403].includes(error.status) ? error.status : 503;
        if (status >= 500) backendReady = false;
        if (!res.headersSent) return jsonRpcError(res, status, error.message);
      }
      safeLog('error', 'mcp.request.failed', { errorType: error?.name || 'Error', errorCode: error?.code || 'MCP_INTERNAL_ERROR' });
      if (!res.headersSent) jsonRpcError(res, 500, 'Internal MCP gateway error');
    } finally {
      active -= 1;
      await transport?.close().catch(() => {});
      await mcpServer?.close().catch(() => {});
    }
  });

  app.use((error, req, res, next) => {
    void req; void next;
    if (error?.type === 'entity.too.large') return jsonRpcError(res, 413, 'MCP request body is too large');
    jsonRpcError(res, 400, 'Invalid JSON request');
  });

  const server = http.createServer(app);
  return Object.freeze({
    app,
    server,
    setBackendReady(value) { backendReady = Boolean(value); },
    async listen() { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); }); },
    async close() {
      draining = true;
      await new Promise((resolve) => server.close(resolve));
    },
  });
}
