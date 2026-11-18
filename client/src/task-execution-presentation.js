export const STATUS_LABELS = { ACCEPTED: 'Ожидает запуска', QUEUED: 'В очереди', RUNNING: 'Выполняется', RETRY_WAIT: 'Повторяем этап', SUCCEEDED: 'Готово', FAILED: 'Не выполнено', CANCEL_REQUESTED: 'Отменяется', CANCELLED: 'Отменено' };
const STATUS_TONES = { ACCEPTED: 'bg-slate-100 text-slate-600', QUEUED: 'bg-slate-100 text-slate-600', RUNNING: 'bg-indigo-100 text-indigo-700', RETRY_WAIT: 'bg-amber-100 text-amber-700', SUCCEEDED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', CANCEL_REQUESTED: 'bg-amber-100 text-amber-700', CANCELLED: 'bg-slate-100 text-slate-600' };
const OUTCOME_LABELS = { COMPLETE: 'Готово', PARTIAL: 'Готово частично', FAILED: 'Не выполнено' };

export function primaryStatus(jobOrResult) {
  if (!jobOrResult) return null;
  if (jobOrResult.outcome === 'PARTIAL') return { label: OUTCOME_LABELS.PARTIAL, tone: 'bg-amber-100 text-amber-700' };
  const status = jobOrResult.status || (jobOrResult.outcome ? 'SUCCEEDED' : null);
  return { label: STATUS_LABELS[status] || OUTCOME_LABELS[jobOrResult.outcome] || 'Статус неизвестен', tone: STATUS_TONES[status] || 'bg-slate-100 text-slate-600' };
}

export function formatDuration(value) {
  if (value == null) return '—';
  if (value < 1000) return `${value} мс`;
  const seconds = Math.round(value / 1000);
  return seconds < 60 ? `${seconds} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}

const STAGE_LABELS = { preparation: 'Подготовка материалов', generation: 'Генерация AI', assembly: 'Сборка черновика', audit: 'Независимая проверка', result: 'Сохранение результата' };

export const CODE_MESSAGES = {
  CRITIC_DISABLED: 'Критик выключен в настройках этого запуска.',
  SEMANTIC_AUDIT_INVALID: 'Ответ проверяющей модели оказался в неверном формате.',
  BABOK_SEMANTIC_INVALID: 'Независимую проверку не удалось завершить.',
  SOURCE_CONDITION_LOST: 'В черновике могло потеряться условие из исходной задачи.',
  NON_ATOMIC: 'В одной формулировке могут быть объединены несколько требований.',
  BR_IS_FUNCTION: 'Проверьте, описывает ли запись бизнес-цель или действие системы.',
  BR_IS_MEASUREMENT: 'Показатель успеха стоит проверить в составе бизнес-цели.',
  BABOK_QUALITY_INVALID: 'Нужно уточнить формулировку или её связь с открытым вопросом.',
  SEMANTIC_PATCH_CONTRACT_INVALID: 'Не удалось прочитать предложенное исправление.',
  OUTPUT_CONTRACT_VIOLATION: 'Ответ AI не соответствует формату задачи.',
  INVALID_REQUIREMENTS_INSIGHTS: 'Предложения AI не прошли проверку формата.',
  JOB_DEADLINE_EXPIRED: 'Истекло время ожидания обработки.',
  MODEL_TIMEOUT: 'Модель не успела ответить.',
  MODEL_ACTIVITY_TIMEOUT: 'Истекло время ожидания ответа модели.',
  MODEL_FALLBACK_EXHAUSTED: 'Доступные модели не вернули ответ.',
  NO_USABLE_OUTPUT: 'AI не сформировал пригодный черновик.',
};

const safeValue = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,99}$/u.test(value) ? value : null;

export function supportText(trace, stages) {
  const codes = [...new Set([trace.reasonCode, ...stages.flatMap((stage) => [stage.reasonCode, ...stage.issues.map((issue) => issue.code), ...stage.attempts.map((attempt) => attempt.reasonCode)])].map(safeValue).filter(Boolean))];
  const models = [...new Set(stages.flatMap((stage) => stage.attempts.map((attempt) => safeValue(attempt.model))).filter(Boolean))];
  const latestStage = stages.findLast((stage) => ['failed', 'partial'].includes(stage.status)) || stages.at(-1);
  return [
    ['ID задачи', safeValue(trace.jobId)], ['Статус', safeValue(trace.status)], ['Исход', safeValue(trace.outcome)],
    ['Этап', STAGE_LABELS[latestStage?.stage]], ['Коды', codes.join(', ')],
    ['Длительность', trace.durationMs == null ? null : formatDuration(trace.durationMs)],
    ['Модель', models.join(', ')], ['Промпт', safeValue(trace.instructionProfile?.version)], ['Скилл', safeValue(trace.skillProfile?.version)],
  ].filter(([, value]) => value).map(([label, value]) => `${label} — ${value}`).join('\n');
}
