const MODEL_STEPS = new Set(['model', 'decompose-chunk', 'requirements-insights']);

export const EXECUTION_PHASES = ['Подготовка', 'AI-анализ', 'Сборка', 'Сохранение'];

const DECOMPOSITION_FOCUS = [
  'Анализируем цели и ограничения',
  'Выделяем роли и пользовательские сценарии',
  'Формируем бизнес-требования',
  'Детализируем функции системы',
  'Проверяем надёжность, безопасность и производительность',
  'Готовим структуру требований',
];

const INSIGHTS_FOCUS = [
  'Сопоставляем требования с отраслевыми практиками',
  'Ищем подходящие архитектурные паттерны',
  'Анализируем риски и возможные пробелы',
  'Проверяем стандарты и нормативные ограничения',
  'Формируем рекомендации по улучшению',
  'Связываем рекомендации с исходными требованиями',
];

const RESEARCH_FOCUS = [
  'Анализируем структуру исходных данных',
  'Сопоставляем категории исследования',
  'Выявляем значимые закономерности',
  'Проверяем риски и ограничения',
  'Формируем выводы и рекомендации',
  'Готовим результат к проверке',
];

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function elapsedFor(job, now) {
  const startedAt = Date.parse(job.startedAt || job.createdAt || '');
  return Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : 0;
}

export function isModelPhase(job) {
  return MODEL_STEPS.has(job.currentStep);
}

export function visualProgressForJob(job, now = Date.now()) {
  const authoritative = clamp(Number(job.progress) || 0, 0, 100);
  if (job.status !== 'RUNNING' || !isModelPhase(job) || authoritative >= 90) return authoritative;

  const timeConstant = job.type === 'DECOMPOSITION'
    ? 55_000
    : job.mode === 'REQUIREMENTS_INSIGHTS' ? 150_000 : 120_000;
  const phaseCeiling = 88;
  const elapsed = elapsedFor(job, now);
  const estimated = authoritative + (phaseCeiling - authoritative) * (1 - Math.exp(-elapsed / timeConstant));
  return clamp(Math.max(authoritative, estimated), authoritative, phaseCeiling);
}

export function focusMessageForJob(job, now = Date.now()) {
  if (!isModelPhase(job)) return null;
  const messages = job.type === 'DECOMPOSITION'
    ? DECOMPOSITION_FOCUS
    : job.mode === 'REQUIREMENTS_INSIGHTS' ? INSIGHTS_FOCUS : RESEARCH_FOCUS;
  const index = Math.floor(elapsedFor(job, now) / 15_000) % messages.length;
  return messages[index];
}

export function executionPhaseIndex(job) {
  if (['validation', 'preparation', 'starting'].includes(job.currentStep)) return 0;
  if (isModelPhase(job)) return 1;
  if (job.currentStep === 'assembly') return 2;
  if (job.currentStep === 'persistence') return 3;
  const progress = Number(job.progress) || 0;
  if (progress < 20) return 0;
  if (progress < 90) return 1;
  if (progress < 95) return 2;
  return 3;
}
