const FORBIDDEN = new Set(['content', 'requirements', 'prompt', 'result', 'researchReport', 'rawResponse']);
export function assertReferenceOnlyPayload(payload, { maxBytes = 64 * 1024 } = {}) {
  const visit = (value) => { if (!value || typeof value !== 'object') return; for (const [key, child] of Object.entries(value)) { if (FORBIDDEN.has(key)) throw new Error(`Control-plane payload must not include ${key}`); visit(child); } };
  visit(payload); const bytes = Buffer.byteLength(JSON.stringify(payload)); if (bytes > maxBytes) throw new Error(`Control-plane payload exceeds ${maxBytes} bytes`); return payload;
}
