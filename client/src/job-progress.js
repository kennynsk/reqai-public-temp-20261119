const MODEL_STEPS = new Set(['model', 'decompose-chunk', 'requirements-insights']);
const PHASES = { validation: 0, preparation: 0, starting: 0, model: 1, 'decompose-chunk': 1, 'requirements-insights': 1, assembly: 2, persistence: 3 };
export const EXECUTION_PHASES = ['Подготовка', 'AI-анализ', 'Сборка', 'Сохранение'];

const ESTIMATE_EASING = 2.3;
const SAFE_BOUNDARY_EPSILON = 0.001;
const DECOMPOSITION_ESTIMATES = Object.freeze({
  model: { start: 20, boundary: 70, durationMs: 75_000 },
  'decompose-chunk': { start: 20, boundary: 70, durationMs: 75_000 },
  assembly: { start: 70, boundary: 90, durationMs: 15_000 },
  persistence: { start: 90, boundary: 100, durationMs: 8_000 },
});

const RESEARCH_ESTIMATES = Object.freeze({
  model: { start: 20, boundary: 90, durationMs: 150_000 },
  'requirements-insights': { start: 20, boundary: 90, durationMs: 150_000 },
  assembly: { start: 90, boundary: 100, durationMs: 8_000 },
  persistence: { start: 90, boundary: 100, durationMs: 8_000 },
});

export function isModelPhase(job) { return MODEL_STEPS.has(job.currentStep); }
export function executionPhaseIndex(job) { return PHASES[job.currentStep] ?? -1; }

function confirmedProgressForJob(job) { return Math.max(0, Math.min(100, Number(job.progress) || 0)); }

function timestampMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value) return Date.parse(value);
  return Number.NaN;
}

function phaseElapsedMs(job, now) {
  const phaseStartedAt = [job.phaseStartedAt, job.startedAt, job.createdAt, job.updatedAt].map(timestampMs).find(Number.isFinite);
  const currentTime = timestampMs(now);
  if (!Number.isFinite(phaseStartedAt)) return 0;
  return Math.max(0, (Number.isFinite(currentTime) ? currentTime : Date.now()) - phaseStartedAt);
}

function estimatedVisualProgress(job, now) {
  const confirmedProgress = confirmedProgressForJob(job);
  const profiles = job.type === 'DECOMPOSITION' ? DECOMPOSITION_ESTIMATES : job.type === 'RESEARCH' ? RESEARCH_ESTIMATES : null;
  const profile = profiles?.[job.currentStep];
  if (job.status !== 'RUNNING' || !profile || confirmedProgress < profile.start || confirmedProgress >= profile.boundary) {
    return { visualProgress: confirmedProgress, estimated: false };
  }

  const anchor = Math.max(profile.start, confirmedProgress);
  const safeBoundary = profile.boundary - SAFE_BOUNDARY_EPSILON;
  const elapsedMs = phaseElapsedMs(job, now);
  const fraction = 1 - Math.exp(-ESTIMATE_EASING * elapsedMs / profile.durationMs);
  const visualProgress = Math.min(safeBoundary, anchor + (safeBoundary - anchor) * fraction);
  return { visualProgress: Math.max(anchor, visualProgress), estimated: true };
}

export function visualProgressForJob(job, now = Date.now()) { return estimatedVisualProgress(job, now).visualProgress; }
export function progressPresentationForJob(job, now = Date.now()) {
  const { visualProgress, estimated } = estimatedVisualProgress(job, now);
  return { estimated, progress: Math.floor(visualProgress), stageLabel: EXECUTION_PHASES[executionPhaseIndex(job)] || null, visualProgress };
}

export function progressAriaText({ progress, stageLabel, estimated }) {
  if (!estimated) return `${progress} процентов подтверждено сервером`;
  return `${progress} процентов — ориентировочная оценка этапа ${stageLabel || 'выполнения'}; переход подтверждается сервером`;
}

export function focusMessageForJob(job) {
  if (job.status === 'RETRY_WAIT') return 'Ожидаем повторной попытки обработки.';
  if (['ACCEPTED', 'QUEUED'].includes(job.status)) return 'Задача принята. Ожидаем начала обработки.';
  if (isModelPhase(job)) return job.type === 'DECOMPOSITION' ? 'Модель анализирует бизнес-задачу. Ожидаем результат.' : 'Модель исследует требования. Ожидаем результат.';
  if (job.currentStep === 'assembly') return 'Собираем результат анализа.';
  if (job.currentStep === 'persistence') return 'Сохраняем результат.';
  if (executionPhaseIndex(job) === 0) return 'Подготавливаем материалы.';
  return 'Ожидаем обновления состояния от сервера.';
}

