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
    ...redactSensitive(fields),
  };
}

export function logEvent(level, event, fields = {}) {
  const method = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
  // eslint-disable-next-line no-console
  console[method](JSON.stringify(buildLogRecord(level, event, fields)));
}
