export function initialJobMetadata({ text, name, type, createdAt = new Date() }) {
  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const summary = clean(text).slice(0, 2000);
  const fallback = `${type === 'RESEARCH' ? 'AI-исследование' : 'Подготовка требований'} · ${new Date(createdAt).toISOString().slice(0, 10)}`;
  return { title: (summary || clean(name) || fallback).slice(0, 120), summary };
}
