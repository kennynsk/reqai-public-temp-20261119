export function initialJobMetadata({ text, name, type, createdAt = new Date() }) {
  const clean = (value) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const summary = clean(text).slice(0, 2000);
  const fallback = `${type === 'RESEARCH' ? 'AI-исследование' : 'Подготовка требований'} · ${new Date(createdAt).toISOString().slice(0, 10)}`;
  const source = summary || clean(name) || fallback;
  const sentence = source.match(/^.*?(?:[.!?](?=\s|$)|$)/u)?.[0]?.trim() || source;
  const candidate = sentence.length >= 16 ? sentence : source;
  const clipped = candidate.slice(0, 64).trim();
  const title = candidate.length <= 64
    ? candidate
    : clipped.includes(' ') && clipped.lastIndexOf(' ') >= 16
      ? clipped.slice(0, clipped.lastIndexOf(' ')).trim()
      : clipped;
  return { title, summary };
}
