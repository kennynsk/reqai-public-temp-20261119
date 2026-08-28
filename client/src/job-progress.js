const MODEL_STEPS = new Set(['model', 'decompose-chunk', 'requirements-insights']);
const DECOMPOSITION_PROGRESS_TIME_CONSTANT_MS = 225_000;

const EXECUTION_PHASE_LABELS = {
  assembly: 'Сборка',
  persistence: 'Сохранение',
};

const LATE_PHASE_ESTIMATES = {
  assembly: { ceiling: 94, timeConstantMs: 60_000 },
  persistence: { ceiling: 99, timeConstantMs: 30_000 },
};

export const EXECUTION_PHASES = ['Подготовка', 'AI-анализ', 'Сборка', 'Сохранение'];

const DECOMPOSITION_FOCUS = [
  'Анализируем цели и ограничения',
  'Выделяем контекст и границы решения',
  'Выделяем роли и заинтересованные стороны',
  'Формируем бизнес- и stakeholder-требования',
  'Классифицируем требования',
  'Детализируем функциональные и нефункциональные требования',
  'Проверяем атомарность, происхождение и качество',
  'Выявляем пробелы, гипотезы и термины',
  'Строим трассируемость требований',
  'Формируем вопросы для уточнения',
  'Собираем реестр требований',
];

const ASSEMBLY_FOCUS = [
  'Объединяем результаты анализа',
  'Сверяем требования между частями задачи',
  'Устраняем дубли и проверяем уникальность ID',
  'Проверяем связи и трассируемость',
  'Сводим пробелы, гипотезы и термины',
  'Формируем единый реестр требований',
];

const PERSISTENCE_FOCUS = [
  'Проверяем итоговый реестр требований перед сохранением',
  'Сохраняем результат декомпозиции',
  'Фиксируем источники и связи требований',
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

function phaseElapsedFor(job, now) {
  const phaseStartedAt = Date.parse(job.updatedAt || job.startedAt || job.createdAt || '');
  return Number.isFinite(phaseStartedAt) ? Math.max(0, now - phaseStartedAt) : 0;
}

export function isModelPhase(job) {
  return MODEL_STEPS.has(job.currentStep);
}

export function visualProgressForJob(job, now = Date.now()) {
  const authoritative = clamp(Number(job.progress) || 0, 0, 100);
  if (job.status !== 'RUNNING') return authoritative;

  const latePhase = LATE_PHASE_ESTIMATES[job.currentStep];
  if (latePhase) {
    if (authoritative >= latePhase.ceiling) return authoritative;
    const estimated = authoritative + (latePhase.ceiling - authoritative) * (1 - Math.exp(-phaseElapsedFor(job, now) / latePhase.timeConstantMs));
    return clamp(Math.max(authoritative, estimated), authoritative, latePhase.ceiling);
  }

  if (!isModelPhase(job) || authoritative >= 90) return authoritative;

  const timeConstant = job.type === 'DECOMPOSITION'
    ? DECOMPOSITION_PROGRESS_TIME_CONSTANT_MS
    : job.mode === 'REQUIREMENTS_INSIGHTS' ? 150_000 : 120_000;
  const phaseCeiling = 88;
  const elapsed = elapsedFor(job, now);
  const estimated = authoritative + (phaseCeiling - authoritative) * (1 - Math.exp(-elapsed / timeConstant));
  return clamp(Math.max(authoritative, estimated), authoritative, phaseCeiling);
}

export function progressPresentationForJob(job, now = Date.now()) {
  const visualProgress = visualProgressForJob(job, now);
  const progress = Math.floor(visualProgress);
  return {
    estimated: job.status === 'RUNNING' && progress > Number(job.progress || 0),
    progress,
    stageLabel: EXECUTION_PHASE_LABELS[job.currentStep] || null,
    visualProgress,
  };
}

export function focusMessageForJob(job, now = Date.now()) {
  const messages = isModelPhase(job)
    ? job.type === 'DECOMPOSITION'
      ? DECOMPOSITION_FOCUS
      : job.mode === 'REQUIREMENTS_INSIGHTS' ? INSIGHTS_FOCUS : RESEARCH_FOCUS
    : job.currentStep === 'assembly' ? ASSEMBLY_FOCUS
      : job.currentStep === 'persistence' ? PERSISTENCE_FOCUS : null;
  if (!messages) return null;
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
