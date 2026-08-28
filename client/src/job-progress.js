const MODEL_STEPS = new Set(['model', 'decompose-chunk', 'requirements-insights']);
const PHASES = { validation: 0, preparation: 0, starting: 0, model: 1, 'decompose-chunk': 1, 'requirements-insights': 1, assembly: 2, persistence: 3 };
export const EXECUTION_PHASES = ['Подготовка', 'AI-анализ', 'Сборка', 'Сохранение'];

export function isModelPhase(job) { return MODEL_STEPS.has(job.currentStep); }
export function executionPhaseIndex(job) { return PHASES[job.currentStep] ?? -1; }
export function visualProgressForJob(job) { return Math.max(0, Math.min(100, Number(job.progress) || 0)); }
export function progressPresentationForJob(job) {
  const visualProgress = visualProgressForJob(job);
  return { estimated: false, progress: Math.floor(visualProgress), stageLabel: EXECUTION_PHASES[executionPhaseIndex(job)] || null, visualProgress };
}

// No timer-driven claims about work the server has not reported.
export function focusMessageForJob(job) {
  if (job.status === 'RETRY_WAIT') return 'Ожидаем повторной попытки обработки.';
  if (['ACCEPTED', 'QUEUED'].includes(job.status)) return 'Задача принята. Ожидаем начала обработки.';
  if (isModelPhase(job)) return job.type === 'DECOMPOSITION' ? 'Модель анализирует бизнес-задачу. Ожидаем результат.' : 'Модель исследует требования. Ожидаем результат.';
  if (job.currentStep === 'assembly') return 'Собираем результат анализа.';
  if (job.currentStep === 'persistence') return 'Сохраняем результат.';
  if (executionPhaseIndex(job) === 0) return 'Подготавливаем материалы.';
  return 'Ожидаем обновления состояния от сервера.';
}
