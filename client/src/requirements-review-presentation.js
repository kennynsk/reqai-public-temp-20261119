const ACTIVE = new Set(['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED']);

const BABOK_TYPE_ACCENTS = {
  BR: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700' },
  SR: { dot: 'bg-cyan-500', chip: 'bg-cyan-50 text-cyan-700' },
  FR: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-700' },
  NFR: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700' },
  TR: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700' },
  CON: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700' },
};

export function babokTypeAccent(type) {
  return BABOK_TYPE_ACCENTS[type] || { dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600' };
}

export function researchPresentation({ childId, child, versionId, submitting = false }) {
  const active = submitting || ACTIVE.has(child?.status);
  const previous = Boolean(child?.inputArtifactId && versionId && child.inputArtifactId !== versionId);
  const current = Boolean(child?.inputArtifactId && versionId && child.inputArtifactId === versionId);
  const labels = {
    ACCEPTED: 'AI-исследование принято', QUEUED: 'AI-исследование в очереди',
    RUNNING: 'AI-исследование выполняется', RETRY_WAIT: 'AI-исследование ожидает повторной попытки',
    CANCEL_REQUESTED: 'Останавливаем AI-исследование', SUCCEEDED: 'AI-исследование завершено',
    FAILED: 'AI-исследование не удалось', CANCELLED: 'AI-исследование отменено',
  };
  const status = submitting ? 'Запускаем AI-исследование…' : childId
    ? `${previous ? 'Исследование предыдущей версии · ' : ''}${labels[child?.status] || 'Статус AI-исследования недоступен'}${current ? ' · для этой версии' : ''}` : '';
  return { active, previous, current, status, openPrimary: Boolean(childId && (active || (current && child?.status === 'SUCCEEDED'))), openLabel: child?.status === 'SUCCEEDED' ? 'Посмотреть результаты AI' : 'Открыть AI-исследование' };
}

export function reviewPrimary({ dirty, saved, busy, research, submitting, conflict }) {
  if (conflict) return 'conflict';
  if (submitting && !research.openPrimary) return 'starting';
  if (busy || dirty || !saved) return 'save';
  if (research.openPrimary) return 'open';
  return 'final';
}
