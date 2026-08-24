const SENSITIVE_KEY = /authorization|cookie|token|secret|password|api[_-]?key|credential|prompt|businessContext|researchContext/i;

export function redact(value, depth = 0) {
  if (depth > 5) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(item, depth + 1)]));
  }
  if (typeof value === 'string') return value.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
  return value;
}
export function safeLog(level, event, fields = {}) {
  const record = { timestamp: new Date().toISOString(), level, event, ...redact(fields) };
  process.stdout.write(`${JSON.stringify(record)}\n`);
}
