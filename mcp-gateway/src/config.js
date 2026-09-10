const TRUE = new Set(['1', 'true', 'yes', 'on']);

function bool(value, fallback = false) {
  return value == null ? fallback : TRUE.has(String(value).toLowerCase());
}

function integer(value, fallback, { min, max, name }) {
  const parsed = value == null ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return parsed;
}

function url(value, name, { protocols, required = true }) {
  if (!value && !required) return null;
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`${name} must be an absolute URL`); }
  if (!protocols.includes(parsed.protocol)) throw new Error(`${name} must use ${protocols.join(' or ')}`);
  if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(`${name} must not contain credentials, query or fragment`);
  return parsed;
}

export function loadConfig(env = process.env) {
  const environment = env.MCP_ENVIRONMENT || env.NODE_ENV || 'development';
  const production = environment === 'production';
  const enabled = bool(env.MCP_ENABLED, false);
  const transport = env.MCP_TRANSPORT || 'streamable-http';
  if (!['streamable-http', 'stdio'].includes(transport)) throw new Error('MCP_TRANSPORT must be streamable-http or stdio');
  if (production && transport !== 'streamable-http') throw new Error('Production MCP transport must be streamable-http');

  const backendUrl = url(env.MCP_BACKEND_API_URL || 'http://127.0.0.1:5178', 'MCP_BACKEND_API_URL', { protocols: ['http:', 'https:'] });
  const publicEndpoint = url(env.MCP_PUBLIC_ENDPOINT || (production ? null : 'http://127.0.0.1:5180/mcp'), 'MCP_PUBLIC_ENDPOINT', { protocols: production ? ['https:'] : ['http:', 'https:'], required: !production || enabled });
  const allowedHosts = (env.MCP_ALLOWED_HOSTS || '').split(',').map((item) => item.trim()).filter(Boolean);
  if (production && enabled && !allowedHosts.length) throw new Error('MCP_ALLOWED_HOSTS is required in production');
  if (production && enabled && !env.MCP_READINESS_BEARER_TOKEN) throw new Error('MCP_READINESS_BEARER_TOKEN is required in production');
  if (production && enabled && backendUrl.hostname === 'localhost') throw new Error('MCP_BACKEND_API_URL must not use localhost in production');

  const audienceMode = env.MCP_IAM_AUDIENCE_MODE || 'forward-same-audience';
  if (audienceMode !== 'forward-same-audience') throw new Error('Only MCP_IAM_AUDIENCE_MODE=forward-same-audience is supported; delegated token exchange is not configured');

  return Object.freeze({
    enabled,
    environment,
    production,
    transport,
    host: env.MCP_HOST || '127.0.0.1',
    port: integer(env.MCP_PORT, 5180, { min: 1, max: 65535, name: 'MCP_PORT' }),
    path: publicEndpoint?.pathname || '/mcp',
    publicEndpoint: publicEndpoint?.toString() || null,
    backendUrl: backendUrl.toString().replace(/\/$/, ''),
    backendTimeoutMs: integer(env.MCP_BACKEND_TIMEOUT_MS, 10_000, { min: 100, max: 120_000, name: 'MCP_BACKEND_TIMEOUT_MS' }),
    authTimeoutMs: integer(env.MCP_AUTH_TIMEOUT_MS, 5_000, { min: 100, max: 30_000, name: 'MCP_AUTH_TIMEOUT_MS' }),
    bodyLimitBytes: integer(env.MCP_BODY_LIMIT_BYTES, 1_100_000, { min: 1024, max: 2_000_000, name: 'MCP_BODY_LIMIT_BYTES' }),
    responseLimitBytes: integer(env.MCP_RESPONSE_LIMIT_BYTES, 262_144, { min: 4096, max: 1_000_000, name: 'MCP_RESPONSE_LIMIT_BYTES' }),
    maxConcurrency: integer(env.MCP_MAX_CONCURRENCY, 32, { min: 1, max: 512, name: 'MCP_MAX_CONCURRENCY' }),
    schemaVersion: env.MCP_TOOL_SCHEMA_VERSION || '2.2.0',
    buildVersion: env.MCP_BUILD_VERSION || '1.0.0',
    allowedHosts,
    audienceMode,
    readinessBearerToken: env.MCP_READINESS_BEARER_TOKEN || null,
  });
}