const WAITING_TIPS = {
  DECOMPOSITION: [
    'Анализируем цели и ограничения',
    'Выделяем контекст и границы решения',
    'Определяем роли и заинтересованные стороны',
    'Формируем бизнес-требования',
    'Классифицируем требования',
    'Детализируем функции системы',
    'Проверяем качество и проверяемость требований',
    'Выявляем пробелы, гипотезы и термины',
    'Разбираем связи между требованиями',
    'Формируем вопросы для уточнения',
  ],
  RESEARCH: [
    'Анализируем требования и контекст задачи',
    'Рассматриваем рыночные тенденции из знаний модели',
    'Сравниваем известные модели конкурентных сервисов',
    'Рассматриваем стандарты и области регулирования',
    'Изучаем архитектурные паттерны',
    'Выявляем риски и ограничения',
    'Оцениваем применимость рекомендаций',
    'Формулируем возможные улучшения',
  ],
};

export function waitingTipForJob(job, now = Date.now()) {
  if (!['ACCEPTED', 'QUEUED', 'RUNNING', 'RETRY_WAIT'].includes(job.status)) return null;
  const tips = WAITING_TIPS[job.type];
  if (!tips) return null;
  const started = [job.startedAt, job.createdAt].map(timestampMs).find(Number.isFinite);
  const current = timestampMs(now);
  const elapsed = Number.isFinite(started) && Number.isFinite(current) ? Math.max(0, current - started) : 0;
  return tips[Math.floor(elapsed / 15_000) % tips.length];
}

const REVIEW_TIPS = [
  'Бизнес-требования описывают цель: какой результат нужен бизнесу.',
  'Сравните требования с исходной задачей: не потерялось ли важное условие.',
  'Убедитесь, что функциональные требования описывают конкретные действия системы.',
  'Вопросы без ответа можно будет разобрать вручную или с помощью AI.',
  'Критерий успеха помогает понять, достигнута ли бизнес-цель.',
  'Проверьте, учтены ли потребности всех участников процесса.',
  'Один вопрос может затрагивать несколько требований.',
  'Обратите внимание на ограничения: сроки, безопасность и правила работы.',
  'Пробел в требованиях — повод задать вопрос, а не додумать ответ.',
  'Проверьте нестандартные ситуации: ошибки, отмену и продолжение прерванного действия.',
  'Проверьте, нет ли противоречий или повторов между требованиями.',
  'Перед финальной версией проверьте формулировки, требующие уточнения.',
];

const RESEARCH_REVIEW_TIPS = [
  'AI предлагает гипотезы по вашим материалам и знаниям модели. Внешний поиск не выполняется; новые условия требуют согласования.',
  'Рекомендации AI нужно проверить на применимость к вашей задаче и ограничениям проекта.',
  'Архитектурный паттерн — типовой подход к решению. Проверьте, какую проблему он решает в вашем случае.',
  'Для каждого риска оцените возможные последствия и способ их предотвратить.',
  'Проверяйте источники: дату публикации, содержание и связь с рекомендацией.',
  'Практика конкурентов может подсказать вариант решения, но её нужно соотнести с вашими целями.',
  'Упоминание стандарта или норматива требует проверки его актуальности и области применения.',
  'Сопоставьте предложенное улучшение с исходным требованием: сохраняется ли бизнес-цель.',
  'Если рекомендация опирается на неизвестные условия, сначала уточните их у заинтересованных сторон.',
  'Предложения исследования можно просмотреть и выбрать перед применением к требованиям.',
];

export function reviewTipForJob(job, now = Date.now()) {
  if (!waitingTipForJob(job, now)) return null;
  const started = [job.startedAt, job.createdAt].map(timestampMs).find(Number.isFinite);
  const current = timestampMs(now);
  const elapsed = Number.isFinite(started) && Number.isFinite(current) ? Math.max(0, current - started) : 0;
  const tips = job.type === 'RESEARCH' ? RESEARCH_REVIEW_TIPS : REVIEW_TIPS;
  return tips[Math.floor(elapsed / 20_000) % tips.length];
}
