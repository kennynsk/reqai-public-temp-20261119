const SENSITIVE_KEY_PARTS = [
  'authorization',
  'cookie',
  'token',
  'secret',
  'password',
  'apikey',
  'api_key',
  'prompt',
  'requirements',
  'content',
  'response',
  'body',
];

export function redactSensitive(value) {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase();
      out[key] = SENSITIVE_KEY_PARTS.some((part) => normalized.includes(part))
        ? '[REDACTED]'
        : redactSensitive(child);
    }
    return out;
  }
  return value;
}

export function safeUrl(value) {
  try {
    const parsed = new URL(value, 'http://internal.invalid');
    return parsed.origin === 'http://internal.invalid' ? parsed.pathname : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

export function buildLogRecord(level, event, fields = {}) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...redactDiagnosticMetadata(fields),
  };
}

export function logEvent(level, event, fields = {}) {
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  // eslint-disable-next-line no-console
  console[method](JSON.stringify(buildLogRecord(level, event, fields)));
}

// Ordinary diagnostics may contain model-produced errors, including historical
// rows. Keep their structure, but never expose free-form explanations or text.
const DIAGNOSTIC_TEXT_KEYS = new Set(['reason', 'message', 'quote', 'text', 'rationale', 'stack', 'title', 'description']);
export function redactDiagnosticMetadata(value) {
  const clean = redactSensitive(value);
  function visit(node) {
    if (Array.isArray(node)) return node.map(visit);
    if (!node || typeof node !== 'object') return node;
    return Object.fromEntries(Object.entries(node).map(([key, child]) => {
      if (DIAGNOSTIC_TEXT_KEYS.has(key.toLowerCase())) return [key, '[REDACTED]'];
      if (key === 'key' && typeof child === 'string' && !/^(?:\$(?:quality|source|narrative)?|(?:BR|SR|FR|NFR|TR|CON|CTX|GAP|HYP|TERM|SOURCE|INS|INSIGHT)-\d+(?::\d+)?)$/.test(child)) return [key, '[REDACTED]'];
      if (['code', 'reasonCode'].includes(key) && typeof child === 'string' && !/^[A-Za-z0-9_$.:\[\]-]{1,100}$/.test(child)) return [key, '[REDACTED]'];
      if (key === 'path' && typeof child === 'string' && !/^\$(?:\.[A-Za-z_]\w*|\[\d+\])*$/.test(child)) return [key, '[REDACTED]'];
      return [key, visit(child)];
    }));
  }
  return visit(clean);
}
