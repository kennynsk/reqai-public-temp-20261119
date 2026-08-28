export function safeCitationUrl(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f]/u.test(value)) return null;
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function normalizeCitations(value) {
  return Array.isArray(value) ? value.slice(0, 50).filter((item) => item && typeof item === 'object').map((item) => ({
    title: typeof item.title === 'string' ? item.title.slice(0, 1000) : null,
    url: typeof item.url === 'string' ? item.url.slice(0, 4096) : null,
    publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt.slice(0, 100) : null,
  })) : [];
}
