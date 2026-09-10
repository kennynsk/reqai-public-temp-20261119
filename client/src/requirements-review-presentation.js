const ACTIVE = new Set(['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT', 'CANCEL_REQUESTED']);

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
