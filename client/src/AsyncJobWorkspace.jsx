import { clarificationIsCurrent } from './gap-clarification.js';
import RequirementClarifications from './RequirementClarifications.jsx';
import RequirementComposerMenu from './RequirementComposerMenu.jsx';
import RequirementsReviewHeader from './RequirementsReviewHeader.jsx';
import RequirementTypeFilter from './RequirementTypeFilter.jsx';
import DiscussionPanel from './DiscussionPanel.jsx';
import { RequirementsReviewContext } from './requirements-review-context.js';
import { researchPresentation } from './requirements-review-presentation.js';
import { isBabokTextDraft } from '../../server/src/services/babok-text-draft.js';
import { collectBabokQualityIssues } from '../../server/src/services/babok-requirements-contract.js';
import ResearchEvidence from './ResearchEvidence.jsx';
import VersionExport from './VersionExport.jsx';
import RecordFocus from './RecordFocus.jsx';
import ProposalReview from './ProposalReview.jsx';
import { lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookOpen,
  Bug,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  FileUp,
  History,
  Info,
  Loader2,
  Link2,
  List,
  Layers3,
  MoreHorizontal,
  MessageCircle,
  Pencil,
  Plus,
  Settings2,
  Sparkles,
  TrendingUp,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import { enterpriseApi, subscribeJobEvents } from './api/enterprise-api.js';
import { EXECUTION_PHASES, executionPhaseIndex, focusMessageForJob, waitingTipForJob, progressAriaText, progressPresentationForJob } from './job-progress.js';
import { assembleReview, clearReviewDrafts, rebaseReview, useDraftField, useReviewState } from './review-state.js';
import { SessionContext } from './review-context.js';
import RegistryAnalysis, { RecordLinks } from './RegistryAnalysis.jsx';
import RequirementTypeNav from './RequirementTypeNav.jsx';
import HistoryDrawer from './HistoryDrawer.jsx';
import TaskTitle from './TaskTitle.jsx';
import ContextInput from './ContextInput.jsx';
import { openReviewItems, updateReviewMetadata } from './review-metadata.js';
import LegacyDeletionNotice from './LegacyDeletionNotice.jsx';
import { useLegacyDeletion } from './use-legacy-deletion.js';
import { ResultExportAction } from './ResultExportContext.jsx';
import { ResultExportContext } from './result-export-context.js';
import { effectiveReasoning, readNextSettings, reasoningLevels } from './ai-settings.js';
import ReviewDialog from './ReviewDialog.jsx';
import { readAccessToken } from './api/auth-session.js';
import { CoverageWarning, SourceEvidence } from './SourceEvidence.jsx';
import { STRUCTURED_FIELDS, QUALITY_OPTIONS } from './review-fields.js';
import { ReviewDraftProvider, ReviewSessionProvider } from './ReviewDraftProvider.jsx';
import ResearchInsightWorkspace from './ResearchInsightWorkspace.jsx';
import RequirementListWorkspace from './RequirementListWorkspace.jsx';
import { filterRequirementList, selectedRequirementEntry } from './requirement-list.js';
import { buildBabokRequirementIndex, buildLegacyRequirementIndex } from './research-review.js';
import { RequirementPreviewProvider } from './RequirementPreview.jsx';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const SafeMarkdown = lazy(() => import('./SafeMarkdown.jsx'));
const BabokTextDraft = lazy(() => import('./BabokTextDraft.jsx'));
const BabokSkillReport = lazy(() => import('./BabokSkillReport.jsx'));
const BACKGROUND_JOB_KEY = 'reqai.backgroundJob';
const RETIRED_MODES = new Set(['DECOMPOSITION_WITH_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST']);
const MODE_LABELS = {
  DECOMPOSITION: 'Подготовка требований',
  REQUIREMENTS_INSIGHTS: 'AI-исследование требований',
};
const TYPE_LABELS = { DECOMPOSITION: 'Подготовка требований', RESEARCH: 'Исследование' };
const STATUS_LABELS = { ACCEPTED: 'Ожидает запуска', QUEUED: 'В очереди', RUNNING: 'Выполняется', RETRY_WAIT: 'Повторяем этап', SUCCEEDED: 'Готово', FAILED: 'Не выполнено', CANCEL_REQUESTED: 'Отменяется', CANCELLED: 'Отменено' };
const OUTCOME_LABELS = { COMPLETE: 'Готово', PARTIAL: 'Готово частично', FAILED: 'Не выполнено' };
const FAILURE_MESSAGES = {
  OUTPUT_CONTRACT_VIOLATION: 'Ответ AI не соответствует формату требований. Попробуйте запустить задачу ещё раз.',
  BABOK_OUTPUT_INVALID: 'Ответ AI не прошёл проверку формата требований. Попробуйте запустить задачу ещё раз.',
  INVALID_DECOMPOSITION_RESULT: 'AI вернул некорректный результат. Попробуйте запустить задачу ещё раз.',
  NO_USABLE_OUTPUT: 'AI не сформировал пригодный результат. Попробуйте запустить задачу ещё раз.',
};
const STATUS_TONES = { ACCEPTED: 'bg-slate-100 text-slate-600', QUEUED: 'bg-slate-100 text-slate-600', RUNNING: 'bg-indigo-100 text-indigo-700', RETRY_WAIT: 'bg-amber-100 text-amber-700', SUCCEEDED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', CANCEL_REQUESTED: 'bg-amber-100 text-amber-700', CANCELLED: 'bg-slate-100 text-slate-600' };
const DEFAULT_MODELS = ['glm-5.3-flash', 'glm-5.3', 'glm-5.2', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'];
const REASONING_OPTIONS = [
  ['disabled', 'Выключен'],
  ['low', 'Низкий'],
  ['high', 'Высокий'],
  ['max', 'Максимальный'],
];
const INSIGHT_CATEGORY_META = {
  trends: { label: 'Тренды рынка', color: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-600 text-white', icon: TrendingUp },
  patterns: { label: 'Архитектурные паттерны', color: 'bg-violet-100 text-violet-700', active: 'bg-violet-600 text-white', icon: Layers3 },
  risks: { label: 'Риски', color: 'bg-orange-100 text-orange-700', active: 'bg-orange-600 text-white', icon: AlertTriangle },
  competitors: { label: 'Конкурентный анализ', color: 'bg-blue-100 text-blue-700', active: 'bg-blue-600 text-white', icon: Users },
  standards: { label: 'Стандарты и нормативы', color: 'bg-amber-100 text-amber-700', active: 'bg-amber-600 text-white', icon: BookOpen },
};
const SOURCE_TYPE_LABELS = { regulatory: 'Нормативные документы', industry_report: 'Отраслевой отчёт', case_study: 'Кейс', academic: 'Исследования', open_standard: 'Открытый стандарт', market_research: 'Исследование рынка' };
const TARGET_TYPE_LABELS = {
  business: 'В бизнес-требования',
  functional: 'В функциональные',
  nonfunctional: 'В нефункциональные',
  BR: 'В BR · бизнес-требования',
  SR: 'В SR · требования заинтересованных сторон',
  FR: 'В FR · функциональные требования',
  NFR: 'В NFR · нефункциональные требования',
  TR: 'В TR · требования перехода',
  CON: 'В CON · требования соответствия',
};
const TARGET_TYPE_COLORS = {
  business: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  functional: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  nonfunctional: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  BR: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  SR: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
  FR: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  NFR: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  TR: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  CON: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
};
const TARGET_TYPE_ICON_COLORS = {
  business: 'text-blue-600',
  functional: 'text-violet-600',
  nonfunctional: 'text-amber-600',
  BR: 'text-blue-600',
  SR: 'text-cyan-600',
  FR: 'text-violet-600',
  NFR: 'text-amber-600',
  TR: 'text-orange-600',
  CON: 'text-rose-600',
};
const REQUIREMENT_COLUMNS = [
  ['business', 'Бизнес-требования', 'Что должно измениться для клиента и бизнеса', 'border-t-blue-500', 'BT'],
  ['functional', 'Функциональные требования', 'Что система должна уметь делать', 'border-t-violet-500', 'FT'],
  ['nonfunctional', 'Нефункциональные требования', 'Надёжность, производительность и соответствие требованиям', 'border-t-amber-500', 'NFT'],
];
const BABOK_REQUIREMENT_COLUMNS = [
  ['BR', 'Бизнес-требования', 'Цели, результаты и ценность для бизнеса', 'border-t-blue-500'],
  ['SR', 'Требования заинтересованных сторон', 'Потребности и роли участников', 'border-t-cyan-500'],
  ['FR', 'Функциональные требования', 'Что система должна уметь делать', 'border-t-violet-500'],
  ['NFR', 'Нефункциональные требования', 'Качества, ограничения и способы проверки', 'border-t-amber-500'],
  ['TR', 'Требования перехода', 'Условия внедрения и завершения перехода', 'border-t-orange-500'],
  ['CON', 'Требования соответствия', 'Обязательства, нормы и ограничения соответствия', 'border-t-rose-500'],
];
const BABOK_REQUIREMENT_TYPES = BABOK_REQUIREMENT_COLUMNS.map(([type]) => type);
const BABOK_ANALYSIS_TYPES = ['GAP', 'HYP', 'TERM'];
const BABOK_PROVENANCE_LABELS = {
  'Извлечено': 'Извлечено из источника',
  'Нормализовано': 'Нормализовано из источника',
  'Предложено — требует подтверждения': 'Предложено · требует подтверждения',
};
const BABOK_QUALITY_LABELS = {
  'Готово': 'Готово',
  'Требует уточнения': 'Требует уточнения',
  'Конфликтует': 'Конфликтует',
  'Не тестируемо': 'Не тестируемо',
};

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function discussionGapBases(registry, decisions = {}) {
  const answerMap = decisions?.review?.gaps || decisions?.gaps || {};
  return Object.fromEntries((registry?.analysis?.GAP || []).map((gap) => [gap.id, {
    question: String(gap.text || '').trim(),
    answer: String(answerMap[gap.id]?.answer || '').trim(),
  }]));
}

function primaryStatus(jobOrResult) {
  if (!jobOrResult) return null;
  if (jobOrResult.outcome === 'PARTIAL') return { label: OUTCOME_LABELS.PARTIAL, tone: 'bg-amber-100 text-amber-700' };
  const status = jobOrResult.status || (jobOrResult.outcome ? 'SUCCEEDED' : null);
  return { label: STATUS_LABELS[status] || OUTCOME_LABELS[jobOrResult.outcome] || 'Статус неизвестен', tone: STATUS_TONES[status] || 'bg-slate-100 text-slate-600' };
}

function userFacingError(cause) {
  if (cause?.code === 'USER_ACTIVE_JOB_LIMIT') return 'Другая задача уже выполняется. Дождитесь её завершения и попробуйте снова.';
  if (cause?.status === 401 || cause?.status === 403) return 'Нет доступа. Проверьте вход и права пользователя.';
  if (cause?.status === 413) return 'Материал превышает допустимый размер.';
  return 'Не удалось выполнить действие. Ваши данные сохранены в форме. Повторите попытку; подробности доступны в Debug.';
}

function failureMessage(job) {
  return FAILURE_MESSAGES[job?.reasonCode] || 'Попробуйте запустить задачу ещё раз.';
}

function jobIdFromPath(pathname = window.location.pathname) {
  const match = pathname.match(/^\/tasks\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
}

function formatDuration(value) {
  if (value == null) return '—';
  if (value < 1000) return `${value} мс`;
  const seconds = Math.round(value / 1000);
  return seconds < 60 ? `${seconds} с` : `${Math.floor(seconds / 60)} мин ${seconds % 60} с`;
}

const TRACE_TONES = { RUNNING: 'bg-indigo-100 text-indigo-700', COMPLETED: 'bg-emerald-100 text-emerald-700', SUCCEEDED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', PENDING: 'bg-slate-100 text-slate-600', INFO: 'bg-slate-100 text-slate-600' };

function WorkflowStepper({ currentStage = 1, completedStage = 0, skippedStages = [], compact = false }) {
  const stages = [
    ['Контекст', 'Опишите бизнес-задачу'],
    ['Требования', 'Проверьте декомпозицию'],
    ['AI-исследование', 'Необязательный шаг'],
    ['Финальная версия', 'Сохраните результат'],
  ];
  const completedConnectorCount = Math.min(stages.length - 1, Math.max(0, completedStage));
  const currentStageTitle = stages[currentStage - 1]?.[0];
  return (
    <section aria-label="Прогресс подготовки требований" className={compact ? "mb-3 border-b border-slate-200 pb-2" : "mb-4 border-b border-slate-200 px-1 pb-3 md:px-2 sm:flex sm:items-center sm:gap-6"}>
      <div className={compact ? "mb-2 flex items-baseline gap-3 sm:hidden" : "mb-2.5 flex shrink-0 items-baseline gap-3 sm:mb-0"}>
        <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Этап {currentStage} из {stages.length}</p>
        {currentStageTitle && <p className="text-sm font-semibold text-slate-900 sm:hidden">{currentStageTitle}</p>}
      </div>
      <ol aria-label="Этапы подготовки требований" className="relative grid min-w-0 flex-1 grid-cols-4 gap-0">
        <li aria-hidden="true" className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-3 h-px bg-slate-200" />
        {completedConnectorCount > 0 && <li aria-hidden="true" className="pointer-events-none absolute left-[12.5%] top-3 h-px bg-emerald-300" style={{ width: `${(completedConnectorCount / (stages.length - 1)) * 75}%` }} />}
        {completedConnectorCount > 0 && <li aria-hidden="true" className="pointer-events-none absolute left-[12.5%] top-3 hidden h-px bg-emerald-300 md:block" style={{ width: `${(completedConnectorCount / (stages.length - 1)) * 75}%` }} />}
        {stages.map(([title, subtitle], index) => {
          const number = index + 1;
          const skipped = skippedStages.includes(number);
          const complete = number <= completedStage && !skipped;
          const isCurrent = number === currentStage;
          const circleTone = isCurrent
            ? 'bg-indigo-600 text-white ring-2 ring-indigo-50'
            : complete
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200';
          const labelTone = isCurrent ? 'text-indigo-900' : complete ? 'text-emerald-800' : 'text-slate-600';
          return <li key={title} aria-current={isCurrent ? 'step' : undefined} className={compact ? "relative z-10 flex min-w-0 items-center justify-center gap-2 text-center" : "relative z-10 flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:justify-center sm:gap-2"}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${circleTone}`}>{complete && !isCurrent ? <Check className="h-3.5 w-3.5" /> : number}</span>
            <span className="min-w-0 max-w-full">
              <span className={`${compact ? "sr-only sm:not-sr-only sm:bg-[var(--reqai-canvas)]" : "hidden sm:block sm:bg-[var(--reqai-canvas)]"} truncate text-xs font-semibold leading-4 ${labelTone}`}>{title}</span>
              <span className="sr-only">{skipped ? 'Пропущено' : subtitle}</span>
            </span>
          </li>;
        })}
      </ol>
    </section>
  );
}

function AiSettingsDisclosure({ model, children }) {
  return <details className="relative group">
    <summary aria-label="Настройки AI" className="list-none cursor-pointer p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <Settings2 className="w-4 h-4 text-indigo-500" />
      <span className="hidden sm:inline">Настройки AI</span>
      <span className="hidden lg:inline text-xs font-normal text-slate-600">{model} · рекомендуется</span>
    </summary>
    <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl z-50">{children}</div>
  </details>;
}

function Markdown({ children }) {
  if (!children) return null;
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-700 prose-p:leading-relaxed">
      <Suspense fallback={<p role="status">Загрузка представления…</p>}><SafeMarkdown>{children}</SafeMarkdown></Suspense>
    </div>
  );
}

function collectRequirements(value) {
  const output = { business: [], functional: [], nonfunctional: [] };
  const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
  const add = (source) => {
    if (!source || typeof source !== 'object') return;
    Object.keys(output).forEach((key) => {
      if (!Array.isArray(source[key])) return;
      source[key].forEach((item) => {
        const fallbackId = `${prefixes[key]}-${output[key].length + 1}`;
        output[key].push(typeof item === 'string'
          ? { id: fallbackId, text: item }
          : { ...item, id: item.id || fallbackId, text: item.text || item.description || '' });
      });
    });
  };
  add(value);
  if (Array.isArray(value?.decomposition)) value.decomposition.forEach((section) => add(section?.content));
  return output;
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isBabokRegistry(value) {
  return Boolean(value
    && value.schemaVersion === 'babok-requirements.v1'
    && value.mode === 'DECOMPOSITION'
    && value.groups
    && BABOK_REQUIREMENT_TYPES.every((type) => Array.isArray(value.groups[type])));
}

function babokRegistryFrom(value, latestVersion) {
  if (isBabokRegistry(latestVersion?.registry)) return latestVersion.registry;
  if (isBabokRegistry(value)) return value;
  if (isBabokRegistry(value?.baseRegistry)) return value.baseRegistry;
  return null;
}

function babokRegistryCounts(registry) {
  const groups = registry?.groups || {};
  const analysis = registry?.analysis || {};
  return {
    BR: groups.BR?.length || 0,
    SR: groups.SR?.length || 0,
    FR: groups.FR?.length || 0,
    NFR: groups.NFR?.length || 0,
    TR: groups.TR?.length || 0,
    CON: groups.CON?.length || 0,
    CTX: registry?.context?.length || 0,
    GAP: analysis.GAP?.length || 0,
    HYP: analysis.HYP?.length || 0,
    TERM: analysis.TERM?.length || 0,
    DELTA: analysis.delta?.length || 0,
  };
}

function withBabokCounts(registry) {
  return {
    ...registry,
    summary: {
      ...(registry.summary || {}),
      counts: babokRegistryCounts(registry),
    },
  };
}

function stableBabokId(records, prefix, reservedIds = []) {
  const ids = [...records.map((record) => record.id), ...reservedIds].filter((id) => id?.startsWith(`${prefix}-`));
  const next = ids.reduce((max, id) => Math.max(max, Number(id.match(/\d+$/)?.[0] || 0)), 0) + 1;
  return `${prefix}-${String(next).padStart(3, '0')}`;
}

function babokManualCitation(artifactId, locator = 'manual-review') {
  return { artifactId, locator, quote: null };
}

function createBabokManualRecord(type, id, text, { sourceArtifactId, fromResearch = false, researchEnhancementKey = null, targetIds = [] } = {}) {
  const common = {
    id,
    text,
    source: babokManualCitation(sourceArtifactId, researchEnhancementKey ? `research:${researchEnhancementKey}` : 'manual-review'),
    provenance: 'Предложено — требует подтверждения',
    quality: 'Требует уточнения',
    ...(fromResearch ? { fromResearch: true } : {}),
    ...(researchEnhancementKey ? { researchEnhancementKey } : {}),
  };
  const related = Array.isArray(targetIds) ? targetIds.filter(Boolean) : [];
  if (type === 'BR') return { ...common, successIndicator: null, relatedIds: related };
  if (type === 'SR') return { ...common, role: null, relatedTo: related };
  if (type === 'FR') return { ...common, relatedTo: related };
  if (type === 'NFR') return { ...common, category: 'Не указано', scope: null, relatedTo: related, verificationMethod: null };
  if (type === 'TR') return { ...common, completionCriterion: null, relatedTo: related };
  return { ...common, obligation: text, scope: null, relatedTo: related };
}

function removeBabokRecord(registry, type, id) {
  const next = cloneJson(registry);
  if (BABOK_REQUIREMENT_TYPES.includes(type)) {
    next.groups[type] = next.groups[type].filter((item) => item.id !== id);
  }
  if (type === 'CTX') next.context = next.context.filter((item) => item.id !== id);
  if (BABOK_ANALYSIS_TYPES.includes(type)) next.analysis[type] = next.analysis[type].filter((item) => item.id !== id);
  if (type === 'GAP') next.analysis.questions = next.analysis.questions.filter((item) => item.gapId !== id);
  const scrub = (ids) => (Array.isArray(ids) ? ids.filter((item) => item !== id) : []);
  next.context = next.context.map((item) => ({ ...item, relatedIds: scrub(item.relatedIds) }));
  BABOK_REQUIREMENT_TYPES.forEach((group) => {
    next.groups[group] = next.groups[group].map((item) => ({
      ...item,
      ...(Array.isArray(item.relatedIds) ? { relatedIds: scrub(item.relatedIds) } : {}),
      ...(Array.isArray(item.relatedTo) ? { relatedTo: scrub(item.relatedTo) } : {}),
    }));
  });
  BABOK_ANALYSIS_TYPES.forEach((analysisType) => {
    next.analysis[analysisType] = next.analysis[analysisType].map((item) => ({ ...item, affectedIds: scrub(item.affectedIds) }));
  });
  next.analysis.traceability = next.analysis.traceability.filter((item) => item.from !== id && item.to !== id);
  next.analysis.delta = next.analysis.delta.filter((item) => item.baselineId !== id && item.newId !== id);
  next.analysis.questions = next.analysis.questions.filter((item) => item.id !== id);
  return withBabokCounts(next);
}

function babokRecordDetails(type, record) {
  const fields = [];
  if (type === 'BR' && record.successIndicator) fields.push(['Критерий успеха', record.successIndicator]);
  if (type === 'SR' && record.role) fields.push(['Роль', record.role]);
  if (type === 'NFR') {
    if (record.category) fields.push(['Категория', record.category]);
    if (record.scope) fields.push(['Область', record.scope]);
    if (record.verificationMethod) fields.push(['Метод проверки', record.verificationMethod]);
  }
  if (type === 'TR' && record.completionCriterion) fields.push(['Критерий завершения', record.completionCriterion]);
  if (type === 'CON') {
    if (record.obligation) fields.push(['Обязательство', record.obligation]);
    if (record.scope) fields.push(['Область', record.scope]);
  }
  const related = record.relatedIds || record.relatedTo || [];
  if (related.length) fields.push(['Связанные записи', related.join(', ')]);
  return fields;
}

function EditableRequirementCard({ type, requirement, onEdit, onDelete, onDraftChange, readOnly = false }) {
  const field = useDraftField({ group: type, id: requirement.id, text: requirement.text });
  const [localEditing, setLocalEditing] = useState(false);
  const [localText, setLocalText] = useState(requirement.text);
  const editing = field.controlled ? Boolean(field.draft) : localEditing;
  const text = field.draft?.text ?? localText;
  const setEditing = (value) => { if (field.controlled) { if (value) field.start(); else field.clear(); } else setLocalEditing(value); };
  const setText = (value) => { if (field.controlled) field.change(value); else setLocalText(value); };

  function save() {
    if (!text.trim()) return;
    onEdit(text.trim());
    onDraftChange?.(false);
    setEditing(false);
  }

  function cancel() {
    setText(requirement.text);
    onDraftChange?.(false);
    setEditing(false);
  }

  return (
    <article id={`record-${requirement.id}`} tabIndex={-1} style={{ scrollMarginTop: '9rem' }} className={`group relative py-5 first:pt-0 last:pb-0 ${requirement.fromResearch ? 'bg-indigo-50/40 -mx-3 px-3 rounded-xl' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <a href={`#record-${requirement.id}`} className="text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded underline underline-offset-2">{requirement.id}</a>
          {requirement.fromResearch && <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><Sparkles className="w-3.5 h-3.5" />AI</span>}
        </div>
        {!editing && !readOnly && <details className="relative">
          <summary role="button" aria-label={`Действия для ${requirement.id}`} title="Действия" className="list-none cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><MoreHorizontal className="w-5 h-5" /></summary>
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            <button onClick={(event) => { setEditing(true); event.currentTarget.closest('details').removeAttribute('open'); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Pencil className="w-4 h-4" />Редактировать</button>
            <button onClick={onDelete} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-4 h-4" />Удалить</button>
          </div>
        </details>}
      </div>
      {editing ? (
        <div>
          <textarea aria-label={`Текст требования ${requirement.id}`} value={text} onChange={(event) => { setText(event.target.value); onDraftChange?.(event.target.value !== requirement.text); }} rows={3} autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none" />
          <div className="flex gap-2 mt-2">
            <button onClick={save} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Готово</button>
            <button onClick={cancel} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Отмена</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[15px] text-slate-700 leading-7 w-full">{requirement.text}</p>
        </>
      )}
    </article>
  );
}

function BabokRequirementCard({ type, requirement, onEdit, onDelete, onDraftChange, readOnly = false, materials, manuallyEdited = false, onNavigate, onDiscuss, focused = false }) {
  const field = useDraftField({ group: type, id: requirement.id, text: requirement.text || '' });
  const [localEditing, setLocalEditing] = useState(false);
  const [localText, setLocalText] = useState(requirement.text || '');
  const editing = field.controlled ? Boolean(field.draft) : localEditing;
  const text = field.draft?.text ?? localText;
  const setEditing = (value) => { if (field.controlled) { if (value) field.start(); else field.clear(); } else setLocalEditing(value); };
  const setText = (value) => { if (field.controlled) field.change(value); else setLocalText(value); };
  const details = babokRecordDetails(type, requirement).filter(([label]) => label !== 'Связанные записи');
  const source = requirement.source;
  const [fieldError, setFieldError] = useState('');

  function save() {
    if (!text.trim()) return;
    const invalid = (STRUCTURED_FIELDS[type] || []).find(([name, , required]) => required && !(Object.hasOwn(field.draft?.fields || {}, name) ? field.draft.fields[name] : requirement[name])?.trim());
    if (invalid) { setFieldError(`Заполните поле «${invalid[1]}».`); document.querySelector(`[data-review-field="${requirement.id}:${invalid[0]}"]`)?.focus(); return; }
    setFieldError('');
    onEdit(text.trim(), field.draft?.fields || {});
    onDraftChange?.(false);
    setEditing(false);
  }

  function cancel() {
    setText(requirement.text || '');
    onDraftChange?.(false);
    setEditing(false);
  }

  return (
    <article id={`record-${requirement.id}`} tabIndex={-1} style={{ scrollMarginTop: '9rem' }} className={`group relative ${focused ? '' : 'py-5 first:pt-0 last:pb-0'} ${requirement.fromResearch ? 'bg-indigo-50/40 -mx-3 px-3 rounded-xl' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <RecordLinks ids={[requirement.id]} onNavigate={onNavigate} />
          {(manuallyEdited || requirement.manuallyEdited) && <span className="text-xs text-slate-600">Изменено вручную</span>}
          {focused && requirement.quality === 'Готово' && <span className="text-xs font-semibold text-emerald-700">Готово</span>}
          {requirement.quality !== 'Готово' && <span className="text-xs rounded bg-amber-50 px-2 py-1 text-amber-800">{BABOK_QUALITY_LABELS[requirement.quality] || 'Нужно уточнить'}</span>}
          {requirement.fromResearch && <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><Sparkles className="w-3.5 h-3.5" />AI-предложение</span>}
          {requirement.researchEnhancementKey && <span className="text-[11px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">решение сохранено</span>}
        </div>
        {!editing && (onDiscuss || !readOnly) && <details className="relative">
          <summary role="button" aria-label={`Действия для ${requirement.id}`} title="Действия" className="list-none cursor-pointer rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><MoreHorizontal className="w-5 h-5" /></summary>
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
            {!focused && onDiscuss && <button type="button" onClick={(event) => { onDiscuss(requirement.id); event.currentTarget.closest('details').removeAttribute('open'); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50 flex items-center gap-2"><MessageCircle className="w-4 h-4" />Обсудить с AI</button>}
            {!readOnly && <>
            {!focused && <button onClick={(event) => { setEditing(true); event.currentTarget.closest('details').removeAttribute('open'); }} className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50 flex items-center gap-2"><Pencil className="w-4 h-4" />Редактировать</button>}
            <button onClick={onDelete} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"><Trash2 className="w-4 h-4" />Удалить</button>
            </>}
          </div>
        </details>}
      </div>
      {editing ? (
        <div>
          <textarea aria-label={`Текст требования ${requirement.id}`} value={text} onChange={(event) => { setText(event.target.value); onDraftChange?.(event.target.value !== (requirement.text || '')); }} rows={3} autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none" />
          {fieldError && <p role="alert" className="text-sm text-red-700">{fieldError}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(STRUCTURED_FIELDS[type] || []).map(([name, label, required]) => <label key={name} className="text-xs font-semibold text-slate-600">{label}{required ? ' *' : ''}<input data-review-field={`${requirement.id}:${name}`} aria-label={`${label} ${requirement.id}`} value={(Object.hasOwn(field.draft?.fields || {}, name) ? field.draft.fields[name] : requirement[name]) ?? ''} onChange={(event) => field.changeField(name, event.target.value || (required ? '' : null))} className="block w-full mt-1 rounded-lg border p-2 text-sm font-normal" /></label>)}
            <label className="text-xs font-semibold text-slate-600">Качество<select aria-label={`Качество ${requirement.id}`} value={field.draft?.fields?.quality ?? requirement.quality} onChange={(event) => field.changeField('quality', event.target.value)} className="block w-full mt-1 rounded-lg border p-2 text-sm font-normal">{QUALITY_OPTIONS.map((quality) => <option key={quality}>{quality}</option>)}</select></label>
          </div>
          <details className="mt-3 text-sm"><summary className="cursor-pointer p-2">Редактировать связи</summary><div className="flex flex-wrap gap-3 p-2">{field.relatedOptions.map((id) => { const name = type === 'BR' ? 'relatedIds' : 'relatedTo'; const selected = field.draft?.fields?.[name] || requirement[name] || []; return <label key={id} className="inline-flex gap-2 items-center p-1"><input type="checkbox" checked={selected.includes(id)} onChange={(event) => field.changeField(name, event.target.checked ? [...selected, id] : selected.filter((value) => value !== id))} />{id}</label>; })}</div></details>
          <p className="text-xs text-slate-500 mt-2">Правки попадут в черновик. Затем сохраните изменения общей кнопкой вверху.</p>
          <div className="flex gap-2 mt-2">
            <button onClick={save} disabled={!text.trim()} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300">Применить к черновику</button>
            <button onClick={cancel} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Отмена</button>
          </div>
        </div>
      ) : focused ? <h2 className="text-xl font-bold leading-snug text-slate-950 sm:text-2xl">{requirement.text}</h2> : <p className="text-[15px] text-slate-700 leading-7 w-full">{requirement.text}</p>}
      {focused && !editing && <div className="mt-4 flex flex-wrap items-center gap-2">
        {!readOnly && <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Pencil aria-hidden="true" className="h-4 w-4" />Редактировать</button>}
        {onDiscuss && <button type="button" onClick={() => onDiscuss(requirement.id)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50"><MessageCircle aria-hidden="true" className="h-4 w-4" />Обсудить с AI</button>}
      </div>}
      <RequirementClarifications requirement={requirement} editing={editing} readOnly={readOnly} onNavigate={onNavigate} />
      <details open={focused || undefined} className="mt-3 rounded-lg border border-slate-100 bg-slate-50/70 group/evidence">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-600 flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          <span>Источник, качество и связи</span><ChevronDown className="w-3.5 h-3.5 group-open/evidence:hidden" /><ChevronUp className="w-3.5 h-3.5 hidden group-open/evidence:block" />
        </summary>
        <div className="border-t border-slate-100 px-3 py-3 space-y-2 text-xs text-slate-600">
          <RecordLinks ids={requirement.relatedIds || requirement.relatedTo} onNavigate={onNavigate} />
          {details.map(([label, value]) => <p key={label}><span className="font-semibold text-slate-500">{label}:</span> {value}</p>)}
          <SourceEvidence source={source} materials={materials} />
          <p><span className="font-semibold text-slate-500">Происхождение:</span> {BABOK_PROVENANCE_LABELS[requirement.provenance] || requirement.provenance || '—'}</p>
          <p><span className="font-semibold text-slate-500">Качество:</span> {BABOK_QUALITY_LABELS[requirement.quality] || requirement.quality || '—'}</p>
        </div>
      </details>
    </article>
  );
}

function BabokAddRequirementForm({ type, categoryLabel, onAdd, onDraftChange }) {
  const field = useDraftField({ group: type, id: `new-${type}`, isNew: true });
  const [localText, setLocalText] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  const text = field.draft?.text ?? localText;
  const open = field.controlled ? Boolean(field.draft) : localOpen;
  const setText = (value) => { if (field.controlled) field.change(value); else setLocalText(value); };
  const setOpen = (value) => { if (field.controlled) { if (value) field.start(); else field.clear(); } else setLocalOpen(value); };
  const [error, setError] = useState('');

  function add() {
    const value = text.trim();
    if (!value) {
      setError('Введите формулировку требования.');
      return;
    }
    onAdd(value);
    onDraftChange?.(false);
    setText('');
    setError('');
    setOpen(false);
  }

  if (!open) return <button data-add-requirement onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="w-4 h-4" />Добавить требование</button>;
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">Новое требование · {type} · {categoryLabel}</p>
      <textarea data-review-field={`new-${type}:text`} required aria-label={`Новое требование: ${type}`} value={text} onChange={(event) => { setText(event.target.value); setError(''); onDraftChange?.(Boolean(event.target.value)); }} rows={3} autoFocus placeholder="Введите формулировку требования..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none bg-white" />
      {error && <p role="alert" className="text-xs text-red-600 mt-2">{error}</p>}
      <div className="mt-2 flex gap-2">
        <button onClick={add} disabled={!text.trim()} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300">Добавить</button>
        <button onClick={() => { setText(''); setError(''); onDraftChange?.(false); setOpen(false); }} className="px-4 py-2 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200">Отмена</button>
      </div>
    </div>
  );
}

function AddRequirementForm({ type, onAdd, onDraftChange, categoryLabel }) {
  const field = useDraftField({ group: type, id: `new-${type}`, isNew: true });
  const [localText, setLocalText] = useState('');
  const [localOpen, setLocalOpen] = useState(false);
  const text = field.draft?.text ?? localText;
  const open = field.controlled ? Boolean(field.draft) : localOpen;
  const setText = (value) => { if (field.controlled) field.change(value); else setLocalText(value); };
  const setOpen = (value) => { if (field.controlled) { if (value) field.start(); else field.clear(); } else setLocalOpen(value); };
  function add() {
    if (!text.trim()) return;
    onAdd(text.trim());
    onDraftChange?.(false);
    setText('');
    setOpen(false);
  }
  if (!open) return <button data-add-requirement onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="w-4 h-4" />Добавить требование</button>;
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">Новое требование · {categoryLabel}</p>
      <textarea data-review-field={`new-${type}:text`} aria-label={`Новое требование: ${categoryLabel}`} value={text} onChange={(event) => { setText(event.target.value); onDraftChange?.(Boolean(event.target.value)); }} rows={3} autoFocus placeholder="Введите формулировку требования..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none bg-white" />
      <div className="mt-2 flex gap-2">
        <button onClick={add} disabled={!text.trim()} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300">Добавить</button>
        <button onClick={() => { setText(''); onDraftChange?.(false); setOpen(false); }} className="px-4 py-2 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200">Отмена</button>
      </div>
    </div>
  );
}

function useRequirementsLayout() {
  const [layout, setLayoutState] = useState(() => { try { const value = localStorage.getItem('reqai.requirementsView') || localStorage.getItem('reqai.requirementsLayout'); return ['by-type', 'rows'].includes(value) ? 'rows' : 'columns'; } catch { return 'columns'; } });
  function setLayout(value) {
    setLayoutState(value);
    try { localStorage.setItem('reqai.requirementsView', value === 'rows' ? 'by-type' : 'all'); } catch { /* preference is optional */ }
  }
  return [layout, setLayout];
}

function RequirementsLayoutToggle({ layout, onChange }) {
  return <div role="group" aria-label="Вид требований" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
    <button type="button" aria-pressed={layout === 'columns'} onClick={() => onChange('columns')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${layout === 'columns' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><Columns3 className="w-3.5 h-3.5" />Все требования</button>
    <button type="button" aria-pressed={layout === 'rows'} onClick={() => onChange('rows')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${layout === 'rows' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><List className="w-3.5 h-3.5" />По типам</button>
  </div>;
}

function BabokRegistryResult({ value, latestVersion, onSave, onStartResearch, onDirtyChange, busy, researchBusy, finalVersion = false, readOnly = false, title = null, onBack = null, initialRecordId = null, jobId = null, discussionEnabled = true }) {
  const initialRegistry = babokRegistryFrom(value, latestVersion) || value;
  const review = useReviewState(initialRegistry, latestVersion?.decisions || {}, { readOnly });
  const { content: registry, setContent: setRegistry } = review;
  const requirementIndex = useMemo(() => buildBabokRequirementIndex(registry, { requirementTypes: BABOK_REQUIREMENT_TYPES, analysisTypes: BABOK_ANALYSIS_TYPES }), [registry]);
  const [validationError, setValidationError] = useState(null);
  const [dirtyDrafts, setDirtyDrafts] = useState(() => new Set());
  const [editedRecordIds, setEditedRecordIds] = useState(() => new Set());
  const [pendingDeletion, setPendingDeletion] = useState(null);
  const [lastDeletion, setLastDeletion] = useState(null);
  const compact = !readOnly && !finalVersion && !latestVersion?.decisions?.skippedResearch;
  const [typeFilter, setTypeFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState(initialRecordId);
  const [composerType, setComposerType] = useState(null);
  const [activeType, setActiveType] = useState(() => BABOK_REQUIREMENT_TYPES.find((key) => value.groups[key]?.some((record) => record.id === initialRecordId)) || 'BR');
  const [needsClarification, setNeedsClarification] = useState(false);
  const [reviewSection, setReviewSection] = useState(/^(GAP|QUESTION)-/.test(initialRecordId || '') ? 'questions' : 'requirements');
  const [discussionAnchor, setDiscussionAnchor] = useState(null);
  const navigateRecord = (id, { edit = false } = {}) => {
    const type = BABOK_REQUIREMENT_TYPES.find((key) => registry.groups[key].some((record) => record.id === id));
    if (type && edit && !readOnly && !review.state.drafts[`${type}:${id}`]) { const record = registry.groups[type].find((item) => item.id === id); review.field(`${type}:${id}`, { group: type, id, text: record.text, initialText: record.text, isNew: false }); }
    if (type) { setReviewSection('requirements'); setActiveType(type); setTypeFilter(type); setNeedsClarification(false); setQuery(''); setSelectedRecordId(id); }
    else if (/^(GAP|QUESTION)-/.test(id)) setReviewSection('questions');
    requestAnimationFrame(() => { const target = document.getElementById(`record-${id}`); let parent = target?.parentElement; while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; } target?.scrollIntoView?.({ block: 'center' }); target?.focus(); if (edit) target?.querySelector('textarea')?.focus(); });
  };
  const selectType = (type) => { setActiveType(type); if (layout === 'columns') requestAnimationFrame(() => { const target = document.getElementById(`req-type-${type}`); target?.scrollIntoView?.({ block: 'start' }); target?.focus(); }); };
  const [layout, setLayout] = useRequirementsLayout();
  const finalMode = finalVersion || latestVersion?.decisions?.skippedResearch;
  const hasSavedVersion = readOnly || Boolean(latestVersion?.versionId);
  const baseline = latestVersion?.registry || value;
  const hasUnsavedChanges = !readOnly && (review.dirty || !latestVersion?.versionId || JSON.stringify(registry) !== JSON.stringify(baseline));
  const activeMeta = BABOK_REQUIREMENT_COLUMNS.find(([type]) => type === activeType) || BABOK_REQUIREMENT_COLUMNS[0];
  const visibleTypes = layout === 'rows' ? [activeType] : BABOK_REQUIREMENT_TYPES;

  const entries = filterRequirementList(BABOK_REQUIREMENT_COLUMNS, registry.groups, { type: typeFilter, query, needsClarification });
  const selectedEntry = selectedRequirementEntry(entries, selectedRecordId);
  function changeFilters(patch) {
    const next = { type: typeFilter, query, needsClarification, ...patch };
    const nextEntries = filterRequirementList(BABOK_REQUIREMENT_COLUMNS, registry.groups, next);
    setSelectedRecordId(selectedRequirementEntry(nextEntries, selectedEntry?.requirement.id)?.requirement.id || null);
    setTypeFilter(next.type); setQuery(next.query); setNeedsClarification(next.needsClarification);
  }

  useEffect(() => {
    if (!readOnly) onDirtyChange?.(hasUnsavedChanges || dirtyDrafts.size > 0);
  }, [dirtyDrafts, hasUnsavedChanges, onDirtyChange, readOnly]);

  function setDraftDirty(key, dirty) {
    setDirtyDrafts((current) => { const next = new Set(current); if (dirty) next.add(key); else next.delete(key); return next; });
  }

  function markEdited(id) {
    setEditedRecordIds((current) => new Set(current).add(id));
  }

  function editRequirement(type, id, text, fields = {}) {
    setRegistry((current) => withBabokCounts({ ...current, groups: { ...current.groups, [type]: current.groups[type].map((item) => item.id === id ? { ...item, ...fields, text } : item) } }));
    markEdited(id);
  }

  function deleteRequirement(type, id) {
    const records = [...BABOK_REQUIREMENT_TYPES.flatMap((key) => registry.groups[key]), ...registry.context, ...BABOK_ANALYSIS_TYPES.flatMap((key) => registry.analysis[key])];
    const affectedIds = records.filter((record) => [...(record.relatedIds || record.relatedTo || []), ...(record.affectedIds || [])].includes(id)).map((record) => record.id);
    setPendingDeletion({ type, id, affectedIds, links: registry.analysis.traceability.filter((link) => link.from === id || link.to === id).length });
  }

  function confirmDeletion() {
    const { type, id } = pendingDeletion;
    const after = removeBabokRecord(registry, type, id);
    setLastDeletion({ before: registry, after, id });
    setRegistry(after);
    review.clear(`${type}:${id}`);
    markEdited(id);
    setPendingDeletion(null);
    if (compact) {
      const next = selectedRequirementEntry(filterRequirementList(BABOK_REQUIREMENT_COLUMNS, after.groups, { type: typeFilter, query, needsClarification }), selectedRecordId);
      requestAnimationFrame(() => (document.getElementById(`record-${next?.requirement.id}`) || document.querySelector('input[type="search"]'))?.focus());
    }
  }

  function undoDeletion() {
    const restored = rebaseReview(review.state, lastDeletion.after, lastDeletion.before, review.state.decisions, review.state.decisions);
    review.dispatch({ type: 'restore', value: restored.state });
    if (compact) {
      setSelectedRecordId(lastDeletion.id); setQuery(''); setTypeFilter('all'); setNeedsClarification(false);
      requestAnimationFrame(() => document.getElementById(`record-${lastDeletion.id}`)?.focus());
    }
    setLastDeletion(null);
  }

  function addRequirement(type, text) {
    const id = stableBabokId(registry.groups[type], type, review.state.reservedIds);
    setActiveType(type); setTypeFilter(type); setReviewSection('requirements');
    setQuery(''); setNeedsClarification(false); setSelectedRecordId(id); setComposerType(null);
    markEdited(id);
    setRegistry((current) => {
      const actualId = stableBabokId(current.groups[type], type, review.state.reservedIds);
      return withBabokCounts({ ...current, groups: { ...current.groups, [type]: [...current.groups[type], createBabokManualRecord(type, actualId, text, { sourceArtifactId: current.materials.primary.artifactId })] } });
    });
    if (compact) requestAnimationFrame(() => { const target = document.getElementById(`record-${id}`); target?.focus(); target?.scrollIntoView?.({ block: 'nearest' }); });
    return id;
  }

  function saveRegistry(decisions = review.state.decisions) {
    const assembled = assembleReview({ ...review.state, decisions }, (type, text, records) => createBabokManualRecord(type, stableBabokId(records, type, review.state.reservedIds), text, { sourceArtifactId: registry.materials.primary.artifactId }), withBabokCounts);
    setValidationError(assembled.error || null);
    if (assembled.error) {
      setActiveType(assembled.error.type); setTypeFilter(assembled.error.type); setReviewSection('requirements'); setNeedsClarification(false); setQuery(''); setSelectedRecordId(assembled.error.id);
      if (assembled.error.id.startsWith('new-')) setComposerType(assembled.error.type);
      else {
        const record = registry.groups[assembled.error.type]?.find((item) => item.id === assembled.error.id);
        if (record && !review.state.drafts[`${assembled.error.type}:${record.id}`]) review.field(`${assembled.error.type}:${record.id}`, { group: assembled.error.type, id: record.id, text: record.text, initialText: record.text, isNew: false });
      }
      requestAnimationFrame(() => (document.querySelector(`[data-review-field="${assembled.error.id}:${assembled.error.field}"]`) || document.querySelector(`[aria-label="Текст требования ${assembled.error.id}"]`))?.focus());
      return;
    }
    const originalRecords = new Map(BABOK_REQUIREMENT_TYPES.flatMap((type) => (baseline.groups || baseline)[type] || []).map((record) => [record.id, record]));
    const draftIds = BABOK_REQUIREMENT_TYPES.flatMap((type) => assembled.content.groups[type]).filter((record) => JSON.stringify(originalRecords.get(record.id)) !== JSON.stringify(record)).map((record) => record.id);
    return onSave?.({ registry: assembled.content, baseVersionId: latestVersion?.versionId || null, decisions: assembled.decisions, editedRecordIds: [...new Set([...editedRecordIds, ...draftIds])] });
  }

  const discussionContext = useMemo(() => {
    const assembled = assembleReview(review.state, (type, text, records) => createBabokManualRecord(type, stableBabokId(records, type, review.state.reservedIds), text, { sourceArtifactId: registry.materials?.primary?.artifactId || null }), withBabokCounts);
    const unsaved = Boolean(review.dirty || JSON.stringify(assembled.content) !== JSON.stringify(latestVersion?.registry || initialRegistry) || JSON.stringify(assembled.decisions) !== JSON.stringify(latestVersion?.decisions || {}));
    return assembled.error ? { error: assembled.error, registry: null, decisions: review.state.decisions, unsaved: true } : { error: null, registry: assembled.content, decisions: assembled.decisions, unsaved };
  }, [registry, review.state, review.dirty, initialRegistry, latestVersion?.registry, latestVersion?.decisions]);

  function openDiscussion(anchorId) {
    setValidationError(null);
    setDiscussionAnchor(anchorId);
  }

  const discussionAnchorLabel = discussionAnchor
    ? (registry.analysis?.GAP || []).find((item) => item.id === discussionAnchor)?.text
      || BABOK_REQUIREMENT_TYPES.flatMap((type) => registry.groups[type] || []).find((item) => item.id === discussionAnchor)?.text
      || ''
    : '';

  function applyDiscussionProposal(proposal) {
    if (readOnly || !proposal?.proposalId || !Array.isArray(proposal.changes) || (!proposal.changes.length && !proposal.clarification)) return false;
    // A previously accepted package is already present in this draft. Treat a
    // repeated click as an idempotent success so the panel can reflect that
    // state without applying the edits twice.
    if (review.state.decisions.review?.discussionProposals?.[proposal.proposalId]?.decision === 'accepted') return true;
    if (proposal.baseVersionId && latestVersion?.versionId && proposal.baseVersionId !== latestVersion.versionId) {
      setValidationError({ id: discussionAnchor, message: 'Предложение устарело: сохранённая версия требований изменилась. Запросите новый вариант.' });
      return false;
    }
    const assembled = discussionContext.error ? null : discussionContext.registry;
    if (!assembled) {
      setValidationError(discussionContext.error || { id: discussionAnchor, message: 'Исправьте незавершённые правки перед применением предложения.' });
      return false;
    }
    if (proposal.clarification && !clarificationIsCurrent(assembled, discussionContext.decisions, proposal)) {
      setValidationError({ id: proposal.clarification.gapId, message: 'Уточнение устарело: изменились вопрос, требования или связи. Запросите новый вариант.' });
      return false;
    }
    const byId = new Map(BABOK_REQUIREMENT_TYPES.flatMap((type) => (assembled.groups[type] || []).map((record) => [record.id, { type, record }])));
    const targets = [];
    for (const change of proposal.changes) {
      const target = byId.get(change.targetId);
      if (!target || !change.before || !change.after || Object.keys(change.after).some((field) => String(target.record[field] ?? '') !== String(change.before[field] ?? ''))) {
        setValidationError({ id: change.targetId || discussionAnchor, message: 'Предложение устарело: требование или его основание изменилось. Запросите новый вариант.' });
        return false;
      }
      targets.push({ ...change, ...target });
    }
    if (proposal.gapBases) {
      const currentGapBases = discussionGapBases(assembled, discussionContext.decisions);
      for (const [gapId, basis] of Object.entries(proposal.gapBases)) {
        if (JSON.stringify(currentGapBases[gapId] || null) !== JSON.stringify(basis)) {
          setValidationError({ id: gapId, message: 'Предложение устарело: ответ или формулировка GAP изменились. Запросите новый вариант.' });
          return false;
        }
      }
    }
    const next = withBabokCounts({ ...assembled, groups: { ...assembled.groups } });
    for (const change of targets) next.groups[change.type] = next.groups[change.type].map((record) => record.id === change.targetId ? { ...record, ...change.after } : record);
    const accepted = { proposalId: proposal.proposalId, decision: 'accepted', baseHash: proposal.baseHash, changes: targets.map(({ targetId, before, after, beforeHash, rationale }) => ({ targetId, before, after, beforeHash, ...(rationale ? { rationale } : {}) })), ...(proposal.baseVersionId ? { baseVersionId: proposal.baseVersionId } : {}), ...(proposal.gapBases ? { gapBases: proposal.gapBases } : {}) };
    if (proposal.clarification) { const { gapId, answer, canResolve, remainingQuestions, checks } = proposal.clarification; accepted.clarification = { gapId, answer, canResolve, remainingQuestions, checks }; }
    review.dispatch({ type: 'proposal', value: next, proposal: accepted, clarification: proposal.clarification, clearDraftIds: targets.map((item) => item.targetId) });
    targets.forEach((item) => markEdited(item.targetId));
    setValidationError(null);
    return true;
  }

  function rejectDiscussionProposal(proposal) {
    if (readOnly || !proposal?.proposalId) return false;
    if (review.state.decisions.review?.discussionProposals?.[proposal.proposalId]) return true;
    review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { discussionProposals: { ...(review.state.decisions.review?.discussionProposals || {}), [proposal.proposalId]: { proposalId: proposal.proposalId, decision: 'rejected', baseHash: proposal.baseHash, changes: proposal.changes || [], ...(proposal.baseVersionId ? { baseVersionId: proposal.baseVersionId } : {}), ...(proposal.gapBases ? { gapBases: proposal.gapBases } : {}) } } }) });
    return true;
  }

  const statusText = readOnly
    ? 'Только чтение · источник AI-исследования'
    : busy ? 'Сохраняем…' : !hasSavedVersion ? 'Сохраните требования перед AI-исследованием' : hasUnsavedChanges ? 'Есть несохранённые изменения' : `Сохранено · ${latestVersion?.createdAt ? new Date(latestVersion.createdAt).toLocaleString() : 'только что'}`;
  return (
    <ReviewDraftProvider review={review} submit={saveRegistry} busy={busy}><div className={compact ? "space-y-2" : "space-y-5"}>
      {pendingDeletion && <ReviewDialog label="Удаление требования" onClose={() => setPendingDeletion(null)}><h2 className="text-lg font-bold">Удалить {pendingDeletion.id}?</h2><p className="my-3">Связанные записи: {pendingDeletion.affectedIds.join(', ') || 'нет'}. Связей в схеме: {pendingDeletion.links}. Ссылки на удалённое требование будут убраны. До сохранения удаление можно отменить.</p><div className="flex gap-3"><button className="rounded-lg border p-3" onClick={() => setPendingDeletion(null)}>Не удалять</button><button className="rounded-lg bg-red-700 text-white p-3" onClick={confirmDeletion}>Подтвердить удаление</button></div></ReviewDialog>}
      {lastDeletion && <p role="status" className="rounded-xl bg-amber-50 p-3">Удалено {lastDeletion.id}. <button className="font-semibold text-indigo-700 underline p-2" onClick={undoDeletion}>Отменить удаление</button></p>}
      {validationError && <p role="alert" className="text-sm text-red-700">{validationError.id}: {validationError.message}</p>}
      {compact ? <RequirementsReviewHeader version={latestVersion} dirty={hasUnsavedChanges} busy={busy} researchBusy={researchBusy} onSave={() => saveRegistry()} onResearch={(savedVersionId) => onStartResearch?.({ requirementsVersionId: savedVersionId })} onFinal={() => saveRegistry({ ...review.state.decisions, skippedResearch: true })} /> : <>
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {hasSavedVersion && !hasUnsavedChanges && <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Check className="w-4 h-4" /></span>}
          <div className="min-w-0"><h1 className="text-base font-semibold text-slate-900">{title || (finalMode ? 'Финальная версия требований' : 'Проверка требований')}</h1><p id="babok-save-status" role="status" className={`text-xs mt-0.5 ${hasSavedVersion && !hasUnsavedChanges ? 'text-emerald-700' : 'text-slate-600'}`}>{statusText}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onBack && <button onClick={onBack} className="h-10 shrink-0 whitespace-nowrap px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2"><ArrowLeft className="w-4 h-4" />К результатам AI-исследования</button>}
        {!readOnly && <>
          <ResultExportAction />
          {hasUnsavedChanges && <button disabled={busy} onClick={() => saveRegistry()} className="h-10 shrink-0 whitespace-nowrap px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{hasSavedVersion ? 'Сохранить изменения' : 'Сохранить проверенную версию'}</button>}
          {!finalMode && <>
            <button aria-label={researchBusy ? 'AI-исследование выполняется…' : 'Улучшить требования с помощью AI'} aria-describedby="babok-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : researchBusy ? 'Дождитесь завершения текущего AI-исследования' : 'Необязательный следующий шаг'} disabled={busy || researchBusy || !hasSavedVersion || hasUnsavedChanges} onClick={() => onStartResearch?.({ requirementsVersionId: latestVersion.versionId })} className="h-10 shrink-0 whitespace-nowrap px-4 py-2 border border-indigo-200 bg-white text-indigo-700 text-sm font-semibold rounded-lg hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-600 disabled:bg-slate-100 flex items-center justify-center gap-2">{researchBusy ? <><Loader2 className="w-4 h-4 animate-spin" />AI-исследование выполняется…</> : <><Sparkles className="w-4 h-4" />Улучшить с AI</>}</button>
            <button aria-label="Перейти к финальной версии" aria-describedby="babok-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : 'Пропустить необязательное AI-исследование'} disabled={busy || researchBusy || !hasSavedVersion || hasUnsavedChanges} onClick={() => saveRegistry({ ...(latestVersion?.decisions || {}), skippedResearch: true })} className="h-10 shrink-0 whitespace-nowrap px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed">К финальной версии</button>
          </>}
          {finalMode && onStartResearch && <button disabled={busy || researchBusy || hasUnsavedChanges} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="h-10 shrink-0 whitespace-nowrap px-4 py-2 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:bg-slate-100 disabled:text-slate-600 flex items-center justify-center gap-2">{researchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Добавить AI-исследование</button>}
        </>}</div>
      </div></>}


      <CoverageWarning registry={registry} />
      <div role="group" aria-label="Разделы проверки" className={compact ? "flex flex-wrap gap-1" : "flex flex-wrap gap-2"}>{[['requirements', 'Требования'], ['questions', 'Вопросы'], ['links', 'Связи'], ['report', 'Полный отчёт']].map(([key, label]) => <button key={key} aria-pressed={reviewSection === key} onClick={() => setReviewSection(key)} className={compact ? `border-b-2 px-1.5 py-2 text-xs sm:text-sm font-semibold ${reviewSection === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}` : `rounded-lg border px-4 py-2 text-sm font-semibold ${reviewSection === key ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}>{compact && key === 'requirements' ? `Реестр · ${BABOK_REQUIREMENT_TYPES.reduce((total, type) => total + registry.groups[type].length, 0)}` : label}{key === 'questions' ? ` · ${registry.analysis.questions.length}` : ''}</button>)}</div>
      {!compact && <p className="text-sm text-slate-600">Требований: {BABOK_REQUIREMENT_TYPES.reduce((total, type) => total + registry.groups[type].length, 0)} · Пробелов: {registry.analysis.GAP.length} · Вопросов: {registry.analysis.questions.length}{registry.scope.partial ? ' · Частичная обработка' : ''}</p>}

      <div hidden={reviewSection !== 'requirements'} className="space-y-4">
      {compact ? <RequirementListWorkspace
        columns={BABOK_REQUIREMENT_COLUMNS} groups={registry.groups} entries={entries} selected={selectedEntry}
        onSelect={setSelectedRecordId} typeFilter={typeFilter} query={query} needsClarification={needsClarification}
        onFiltersChange={changeFilters} qualityLabels={BABOK_QUALITY_LABELS} drafts={review.state.drafts}
        composerMenu={<RequirementComposerMenu columns={BABOK_REQUIREMENT_COLUMNS} onChoose={(type) => { changeFilters({ type, query: '', needsClarification: false }); setComposerType(type); }} />}
        composer={composerType && <section id={`req-type-${composerType}`} aria-label={`Добавление: ${composerType}`} className="rounded-xl border border-slate-200 bg-white p-3">
          <BabokAddRequirementForm key={composerType} type={composerType} categoryLabel={BABOK_REQUIREMENT_COLUMNS.find(([type]) => type === composerType)?.[1]} onAdd={(text) => addRequirement(composerType, text)} onDraftChange={(dirty) => setDraftDirty(`${composerType}:new`, dirty)} />
        </section>}
        renderDetail={({ type, requirement }) => <BabokRequirementCard key={requirement.id} focused type={type} requirement={requirement} materials={registry.materials}
          onNavigate={navigateRecord} onDiscuss={jobId && discussionEnabled ? openDiscussion : undefined}
          manuallyEdited={editedRecordIds.has(requirement.id) || latestVersion?.revision?.manualDecisionMetadata?.editedRecordIds?.includes(requirement.id)}
          onEdit={(text, fields) => editRequirement(type, requirement.id, text, fields)} onDelete={() => deleteRequirement(type, requirement.id)}
          onDraftChange={(dirty) => setDraftDirty(`${type}:${requirement.id}`, dirty)} />}
      /> : <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div><h2 className="text-base font-bold text-slate-900">Типы требований</h2><p className="text-xs text-slate-500 mt-1">Выберите тип, чтобы сфокусироваться на его записях. Стабильные ID сохраняются при ревизиях.</p></div>
        <RequirementsLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <RequirementTypeNav columns={BABOK_REQUIREMENT_COLUMNS} groups={registry.groups} activeType={activeType} onSelect={selectType} />
      <label className="flex items-center gap-2 text-sm text-slate-700 p-2"><input type="checkbox" checked={needsClarification} onChange={(event) => setNeedsClarification(event.target.checked)} />Нужно уточнить</label>

      <div id="babok-requirements" aria-label="Реестр требований" className="grid gap-4 grid-cols-1">
        {visibleTypes.map((type) => {
          const [, label, subtitle, color] = BABOK_REQUIREMENT_COLUMNS.find((item) => item[0] === type);
          const records = (registry.groups[type] || []).filter((record) => !needsClarification || record.quality !== 'Готово');
          return <section key={type} id={`req-type-${type}`} tabIndex={-1} style={{ scrollMarginTop: '9rem' }} role="region" aria-label={label} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
            <div className="flex items-start justify-between gap-3 mb-2"><div><div className="flex items-center gap-2"><span className="font-mono text-xs font-bold text-slate-500">{type}</span><h2 className="text-base font-bold text-slate-900">{label}</h2></div><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{records.length}</span></div>
            <div className="divide-y divide-slate-200 mt-4">
              {records.map((item) => <BabokRequirementCard key={item.id} type={type} materials={registry.materials} onNavigate={navigateRecord} onDiscuss={jobId && discussionEnabled ? openDiscussion : undefined} manuallyEdited={editedRecordIds.has(item.id) || latestVersion?.revision?.manualDecisionMetadata?.editedRecordIds?.includes(item.id)} requirement={item} onEdit={(text, fields) => editRequirement(type, item.id, text, fields)} onDelete={() => deleteRequirement(type, item.id)} onDraftChange={(dirty) => setDraftDirty(`${type}:${item.id}`, dirty)} readOnly={readOnly} />)}
              {!records.length && <p className="py-6 text-sm text-slate-600">Нет сформированных требований</p>}
            </div>
            {!readOnly && <div className="mt-4 pt-3 border-t border-slate-100"><BabokAddRequirementForm type={type} categoryLabel={label} onAdd={(text) => addRequirement(type, text)} onDraftChange={(dirty) => setDraftDirty(`${type}:new`, dirty)} /></div>}
          </section>;
        })}
      </div>
      {layout === 'rows' && <p className="text-xs text-slate-500">Сейчас выбран тип {activeMeta[0]} · {activeMeta[1]}. Переключите вкладку, чтобы просмотреть другой тип.</p>}
      </>}
      </div>
      {reviewSection === 'report' && <Suspense fallback={<p role="status">Загрузка отчёта…</p>}><BabokSkillReport registry={registry} /></Suspense>}
      {reviewSection !== 'requirements' && (reviewSection === 'questions' || reviewSection === 'links'
        ? <RequirementPreviewProvider index={requirementIndex}><RegistryAnalysis registry={registry} section={reviewSection} onNavigate={navigateRecord} onDiscuss={jobId && discussionEnabled ? openDiscussion : undefined} readOnly={readOnly} /></RequirementPreviewProvider>
        : <RegistryAnalysis registry={registry} section={reviewSection} onNavigate={navigateRecord} onDiscuss={jobId && discussionEnabled ? openDiscussion : undefined} readOnly={readOnly} />)}
      <RecordFocus id={initialRecordId} />
      {discussionAnchor && <DiscussionPanel jobId={jobId} anchorId={discussionAnchor} anchorLabel={discussionAnchorLabel} baseVersionId={latestVersion?.versionId || null} draft={discussionContext.unsaved && discussionContext.registry ? { registry: discussionContext.registry, decisions: discussionContext.decisions } : null} proposalDecisions={review.state.decisions.review?.discussionProposals || {}} contextReady={Boolean(jobId && latestVersion?.versionId && !discussionContext.error)} contextError={discussionContext.error ? `${discussionContext.error.id}: ${discussionContext.error.message}` : !latestVersion?.versionId ? 'Сначала сохраните требования, чтобы открыть AI-обсуждение.' : ''} readOnly={readOnly} onClose={() => setDiscussionAnchor(null)} onApplyProposal={applyDiscussionProposal} onRejectProposal={rejectDiscussionProposal} />}
    </div></ReviewDraftProvider>
  );
}

function makeLegacyRecord(type, text, records, reservedIds = []) {
  const prefix = REQUIREMENT_COLUMNS.find(([key]) => key === type)?.[4] || 'REQ';
  const number = [...records, ...reservedIds.filter((id) => id.startsWith(`${prefix}-`)).map((id) => ({ id }))].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
  return { id: `${prefix}-${number}`, text, fromResearch: false };
}

function DecompositionResult({ value, latestVersion, onSave, onStartResearch, onDirtyChange, busy, researchBusy }) {
  const review = useReviewState(latestVersion?.requirements?.business && latestVersion?.requirements?.functional && latestVersion?.requirements?.nonfunctional ? latestVersion.requirements : collectRequirements(value), latestVersion?.decisions || {});
  const { content: requirements, setContent: setRequirements } = review;
  const deletion = useLegacyDeletion(review);
  const [validationError, setValidationError] = useState(null);
  function saveReview(decisions = review.state.decisions) {
    const assembled = assembleReview(review.state, (type, text, records) => makeLegacyRecord(type, text, records, review.state.reservedIds));
    setValidationError(assembled.error || null);
    if (assembled.error) { setTypeFilter(assembled.error.type); requestAnimationFrame(() => document.querySelector(`[aria-label="Текст требования ${assembled.error.id}"]`)?.focus()); return; }
    return onSave({ requirements: assembled.content, baseVersionId: latestVersion?.versionId || null, decisions });
  }
  const [dirtyDrafts, setDirtyDrafts] = useState(() => new Set());
  const [typeFilter, setTypeFilter] = useState('all');
  const hasSavedVersion = Boolean(latestVersion?.versionId);
  const hasUnsavedChanges = review.dirty || dirtyDrafts.size > 0 || !hasSavedVersion || JSON.stringify(requirements) !== JSON.stringify(latestVersion.requirements);

  function setDraftDirty(key, dirty) {
    setDirtyDrafts((current) => { const next = new Set(current); if (dirty) next.add(key); else next.delete(key); return next; });
  }

  useEffect(() => onDirtyChange?.(hasUnsavedChanges), [hasUnsavedChanges, onDirtyChange]);

  function editRequirement(type, id, text) {
    setRequirements((current) => ({ ...current, [type]: current[type].map((item) => item.id === id ? { ...item, text } : item) }));
  }

  function deleteRequirement(type, id) {
    deletion.ask(type, id);
  }

  function addRequirement(type, text, fromResearch = false) {
    const prefix = REQUIREMENT_COLUMNS.find(([key]) => key === type)?.[4] || 'REQ';
    setRequirements((current) => {
      const number = Number(makeLegacyRecord(type, text, current[type], review.state.reservedIds).id.match(/\d+$/)[0]);
      return { ...current, [type]: [...current[type], { id: `${prefix}-${number}`, text, fromResearch }] };
    });
  }

  return (
    <ReviewDraftProvider review={review} submit={saveReview} busy={busy}><div className="space-y-3">
      <LegacyDeletionNotice deletion={deletion} />
      {validationError && <p role="alert">{validationError.id}: {validationError.message}</p>}
      <RequirementsReviewHeader version={latestVersion} dirty={hasUnsavedChanges} busy={busy} researchBusy={researchBusy} onSave={() => saveReview()} onResearch={(savedVersionId) => onStartResearch({ requirementsVersionId: savedVersionId })} onFinal={() => saveReview({ ...review.state.decisions, skippedResearch: true })} />
      <RequirementTypeFilter columns={REQUIREMENT_COLUMNS} groups={requirements} value={typeFilter} onChange={setTypeFilter}><RequirementComposerMenu columns={REQUIREMENT_COLUMNS} onChoose={setTypeFilter} /></RequirementTypeFilter>
      {Object.values(requirements).every((items) => !items.length) && <p className="text-sm text-slate-600">Требований пока нет. Выберите тип, чтобы добавить требование.</p>}
      <div aria-label="Категории требований" className="grid gap-4 grid-cols-1">
        {REQUIREMENT_COLUMNS.filter(([key]) => typeFilter === 'all' ? requirements[key].length > 0 : key === typeFilter).map(([key, title, subtitle, color]) => <section key={key} id={`req-type-${key}`} tabIndex={-1} style={{ scrollMarginTop: '9rem' }} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
          <div className="flex items-start justify-between gap-3 mb-2"><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{requirements[key].length}</span></div>
          <div className="divide-y divide-slate-200 mt-4">
            {requirements[key].map((item) => <EditableRequirementCard key={item.id} type={key} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} onDraftChange={(dirty) => setDraftDirty(`${key}:${item.id}`, dirty)} />)}
            {!requirements[key].length && <p className="py-6 text-sm text-slate-600">Нет сформированных требований</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><AddRequirementForm type={key} categoryLabel={title} onAdd={(text) => addRequirement(key, text)} onDraftChange={(dirty) => setDraftDirty(`${key}:new`, dirty)} /></div>
        </section>)}
      </div>
    </div></ReviewDraftProvider>
  );
}

function ApplicabilityBars({ value }) {
  if (value == null || !Number.isFinite(Number(value))) return <span className="text-xs text-slate-500">Оценка не указана</span>;
  const numericValue = Number(value);
  const normalizedValue = Number.isFinite(numericValue) ? Math.min(100, Math.max(0, numericValue)) : 50;
  const bars = 5;
  const filled = Math.round((normalizedValue / 100) * bars);

  return (
    <div
      role="meter"
      aria-label="Применимость · оценка модели"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={normalizedValue}
      aria-valuetext={`Оценка модели: применимость ${normalizedValue}%`}
      className="flex items-center gap-1.5"
    >
      <span aria-hidden="true" className="flex gap-0.5">
        {Array.from({ length: bars }, (_, index) => (
          <span
            key={index}
            data-testid="applicability-segment"
            data-active={index < filled ? 'true' : 'false'}
            className={`w-1 h-3.5 rounded-sm ${index < filled ? 'bg-emerald-500' : 'bg-gray-200'}`}
          />
        ))}
      </span>
      <span aria-hidden="true" className="text-xs text-gray-500 font-medium">{normalizedValue}%</span>
    </div>
  );
}

function inferTargetTypeFromInsightCategory(category) {
  if (category === 'risks') return 'nonfunctional';
  if (category === 'standards') return 'business';
  return 'functional';
}

function displayEnhancementsForInsight(insight) {
  const raw = Array.isArray(insight.enhancements) ? insight.enhancements : [];
  const structured = raw
    .map((enhancement, sourceIndex) => ({ ...enhancement, sourceIndex }))
    .filter((enhancement) => enhancement && typeof enhancement.text === 'string' && enhancement.text.trim())
    .map((enhancement) => ({
      ...enhancement,
      targetType: TARGET_TYPE_LABELS[enhancement.targetType] ? enhancement.targetType : 'functional',
      targetIds: Array.isArray(enhancement.targetIds) ? enhancement.targetIds : (Array.isArray(enhancement.relatedTo) ? enhancement.relatedTo : []),
      text: enhancement.text.trim(),
    }));
  return structured;
}

function InsightEnhancementDecisionRow({ enhancement, decision, onDecision }) {
  const type = enhancement.targetType || 'functional';
  const label = TARGET_TYPE_LABELS[type] || TARGET_TYPE_LABELS.functional;
  const targetIds = Array.isArray(enhancement.targetIds)
    ? enhancement.targetIds
    : (Array.isArray(enhancement.relatedTo) ? enhancement.relatedTo : []);
  const accepted = decision === 'accepted';
  const rejected = decision === 'rejected';

  return (
    <div className={`rounded-xl border p-4 transition-colors ${accepted ? 'border-emerald-300 bg-emerald-50/60' : rejected ? 'border-slate-300 bg-slate-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Предлагаемое требование</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{label}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${accepted ? 'bg-emerald-100 text-emerald-700' : rejected ? 'bg-slate-200 text-slate-600' : 'bg-slate-100 text-slate-500'}`}>{accepted ? 'Принято' : rejected ? 'Отклонено' : 'На проверке'}</span>
      </div>
      {targetIds.length > 0 && <div className="mt-3 flex items-start gap-2 text-xs text-slate-500">
        <Link2 aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0"><span className="font-semibold text-slate-600">Затрагиваемые требования:</span>{' '}<RecordLinks ids={targetIds} /></span>
      </div>}
      <p className="mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{enhancement.text}</p>
      <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-600"><span className="font-semibold">Обоснование: </span>{enhancement.rationale || 'Не предоставлено моделью.'}</p>
      <p className="mt-3 whitespace-pre-line break-words text-sm text-slate-600"><span className="font-semibold">Условия подтверждения: </span>{enhancement.confirmationConditions || 'Не указаны моделью.'}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          aria-label={`Принять улучшение: ${enhancement.text}`}
          aria-pressed={accepted}
          onClick={() => onDecision('accepted')}
          title={accepted ? 'Проверить принятое изменение' : 'Проверить перед принятием'}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${accepted ? 'border-emerald-600 bg-emerald-600 text-white' : TARGET_TYPE_COLORS[type] || TARGET_TYPE_COLORS.functional}`}
        >
          {accepted ? <Check className="h-4 w-4" /> : <Plus className={`h-4 w-4 ${accepted ? '' : TARGET_TYPE_ICON_COLORS[type] || TARGET_TYPE_ICON_COLORS.functional}`} />}Принять
        </button>
        <button
          type="button"
          aria-label={`Отклонить улучшение: ${enhancement.text}`}
          aria-pressed={rejected}
          onClick={() => onDecision('rejected')}
          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${rejected ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
        >
          Отклонить
        </button>
      </div>
    </div>
  );
}

function SourceRequirementsSnapshot({ requirements, onBack, initialRecordId }) {
  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <h1 className="text-xl font-bold text-slate-900">Требования, переданные в AI-исследование</h1>
              <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Проверенная версия</span>
            </div>
            <p className="text-sm text-slate-500 mt-2">Эта неизменяемая версия использовалась для формирования результатов исследования.</p>
          </div>
          <button onClick={onBack} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><ArrowLeft className="w-4 h-4" />К результатам AI-исследования</button>
        </div>
      </div>
      <div role="region" aria-label="Требования, переданные в AI-исследование" className="grid gap-4 grid-cols-1"><RecordFocus id={initialRecordId} />
        {REQUIREMENT_COLUMNS.map(([type, title, subtitle, color]) => {
          const items = requirements?.[type] || [];
          return <section key={type} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
            <div className="flex items-start justify-between gap-3 mb-2"><div><h3 className="text-base font-bold text-slate-900">{title}</h3><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{items.length}</span></div>
            <div className="divide-y divide-slate-200 mt-4">
              {items.map((item) => <EditableRequirementCard key={item.id} requirement={item} readOnly />)}
              {!items.length && <p className="py-6 text-sm text-slate-600">Нет сформированных требований</p>}
            </div>
          </section>;
        })}
      </div>
    </section>
  );
}

function SourceBusinessContextSnapshot({ value, loading = false, onBack }) {
  return <section className="space-y-5">
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-start justify-between gap-4 flex-wrap">
      <div><h1 className="text-xl font-bold text-slate-900">Исходная бизнес-задача</h1><p className="text-sm text-slate-500 mt-1">Контекст, на основе которого была выполнена первоначальная декомпозиция.</p></div>
      <button onClick={onBack} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />Назад</button>
    </div>
    <div role="region" aria-label="Текст исходной бизнес-задачи" className="rounded-2xl border border-slate-200 bg-white p-5 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{loading ? 'Загружаем исходный контекст…' : value?.trim() || 'Не удалось восстановить текст исходной бизнес-задачи.'}</div>
  </section>;
}

function SourceDataMenu({ onShowContext, onShowRequirements }) {
  return <details className="relative group">
    <summary className="list-none cursor-pointer px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">Исходные данные<ChevronDown className="w-4 h-4 group-open:hidden" /><ChevronUp className="w-4 h-4 hidden group-open:block" /></summary>
    <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white shadow-xl p-2 z-40">
      <button onClick={onShowContext} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">Бизнес-задача</button>
      <button onClick={onShowRequirements} className="w-full text-left px-3 py-2.5 rounded-lg text-sm text-slate-700 hover:bg-slate-50">Требования для AI</button>
    </div>
  </details>;
}

function OriginalBusinessContext({ value, loading = false, editable = false, compact = false, children }) {
  const context = value?.trim();
  return (
    <details className={compact ? "group text-sm" : "group border-t border-slate-200"}>
      <summary aria-label="Исходный бизнес-контекст" className={compact ? "cursor-pointer flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm focus-visible:outline-indigo-600" : "list-none cursor-pointer px-5 md:px-6 py-3.5 flex items-center justify-between gap-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"}>
        <span className="min-w-0">
          <span className="font-semibold text-slate-700">{compact ? 'Исходная задача' : 'Исходная бизнес-задача'}</span>
          <span className={compact ? "hidden sm:inline-block ml-2 text-xs text-slate-600 align-bottom truncate max-w-md" : "block text-xs text-slate-500 truncate mt-0.5 max-w-3xl"}>{loading ? 'Загружаем исходный контекст…' : context || 'Исходный контекст недоступен'}</span>
        </span>
        <span className="font-semibold text-indigo-600 whitespace-nowrap">{editable ? 'Посмотреть и изменить' : 'Посмотреть'}</span>
      </summary>
      <div className="border-t border-slate-200 bg-slate-50/60 p-4 md:p-6">
        {editable ? children : <>
          <h2 className="text-base font-bold text-slate-900">Исходная бизнес-задача</h2>
          <p className="text-xs text-slate-500 mt-1">Контекст, на основе которого была выполнена первоначальная декомпозиция.</p>
          <div role="region" aria-label="Текст исходной бизнес-задачи" className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">
            {loading ? 'Загружаем исходный контекст…' : context || 'Не удалось восстановить текст исходной бизнес-задачи.'}
          </div>
        </>}
      </div>
    </details>
  );
}

function BusinessContextInputCard({ open, onOpenChange, running, summary, children }) {
  const collapsible = Boolean(summary || running);
  const expanded = !collapsible || open;
  return <section className={`bg-white rounded-2xl border ${expanded ? 'p-4 md:p-6 mb-6' : 'px-4 py-3 md:px-5 mb-4'} ${running ? 'border-indigo-300' : 'border-slate-200'}`}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-balance text-lg md:text-xl font-bold text-slate-900 mb-1">{expanded ? 'Сформулируйте бизнес-задачу' : 'Исходная бизнес-задача'}</h2>
        {expanded && <p className="text-pretty text-sm text-slate-500">Опишите цель, ограничения и ожидаемый результат обычным языком.</p>}
        {!expanded && summary && <p className="text-xs text-slate-600 truncate mt-1 max-w-3xl" title={summary}>{summary}</p>}
        {running && expanded && <p className="text-xs font-semibold text-indigo-700 mt-3">Декомпозиция выполняется</p>}
      </div>
      {collapsible && <button type="button" aria-expanded={expanded} aria-controls="business-context-form" aria-label={expanded ? 'Свернуть форму бизнес-задачи' : 'Развернуть форму бизнес-задачи'} onClick={() => onOpenChange(!expanded)} className="shrink-0 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <span className="hidden sm:inline">{expanded ? 'Свернуть' : 'Развернуть'}</span>
        {expanded ? <ChevronUp className="w-4 h-4" aria-hidden="true" /> : <ChevronDown className="w-4 h-4" aria-hidden="true" />}
      </button>}
    </div>
    {expanded && <div id="business-context-form" className="mt-4">{children}</div>}
  </section>;
}

function FinalRequirementsEditor({ latestVersion, onSave, onShowInsights, onShowSource, onShowContext, onStartResearch, onDirtyChange, busy, researchBusy = false, researchSkipped = false }) {
  const review = useReviewState(latestVersion?.requirements || { business: [], functional: [], nonfunctional: [] }, latestVersion?.decisions || {});
  const { content: requirements, setContent: setRequirements } = review;
  const deletion = useLegacyDeletion(review);
  const [validationError, setValidationError] = useState(null);
  function saveReview() {
    const assembled = assembleReview(review.state, (type, text, records) => makeLegacyRecord(type, text, records, review.state.reservedIds));
    setValidationError(assembled.error || null);
    if (assembled.error) { requestAnimationFrame(() => document.querySelector(`[aria-label="Текст требования ${assembled.error.id}"]`)?.focus()); return; }
    return onSave({ requirements: assembled.content, baseVersionId: latestVersion.versionId, decisions: assembled.decisions });
  }
  const [dirtyDrafts, setDirtyDrafts] = useState(() => new Set());
  const [layout, setLayout] = useRequirementsLayout();
  const [activeType, setActiveType] = useState('business');
  const selectType = (type) => { setActiveType(type); if (layout === 'columns') requestAnimationFrame(() => { const target = document.getElementById(`req-type-${type}`); target?.scrollIntoView?.({ block: 'start' }); target?.focus(); }); };
  const hasUnsavedChanges = review.dirty || dirtyDrafts.size > 0 || JSON.stringify(requirements) !== JSON.stringify(latestVersion?.requirements || {});

  function setDraftDirty(key, dirty) {
    setDirtyDrafts((current) => { const next = new Set(current); if (dirty) next.add(key); else next.delete(key); return next; });
  }

  useEffect(() => onDirtyChange?.(hasUnsavedChanges), [hasUnsavedChanges, onDirtyChange]);

  function editRequirement(type, id, text) {
    setRequirements((current) => ({ ...current, [type]: current[type].map((item) => item.id === id ? { ...item, text } : item) }));
  }

  function deleteRequirement(type, id) {
    deletion.ask(type, id);
  }

  function addRequirement(type, text) {
    const prefix = REQUIREMENT_COLUMNS.find(([key]) => key === type)?.[4] || 'REQ';
    setRequirements((current) => {
      const number = Number(makeLegacyRecord(type, text, current[type], review.state.reservedIds).id.match(/\d+$/)[0]);
      return { ...current, [type]: [...current[type], { id: `${prefix}-${number}`, text }] };
    });
  }

  return (
    <ReviewDraftProvider review={review} submit={saveReview} busy={busy}><section className="space-y-5">
      <LegacyDeletionNotice deletion={deletion} />
      {validationError && <p role="alert">{validationError.id}: {validationError.message}</p>}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h1 className="text-xl font-bold text-slate-900">Финальная версия требований</h1></div>
            <p className="text-sm font-semibold text-emerald-700 mt-2">{busy ? 'Сохраняем…' : hasUnsavedChanges ? 'Есть несохранённые изменения' : `Сохранено · ${new Date(latestVersion.createdAt).toLocaleString()}`}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {onShowSource && onShowContext && <SourceDataMenu onShowContext={onShowContext} onShowRequirements={onShowSource} />}
            {!hasUnsavedChanges && <ResultExportAction />}
            {onShowInsights && <button onClick={onShowInsights} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />К результатам AI-исследования</button>}
            {researchSkipped && onStartResearch && <button disabled={busy || researchBusy || hasUnsavedChanges} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="px-4 py-2 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:bg-slate-100 disabled:text-slate-600 flex items-center gap-2">{researchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Добавить AI-исследование</button>}
          </div>
        </div>
      </div>

      {hasUnsavedChanges && <div className="sticky top-16 z-30 -mx-4 px-4 py-3 bg-gray-50/95 backdrop-blur border-y border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${hasUnsavedChanges ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{hasUnsavedChanges ? <Pencil className="w-4 h-4" /> : <Check className="w-4 h-4" />}</span><div><p className="font-semibold text-slate-900">{hasUnsavedChanges ? 'Есть несохранённые изменения' : 'Изменения сохранены'}</p><p className="text-xs text-slate-500 mt-0.5">Редакция от {new Date(latestVersion.createdAt).toLocaleString()}</p></div></div>
        <div className="flex flex-wrap items-center gap-2"><ResultExportAction /><button disabled={busy} onClick={() => saveReview()} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Сохранить изменения</button></div>
      </div>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-bold text-slate-900">Категории требований</h2>
        <RequirementsLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <RequirementTypeNav columns={REQUIREMENT_COLUMNS} groups={requirements} activeType={activeType} onSelect={selectType} />
      <div aria-label="Финальные требования по категориям" className="grid gap-4 grid-cols-1">
        {REQUIREMENT_COLUMNS.filter(([key]) => layout !== 'rows' || key === activeType).map(([key, title, subtitle, color]) => <section key={key} id={`req-type-${key}`} tabIndex={-1} style={{ scrollMarginTop: '9rem' }} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
          <div className="flex items-start justify-between gap-3 mb-2"><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{requirements[key].length}</span></div>
          <div className="divide-y divide-slate-200 mt-4">
            {requirements[key].map((item) => <EditableRequirementCard key={item.id} type={key} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} onDraftChange={(dirty) => setDraftDirty(`${key}:${item.id}`, dirty)} />)}
            {!requirements[key].length && <p className="py-6 text-sm text-slate-600">Нет сформированных требований</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><AddRequirementForm type={key} categoryLabel={title} onAdd={(text) => addRequirement(key, text)} onDraftChange={(dirty) => setDraftDirty(`${key}:new`, dirty)} /></div>
        </section>)}
      </div>
    </section></ReviewDraftProvider>
  );
}

function displayBabokEnhancementsForInsight(insight) {
  const allowed = new Set(BABOK_REQUIREMENT_TYPES);
  const raw = Array.isArray(insight.enhancements) ? insight.enhancements : [];
  const structured = raw
    .map((enhancement, sourceIndex) => ({ ...enhancement, sourceIndex }))
    .filter((enhancement) => enhancement && allowed.has(enhancement.targetType) && String(enhancement.text || '').trim())
    .map((enhancement) => ({
      ...enhancement,
      targetType: enhancement.targetType,
      targetIds: Array.isArray(enhancement.targetIds) ? enhancement.targetIds : (Array.isArray(enhancement.relatedTo) ? enhancement.relatedTo : []),
      text: String(enhancement.text).trim(),
    }));
  return structured;
}

function babokRegistryIds(registry) {
  if (!isBabokRegistry(registry)) return new Set();
  return new Set([
    ...(registry.context || []).map((item) => item.id),
    ...BABOK_REQUIREMENT_TYPES.flatMap((type) => (registry.groups[type] || []).map((item) => item.id)),
    ...BABOK_ANALYSIS_TYPES.flatMap((type) => (registry.analysis[type] || []).map((item) => item.id)),
    ...(registry.analysis?.delta || []).map((item) => item.id),
    ...(registry.analysis?.questions || []).map((item) => item.id),
  ]);
}

function addBabokResearchRecord(registry, enhancement, key) {
  const type = BABOK_REQUIREMENT_TYPES.includes(enhancement.targetType) ? enhancement.targetType : 'FR';
  const targetIds = (enhancement.targetIds || []).filter((id) => babokRegistryIds(registry).has(id));
  const id = stableBabokId(registry.groups[type], type);
  const record = createBabokManualRecord(type, id, enhancement.text, { sourceArtifactId: registry.materials.primary.artifactId, fromResearch: true, researchEnhancementKey: key, targetIds });
  return withBabokCounts({ ...registry, groups: { ...registry.groups, [type]: [...registry.groups[type], record] } });
}

function finalBabokRegistry(baseRegistry, enhancements, decisions) {
  let next = cloneJson(baseRegistry);
  if (!isBabokRegistry(next)) return next;
  const accepted = new Set(enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key));
  const rejected = new Set(enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key));
  BABOK_REQUIREMENT_TYPES.forEach((type) => {
    next.groups[type] = next.groups[type].filter((record) => !record.researchEnhancementKey || !rejected.has(record.researchEnhancementKey));
  });
  enhancements.forEach((enhancement) => {
    if (!accepted.has(enhancement.key)) return;
    const alreadyPresent = BABOK_REQUIREMENT_TYPES.some((type) => next.groups[type].some((record) => record.researchEnhancementKey === enhancement.key));
    if (!alreadyPresent) next = addBabokResearchRecord(next, enhancement, enhancement.key);
  });
  return withBabokCounts(next);
}

function BabokSourceRegistrySnapshot({ registry, decisions, onBack, initialRecordId, jobId = null, discussionEnabled = true }) {
  return <BabokRegistryResult value={registry} latestVersion={{ registry, decisions }} readOnly initialRecordId={initialRecordId} onBack={onBack} title="Требования, переданные в AI-исследование" jobId={jobId} discussionEnabled={discussionEnabled} />;
}

function BabokRequirementsInsightsResult({ value, latestVersion, businessContext, businessContextLoading, onSaveFinal, onDirtyChange, busy, jobId = null, discussionEnabled = true }) {
  const baseRegistry = value.baseRegistry || latestVersion?.registry;
  const insights = Array.isArray(value.insights) ? value.insights : [];
  const enhancements = insights.flatMap((insight) => displayBabokEnhancementsForInsight(insight).map((enhancement, index) => ({ ...enhancement, key: `${insight.id}:${enhancement.sourceIndex ?? index}`, insightTitle: insight.title })));
  const savedAcceptedKeys = Array.isArray(latestVersion?.decisions?.acceptedEnhancementKeys) ? latestVersion.decisions.acceptedEnhancementKeys : [];
  const savedRejectedKeys = Array.isArray(latestVersion?.decisions?.rejectedEnhancementKeys) ? latestVersion.decisions.rejectedEnhancementKeys : [];
  const session = useContext(SessionContext);
  const activeView = session?.view || (latestVersion?.versionId ? 'final' : 'insights');
  const setActiveView = (view) => session?.requestView(view, { preserveDraft: activeView !== 'final' && view !== 'final' });
  const review = useReviewState(latestVersion?.registry || latestVersion?.requirements || value.baseRegistry || value.baseRequirements, latestVersion?.decisions || value.baseDecisions || {}, { readOnly: activeView === 'final', editor: 'insights' });
  const decisions = Object.fromEntries([...(review.state.decisions.acceptedEnhancementKeys || []).map((key) => [key, 'accepted']), ...(review.state.decisions.rejectedEnhancementKeys || []).map((key) => [key, 'rejected'])]);
  const requirementIndex = useMemo(() => buildBabokRequirementIndex(value.baseRegistry, { requirementTypes: BABOK_REQUIREMENT_TYPES, analysisTypes: BABOK_ANALYSIS_TYPES }), [value.baseRegistry]);
  const hasDecisionChanges = review.dirty;

  useEffect(() => {
    if (activeView !== 'final') onDirtyChange?.(hasDecisionChanges);
  }, [activeView, hasDecisionChanges, onDirtyChange]);

  function saveInsights() {
    return onSaveFinal({ registry: finalBabokRegistry(review.content, enhancements, decisions), baseVersionId: latestVersion?.versionId || value.inputRequirementsVersionId, decisions: { ...review.state.decisions, acceptedEnhancementKeys: enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key), rejectedEnhancementKeys: enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key) } });
  }
  if (!isBabokRegistry(baseRegistry)) return null;
  if (activeView === 'source') return <ReviewDraftProvider review={review} submit={saveInsights} busy={busy}><BabokSourceRegistrySnapshot initialRecordId={null} registry={value.baseRegistry || baseRegistry} decisions={value.baseDecisions} onBack={() => setActiveView('insights')} jobId={jobId} discussionEnabled={discussionEnabled} /></ReviewDraftProvider>;
  if (activeView === 'context') return <ReviewDraftProvider review={review} submit={saveInsights} busy={busy}><SourceBusinessContextSnapshot value={businessContext} loading={businessContextLoading} onBack={() => setActiveView('insights')} /></ReviewDraftProvider>;
  if (activeView === 'final' && latestVersion?.versionId) return <BabokRegistryResult value={latestVersion.registry || baseRegistry} latestVersion={latestVersion} finalVersion onSave={onSaveFinal} onBack={() => setActiveView('insights')} onDirtyChange={onDirtyChange} busy={busy} title="Финальная версия требований" jobId={jobId} discussionEnabled={discussionEnabled} />;

  const acceptedKeys = enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key);
  const rejectedKeys = enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key);
  const sameKeys = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const finalVersionSaved = !review.dirty && Boolean(latestVersion?.versionId) && sameKeys(acceptedKeys, savedAcceptedKeys) && sameKeys(rejectedKeys, savedRejectedKeys);
  return (
    <ReviewDraftProvider review={review} submit={saveInsights} busy={busy}><section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /><h1 className="text-xl font-bold text-gray-900">Результаты AI-исследования</h1></div><p className="text-sm text-gray-500 mt-2">Выберите полезные улучшения для финальной версии требований.</p></div><SourceDataMenu onShowContext={() => setActiveView('context')} onShowRequirements={() => setActiveView('source')} /></div>
      </div>
      <ResearchInsightWorkspace
        insights={insights}
        categoryMeta={INSIGHT_CATEGORY_META}
        sourceTypeLabels={SOURCE_TYPE_LABELS}
        requirementIndex={requirementIndex}
        getEnhancements={displayBabokEnhancementsForInsight}
        renderEvidence={(insight) => <ResearchEvidence insight={insight} />}
        renderEnhancement={(enhancement, insight) => <ProposalReview key={enhancement.key} enhancement={{ ...enhancement, insightTitle: insight.title, rationale: enhancement.rationale || insight.rationale }} decision={decisions[enhancement.key]}>{(onDecision) => <InsightEnhancementDecisionRow enhancement={enhancement} decision={decisions[enhancement.key]} onDecision={onDecision} />}</ProposalReview>}
        selectedCount={acceptedKeys.length}
        saveDisabled={busy}
        onSave={() => finalVersionSaved ? setActiveView('final') : saveInsights()}
        saveLabel={finalVersionSaved ? 'К финальным требованиям' : latestVersion ? 'Сохранить новую редакцию' : 'Сохранить финальную версию'}
      />
    </section></ReviewDraftProvider>
  );
}

function RequirementsInsightsResult({ value, latestVersion, businessContext, businessContextLoading, onSaveFinal, onDirtyChange, busy }) {
  const insights = Array.isArray(value.insights) ? value.insights : [];
  const enhancements = insights.flatMap((insight) => displayEnhancementsForInsight(insight).map((enhancement, index) => ({ ...enhancement, key: `${insight.id}:${enhancement.sourceIndex ?? index}`, insightTitle: insight.title })));
  const savedAcceptedKeys = Array.isArray(latestVersion?.decisions?.acceptedEnhancementKeys) ? latestVersion.decisions.acceptedEnhancementKeys : [];
  const savedRejectedKeys = Array.isArray(latestVersion?.decisions?.rejectedEnhancementKeys) ? latestVersion.decisions.rejectedEnhancementKeys : [];
  const session = useContext(SessionContext);
  const activeView = session?.view || (latestVersion?.versionId ? 'final' : 'insights');
  const setActiveView = (view) => session?.requestView(view, { preserveDraft: activeView !== 'final' && view !== 'final' });
  const review = useReviewState(latestVersion?.registry || latestVersion?.requirements || value.baseRegistry || value.baseRequirements, latestVersion?.decisions || value.baseDecisions || {}, { readOnly: activeView === 'final', editor: 'insights' });
  const decisions = Object.fromEntries([...(review.state.decisions.acceptedEnhancementKeys || []).map((key) => [key, 'accepted']), ...(review.state.decisions.rejectedEnhancementKeys || []).map((key) => [key, 'rejected'])]);
  const requirementIndex = useMemo(() => buildLegacyRequirementIndex(value.baseRequirements), [value.baseRequirements]);
  const hasDecisionChanges = review.dirty;

  useEffect(() => {
    if (activeView !== 'final') onDirtyChange?.(hasDecisionChanges);
  }, [activeView, hasDecisionChanges, onDirtyChange]);

  function finalRequirements() {
    const base = review.content;
    const result = Object.fromEntries(['business', 'functional', 'nonfunctional'].map((type) => [type, (base[type] || []).map((item) => ({ ...item }))]));
    const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
    for (const type of Object.keys(result)) {
      result[type] = result[type].filter((item) => {
        const matchedEnhancement = enhancements.find((enhancement) => enhancement.key === item.researchEnhancementKey || (item.fromResearch && enhancement.text === item.text));
        return !matchedEnhancement || decisions[matchedEnhancement.key] === 'accepted';
      });
    }
    enhancements.filter((item) => decisions[item.key] === 'accepted').forEach((enhancement) => {
      const type = enhancement.targetType;
      if (!result[type] || !enhancement.text) return;
      if (result[type].some((item) => item.researchEnhancementKey === enhancement.key || (item.fromResearch && item.text === enhancement.text))) return;
      const next = result[type].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      result[type].push({ id: `${prefixes[type]}-${next}`, text: enhancement.text, fromResearch: true, researchEnhancementKey: enhancement.key });
    });
    return result;
  }

  function saveInsights() {
    return onSaveFinal({ requirements: finalRequirements(), baseVersionId: latestVersion?.versionId || value.inputRequirementsVersionId, decisions: { ...review.state.decisions, acceptedEnhancementKeys: enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key), rejectedEnhancementKeys: enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key) } });
  }
  if (activeView === 'source') {
    return <ReviewDraftProvider review={review} submit={saveInsights} busy={busy}><SourceRequirementsSnapshot initialRecordId={null} requirements={value.baseRequirements} onBack={() => setActiveView('insights')} /></ReviewDraftProvider>;
  }

  if (activeView === 'context') {
    return <ReviewDraftProvider review={review} submit={saveInsights} busy={busy}><SourceBusinessContextSnapshot value={businessContext} loading={businessContextLoading} onBack={() => setActiveView('insights')} /></ReviewDraftProvider>;
  }

  if (activeView === 'final' && latestVersion?.versionId) {
    return <FinalRequirementsEditor latestVersion={latestVersion} onSave={onSaveFinal} onShowInsights={() => setActiveView('insights')} onShowSource={() => setActiveView('source')} onShowContext={() => setActiveView('context')} onDirtyChange={onDirtyChange} busy={busy} />;
  }

  const acceptedKeys = enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key);
  const rejectedKeys = enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key);
  const sameKeys = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const finalVersionSaved = !review.dirty && Boolean(latestVersion?.versionId) && sameKeys(acceptedKeys, savedAcceptedKeys) && sameKeys(rejectedKeys, savedRejectedKeys);
  return (
    <ReviewDraftProvider review={review} submit={saveInsights} busy={busy}><section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /><h1 className="text-xl font-bold text-gray-900">Результаты AI-исследования</h1></div><p className="text-sm text-gray-500 mt-2">Выберите полезные улучшения для финальной версии требований.</p></div><SourceDataMenu onShowContext={() => setActiveView('context')} onShowRequirements={() => setActiveView('source')} /></div>
      </div>
      <ResearchInsightWorkspace
        insights={insights}
        categoryMeta={INSIGHT_CATEGORY_META}
        sourceTypeLabels={SOURCE_TYPE_LABELS}
        requirementIndex={requirementIndex}
        getEnhancements={displayEnhancementsForInsight}
        renderEvidence={(insight) => <ResearchEvidence insight={insight} />}
        renderEnhancement={(enhancement, insight) => <ProposalReview key={enhancement.key} enhancement={{ ...enhancement, insightTitle: insight.title, rationale: enhancement.rationale || insight.rationale }} decision={decisions[enhancement.key]}>{(onDecision) => <InsightEnhancementDecisionRow enhancement={enhancement} decision={decisions[enhancement.key]} onDecision={onDecision} />}</ProposalReview>}
        selectedCount={acceptedKeys.length}
        saveDisabled={busy}
        onSave={() => finalVersionSaved ? setActiveView('final') : saveInsights()}
        saveLabel={finalVersionSaved ? 'К финальным требованиям' : latestVersion ? 'Сохранить новую редакцию' : 'Сохранить финальную версию'}
      />
    </section></ReviewDraftProvider>
  );
}

function ResultView({ content, latestVersion, businessContext, businessContextLoading, onSaveRequirements, onStartResearch, onSaveFinal, onDirtyChange, busy, researchBusy = false, jobId = null, discussionEnabled = true }) {
  const value = safeJson(content);
  if (!value) return <Markdown>{content}</Markdown>;
  if (isBabokTextDraft(value)) return <Suspense fallback={<p>Загрузка черновика…</p>}><BabokTextDraft value={value} /></Suspense>;
  if (value.mode === 'REQUIREMENTS_INSIGHTS') {
    if (isBabokRegistry(value.baseRegistry) || isBabokRegistry(latestVersion?.registry)) return <BabokRequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext={businessContext} businessContextLoading={businessContextLoading} onSaveFinal={onSaveFinal} onDirtyChange={onDirtyChange} busy={busy} jobId={jobId} discussionEnabled={discussionEnabled} />;
    return <RequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext={businessContext} businessContextLoading={businessContextLoading} onSaveFinal={onSaveFinal} onDirtyChange={onDirtyChange} busy={busy} />;
  }
  if (isBabokRegistry(value) || isBabokRegistry(latestVersion?.registry)) return <BabokRegistryResult value={value} latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} finalVersion={Boolean(latestVersion?.decisions?.skippedResearch)} jobId={jobId} discussionEnabled={discussionEnabled} />;
  if (value.mode === 'DECOMPOSITION' || Array.isArray(value.decomposition)) {
    if (latestVersion?.decisions?.skippedResearch) return <FinalRequirementsEditor latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} researchSkipped />;
    return <DecompositionResult value={value} latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} />;
  }
  return <p className="text-sm text-slate-500">Формат результата не поддерживается текущей версией интерфейса.</p>;
}

function ModelControls({ models, model, setModel, temperature, setTemperature, reasoning, setReasoning, capabilities }) {
  const levels = reasoningLevels(model, capabilities);
  const forcedReasoningModel = !levels.includes('disabled');
  const controlClassName = 'reqai-control reqai-quiet-focus w-full h-10 px-3 border rounded-lg bg-white focus:border-indigo-400 focus:outline-none focus:ring-0';
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <p className="md:col-span-2 text-sm text-slate-600">Настройки следующего запуска. Сохранённый результат не изменится.</p>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Модель</span>
        <select value={model} onChange={(event) => setModel(event.target.value)} className={controlClassName}>
          {models.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Температура</span>
        <input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} className={controlClassName} />
      </label>
      <label className="block md:col-span-2">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Reasoning</span>
        <select aria-label="Reasoning" {...(forcedReasoningModel ? { 'aria-describedby': 'ai-reasoning-help' } : {})} value={reasoning} onChange={(event) => setReasoning(event.target.value)} className={controlClassName}>
          {REASONING_OPTIONS.filter(([value]) => levels.includes(value)).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {forcedReasoningModel && <span id="ai-reasoning-help" className="block text-xs text-slate-600 mt-1.5">Эта модель не поддерживает отключение reasoning. Минимальный уровень — низкий.</span>}
      </label>
    </div>
  );
}

function formatElapsed(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function ExecutionTimeline({ job }) {
  const activeIndex = executionPhaseIndex(job);
  return <ol aria-label="Этапы выполнения задачи" className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
    {EXECUTION_PHASES.map((label, index) => {
      const completed = index < activeIndex;
      const active = index === activeIndex;
      const state = completed ? 'завершено' : active ? 'выполняется' : 'ожидает';
      return <li key={label} aria-current={active ? 'step' : undefined} aria-label={`${label}: ${state}`} className={`rounded-lg border px-3 py-1.5 flex items-center gap-2 ${active ? 'border-indigo-200 bg-indigo-50/80' : completed ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/70'}`}>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 animate-pulse' : completed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
          {completed ? <Check className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
        </span>
        <span className={`text-xs font-semibold ${active ? 'text-indigo-800' : completed ? 'text-emerald-800' : 'text-slate-600'}`}>{label}</span>
      </li>;
    })}
  </ol>;
}

function ActiveJobPanel({ job, onCancel, onBackground }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const startedAt = Date.parse(job.startedAt || job.createdAt || '') || now;
  const elapsedMs = Math.max(0, now - startedAt);
  const { progress, stageLabel, visualProgress, estimated } = progressPresentationForJob(job, now);
  const focusMessage = focusMessageForJob(job, now);
  const waitingTip = waitingTipForJob(job, now);
  const progressText = progressAriaText({ progress, stageLabel, estimated });
  const title = job.type === 'DECOMPOSITION'
    ? 'Декомпозиция требований'
    : job.mode === 'REQUIREMENTS_INSIGHTS' ? 'AI-исследование требований' : MODE_LABELS[job.mode] || 'AI-задача';
  const TitleTag = job.type === 'DECOMPOSITION' || job.mode === 'REQUIREMENTS_INSIGHTS' ? 'h2' : 'p';
  const durationHint = job.type === 'DECOMPOSITION' ? 'Оценка ожидания: 2–4 минуты' : job.mode === 'REQUIREMENTS_INSIGHTS' ? 'Оценка ожидания: 3–6 минут' : 'Оценка ожидания: несколько минут';
  const takingLonger = elapsedMs >= (job.type === 'DECOMPOSITION' ? 4 : 6) * 60_000;
  return <section aria-label="Выполнение задачи" className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
    <div className="p-4 md:p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Loader2 className="w-5 h-5 animate-spin" /></span>
          <div className="min-w-0">
            <TitleTag className="text-lg md:text-xl font-bold text-slate-900">{title}</TitleTag>
            {takingLonger && <p className="text-sm text-slate-500 mt-1">Обработка занимает больше оценочного времени. Последний подтверждённый этап показан ниже.</p>}
          </div>
        </div>
        <p className="text-sm text-slate-500 shrink-0" aria-label={`Прошло ${formatElapsed(elapsedMs)}, ${durationHint}`}><span className="font-mono font-semibold text-slate-700">{formatElapsed(elapsedMs)}</span> · {durationHint}</p>
      </div>
      {focusMessage && <div role="status" aria-live="polite" className="mt-3 rounded-lg bg-indigo-50/60 px-3 py-2 flex items-center gap-3 overflow-hidden">
        <span className="flex gap-1 shrink-0" aria-hidden="true"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" /><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" /><span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce [animation-delay:300ms]" /></span>
        <div className="min-w-0"><p className="text-sm font-medium text-indigo-900">{focusMessage}</p>{waitingTip && <p aria-live="off" title="Формулировки сменяются автоматически и описывают задачи анализа. Текущий этап подтверждается отдельно." className="mt-1 text-sm leading-5 text-slate-500">{waitingTip}</p>}</div>
      </div>}
      <ExecutionTimeline job={job} />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3 mb-2"><span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Прогресс{estimated && <span className="font-normal text-slate-400">· оценка</span>}</span><span className="text-xs font-bold text-indigo-700">{progress}%{stageLabel ? ` · ${stageLabel}` : ''}</span></div>
        <div role="progressbar" aria-label="Прогресс выполнения задачи" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} aria-valuetext={progressText} title={estimated ? 'Процент — ориентировочная оценка; переходы между этапами подтверждает сервер.' : 'Процент подтверждён сервером.'} className="relative h-2 rounded-full bg-slate-100 overflow-hidden">
          <span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-[width] duration-1000 ease-out" style={{ width: `${visualProgress}%` }} />
          <span className="reqai-progress-shimmer absolute inset-y-0 bg-gradient-to-r from-transparent via-white/75 to-transparent" aria-hidden="true" />
        </div>
      </div>
      <div className="flex shrink-0 justify-end">
        <div className="flex gap-2 flex-wrap">
          <button onClick={onBackground} className="px-4 py-2.5 rounded-lg border border-indigo-200 bg-white text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Продолжить в фоне</button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:text-red-600 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Отменить</button>
        </div>
      </div>
      </div>
    </div>
  </section>;
}

function BackgroundJobIndicator({ job, onOpen }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const { progress, stageLabel, estimated } = progressPresentationForJob(job, now);
  const accessibleStage = stageLabel ? `. Этап: ${stageLabel}` : '';
  return <button aria-label={`Фоновая задача: ${job.message || STATUS_LABELS[job.status]}${accessibleStage}`} title={estimated ? 'Процент ориентировочный; этап подтверждается сервером.' : undefined} onClick={onOpen} className="px-3 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden lg:inline">Задача в фоне</span><span>{progress}%</span></button>;
}

function JobStateCard({ job, onCancel, onRetry, retryBusy = false }) {
  if (!job || ['ACCEPTED', 'QUEUED', 'RUNNING', 'SUCCEEDED'].includes(job.status)) return null;
  const failed = job.status === 'FAILED';
  const cancelled = job.status === 'CANCELLED';
  const active = !TERMINAL.has(job.status);
  const Icon = failed ? XCircle : cancelled ? Ban : Loader2;
  const title = failed
    ? 'Не удалось завершить задачу'
    : cancelled
      ? 'Задача отменена'
      : job.status === 'CANCEL_REQUESTED'
        ? 'Отменяем задачу…'
        : job.status === 'RETRY_WAIT'
          ? 'Повторяем проблемный этап…'
          : job.status === 'RUNNING'
            ? job.type === 'DECOMPOSITION' ? 'Декомпозируем требования…' : 'Проводим исследование…'
            : 'Задача ожидает запуска…';
  return (
    <section className={`rounded-xl border p-4 ${failed ? 'bg-red-50 border-red-200' : cancelled ? 'bg-slate-50 border-slate-200' : 'bg-indigo-50 border-indigo-200'}`}>
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 shrink-0 ${active ? 'animate-spin text-indigo-600' : failed ? 'text-red-600' : 'text-slate-500'}`} />
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{active ? 'Результат появится на странице автоматически.' : failed ? failureMessage(job) : onRetry ? 'Можно повторить исследование сохранённых требований.' : 'Можно сформировать требования повторно.'}</p>
          </div>
        </div>
        {(failed || cancelled) && onRetry && <button type="button" onClick={onRetry} disabled={retryBusy} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-wait focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{retryBusy && <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" />}{retryBusy ? 'Запускаем исследование…' : 'Повторить исследование'}</button>}
        {active && <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600">Отменить</button>}
      </div>
    </section>
  );
}

function DebugPanel({ open, onClose, jobId, observations, refreshKey, triggerRef, onDownload, resultContent }) {
  const panelRef = useRef(null);
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(() => new Set());
  const [details, setDetails] = useState({});

  const load = useCallback(async ({ cursor = null, append = false } = {}) => {
    if (!jobId) return;
    setLoading(true); setError('');
    try {
      const page = await enterpriseApi.getJobTrace(jobId, { cursor, limit: 50 });
      setTrace((current) => append && current ? { ...page, timeline: [...current.timeline, ...page.timeline] } : page);
    } catch (cause) { setError(userFacingError(cause)); }
    finally { setLoading(false); }
  }, [jobId]);

  useEffect(() => { if (open) load(); }, [load, open, refreshKey]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const returnTarget = triggerRef?.current || previous;
    const handleKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && panelRef.current) {
        const controls = [...panelRef.current.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])')].filter((node) => !node.disabled);
        if (!controls.length) return;
        const first = controls[0]; const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => panelRef.current?.querySelector('button')?.focus());
    return () => { window.removeEventListener('keydown', handleKey); returnTarget?.focus?.(); };
  }, [onClose, open, triggerRef]);

  async function toggle(entry) {
    const next = new Set(expanded);
    if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
    setExpanded(next);
    if (!next.has(entry.id) || details[entry.id] || entry.source !== 'TRACE' || entry.detail?.state !== 'AVAILABLE') return;
    try { const value = await enterpriseApi.getJobTraceDetail(jobId, entry.id); setDetails((current) => ({ ...current, [entry.id]: value })); }
    catch (cause) { setDetails((current) => ({ ...current, [entry.id]: { state: 'ERROR', message: userFacingError(cause) } })); }
  }

  if (!open) return null;
  const registry = safeJson(resultContent);
  let qualityIssues = [];
  if (isBabokRegistry(registry)) {
    try { qualityIssues = collectBabokQualityIssues(registry, { final: true }); } catch { /* Invalid result shape is covered by execution diagnostics. */ }
  }
  const localEntries = observations.map((item, index) => ({ id: `client:${index}:${item.timestamp}`, source: 'CLIENT_LOCAL', category: 'SSE', name: item.type, status: item.type === 'disconnected' || item.type === 'parse-error' ? 'FAILED' : 'INFO', startedAt: item.timestamp, completedAt: item.timestamp, durationMs: 0, metadata: item, detail: { state: 'NOT_RECORDED' } }));
  const entries = [...(trace?.timeline || []), ...localEntries].sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
  return <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Debug текущей задачи">
    <button aria-label="Закрыть Debug" onClick={onClose} className="absolute inset-0 bg-slate-950/35 backdrop-blur-[1px]" />
    <aside ref={panelRef} className="absolute right-0 top-0 h-full w-full lg:max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
      <header className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
        <div><p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Диагностика</p><h2 className="font-bold text-slate-900 text-lg">Debug задачи</h2><p className="font-mono text-xs text-slate-500 mt-1 break-all">{jobId}</p></div>
        <button aria-label="Закрыть" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5" /></button>
      </header>
      <div className="flex-1 overflow-y-auto p-4 md:p-5">
        {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {qualityIssues.length > 0 && <details className="mb-5 text-sm text-slate-700">
          <summary className="cursor-pointer font-semibold">Проверка качества AI-результата · {qualityIssues.length}</summary>
          <p className="mt-2">Технические замечания к исходному ответу AI. Ручные правки требований здесь не учитываются.</p>
          <ul className="mt-2 list-disc space-y-2 pl-5">{qualityIssues.map((issue, index) => <li key={`${issue.path}:${index}`}>{issue.reason}<code className="mt-1 block break-all text-xs text-slate-500">{issue.path}</code></li>)}</ul>
        </details>}
        {trace && <section aria-label="Сводка трассировки" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[['Статус', trace.status], ['Этап', trace.currentStep || '—'], ['Создана', trace.createdAt ? new Date(trace.createdAt).toLocaleString() : '—'], ['Длительность', formatDuration(trace.durationMs)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-3"><dt className="text-[11px] uppercase tracking-wide text-slate-600">{label}</dt><dd className="text-xs font-semibold text-slate-700 mt-1 break-words">{value}</dd></div>)}
        </section>}
        <div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-semibold text-slate-900">Timeline</h3><div className="flex gap-2">{onDownload && <button onClick={onDownload} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"><Download className="inline w-3.5 h-3.5 mr-1" />JSON</button>}<button onClick={() => load()} disabled={loading} className="px-3 py-1.5 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-700 disabled:opacity-50">Обновить</button></div></div>
        {loading && !trace ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Загрузка трассировки…</div> : entries.length === 0 ? <p className="py-12 text-center text-sm text-slate-600">События пока не записаны.</p> : <ol className="space-y-3" aria-label="Timeline выполнения задачи">{entries.map((entry) => {
          const isOpen = expanded.has(entry.id); const detail = details[entry.id];
          return <li key={entry.id} className="relative pl-5 before:absolute before:left-[5px] before:top-4 before:bottom-[-14px] before:w-px before:bg-slate-200 last:before:hidden"><span className="absolute left-0 top-4 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white" /><div className="rounded-xl border border-slate-200 bg-white overflow-hidden"><button aria-expanded={isOpen} onClick={() => toggle(entry)} className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center flex-wrap"><span className="font-semibold text-sm text-slate-800">{entry.name}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TRACE_TONES[entry.status] || TRACE_TONES.INFO}`}>{entry.status}</span>{entry.source === 'CLIENT_LOCAL' && <span className="text-[10px] text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">текущая вкладка</span>}</div><p className="text-xs text-slate-600 mt-1">{entry.category}{entry.stepId ? ` · ${entry.stepId}` : ''}</p></div><div className="text-right shrink-0"><time className="text-[11px] text-slate-600">{entry.startedAt ? new Date(entry.startedAt).toLocaleTimeString() : '—'}</time><p className="text-[11px] text-slate-500 mt-1">{formatDuration(entry.durationMs)}</p></div></div></button>{isOpen && <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2"><p className="text-xs text-slate-500">Детали: {entry.detail?.state === 'NOT_RECORDED' ? 'не записаны' : entry.detail?.state === 'EXPIRED' ? 'срок хранения истёк' : entry.detail?.state === 'REDACTED' ? 'скрыты политикой доступа' : entry.detail?.state || '—'}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify(detail?.content ?? detail ?? entry.metadata ?? {}, null, 2)}</pre></div>}</div></li>;
        })}</ol>}
        {trace?.nextCursor && <button disabled={loading} onClick={() => load({ cursor: trace.nextCursor, append: true })} className="mt-4 w-full px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-semibold disabled:opacity-50">Загрузить ещё</button>}
      </div>
    </aside>
  </div>;
}

function ArchivedLegacyResult({ job, result, onDownload }) {
  const status = primaryStatus(result || job);
  const timestamps = [['Создана', job.createdAt], ['Запущена', job.startedAt], ['Завершена', job.completedAt]].filter(([, value]) => value);
  return <section aria-label="Архивный результат" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Архивная задача · только чтение</p><h1 className="text-2xl font-bold text-slate-900 mt-1">Результат старой версии</h1><p className="text-sm text-slate-500 mt-2">Этот сценарий больше нельзя запускать или повторять. Сохранённые данные и диагностика остаются доступны.</p></div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.tone}`}>{status.label}</span>
    </div>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><dt className="text-xs text-slate-600">Режим</dt><dd className="font-mono text-xs text-slate-700 mt-1 break-all">{job.mode || 'UNKNOWN'}</dd></div>
      {timestamps.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-3"><dt className="text-xs text-slate-600">{label}</dt><dd className="text-xs font-semibold text-slate-700 mt-1">{new Date(value).toLocaleString()}</dd></div>)}
    </dl>
    {(result?.summary || job.message) && <div className="mt-5 rounded-xl border border-slate-200 p-4"><h2 className="text-sm font-semibold text-slate-800">Сводка</h2><p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{result?.summary || job.message}</p></div>}
    {result?.outcome === 'PARTIAL' && <div className="mt-4 flex gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">Архивный результат завершён частично.</p></div>}
    {onDownload && <button onClick={onDownload} className="mt-5 px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-semibold hover:bg-indigo-50"><Download className="inline w-4 h-4 mr-2" />Скачать артефакт</button>}
  </section>;
}

export default function AsyncJobWorkspace() {
  const [routeJobId, setRouteJobId] = useState(() => jobIdFromPath());
  const [historyOpen, setHistoryOpen] = useState(false);
  const closeHistory = useCallback(() => setHistoryOpen(false), []);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [requirements, setRequirements] = useState('');
  const [businessContextLoading, setBusinessContextLoading] = useState(false);
  const unsentContextRef = useRef({ text: '', file: null, baseline: null, references: [] });
  const [hasContextDraft, setHasContextDraft] = useState(false);
  const [file, setFile] = useState(null);
  const [baselineFile, setBaselineFile] = useState(null);
  const [referenceFiles, setReferenceFiles] = useState([]);
  const [materialUploads, setMaterialUploads] = useState(() => new Map());
  const uploadedMaterialsRef = useRef(new Map());
  const [inputCapabilities, setInputCapabilities] = useState({});
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [model, setModel] = useState('glm-5.3-flash');
  const [temperature, setTemperature] = useState(0.2);
  const [reasoning, setReasoning] = useState('low');
  const [modelSettings, setModelSettings] = useState({});
  const [upload, setUpload] = useState(0);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [resultContent, setResultContent] = useState('');
  const [backgroundJob, setBackgroundJob] = useState(null);
  const [completionNotice, setCompletionNotice] = useState(null);
  const [requirementsVersions, setRequirementsVersions] = useState([]);
  const [remoteRequirementsVersions, setRemoteRequirementsVersions] = useState(null);
  const editorDirtyRef = useRef(false);
  const editorControllerRef = useRef(null);
  const historyIndexRef = useRef(window.history.state?.reqaiIndex ?? 0);
  const restoringPopRef = useRef(false);
  const registerEditor = useCallback((controller) => { editorControllerRef.current = controller; }, []);
  const [actorScope, setActorScope] = useState(null);
  const [identityReady, setIdentityReady] = useState(false);
  const [authEpoch, setAuthEpoch] = useState(0);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [activeReviewView, setActiveReviewView] = useState(null);
  const saveRequestRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  const [linkedChildId, setLinkedChildId] = useState(null);
  const [linkedChild, setLinkedChild] = useState(null);
  const [rebasePreview, setRebasePreview] = useState(null);
  const [restoredReviewState, setRestoredReviewState] = useState(null);
  const loadedResultJobIdRef = useRef(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const [finalReviewPrompt, setFinalReviewPrompt] = useState(null);
  const finalReviewResolverRef = useRef(null);
  const identityGenerationRef = useRef(0);
  const linkedResearchSubmissionRef = useRef(false);
  const [linkedResearchSubmitting, setLinkedResearchSubmitting] = useState(false);
  const researchRetryRef = useRef(null);
  const researchRetryInFlightRef = useRef(false);
  const [researchRetryBusy, setResearchRetryBusy] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [contextFormOpen, setContextFormOpen] = useState(() => !routeJobId);
  const [routeUnavailable, setRouteUnavailable] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [debugRefreshKey, setDebugRefreshKey] = useState(0);
  const [sseObservations, setSseObservations] = useState([]);
  const debugTriggerRef = useRef(null);
  const routeJobIdRef = useRef(routeJobId);
  const jobId = job?.jobId;
  const parsedResult = safeJson(resultContent);
  const legacyJob = Boolean(job && RETIRED_MODES.has(job.mode));
  const decompositionReady = Boolean(result && !legacyJob && (job?.type === 'DECOMPOSITION' || parsedResult?.mode === 'DECOMPOSITION'));
  const linkedResearch = job?.mode === 'REQUIREMENTS_INSIGHTS' || parsedResult?.mode === 'REQUIREMENTS_INSIGHTS';
  const activeLinkedResearch = Boolean(job?.type === 'RESEARCH' && job?.mode === 'REQUIREMENTS_INSIGHTS' && !TERMINAL.has(job.status));
  const childResearchActive = researchPresentation({ childId: linkedChildId, child: linkedChild }).active;
  const linkedResearchBusy = linkedResearchSubmitting || activeLinkedResearch || childResearchActive;
  const linkedResearchComplete = linkedResearch && job?.status === 'SUCCEEDED';
  const finalVersionReady = linkedResearchComplete && requirementsVersions.some((item) => item.sourceJobId === result?.jobId);
  const directFinalReady = Boolean(decompositionReady && requirementsVersions[0]?.sourceJobId === result?.jobId && requirementsVersions[0]?.decisions?.skippedResearch);
  const currentStage = finalVersionReady || directFinalReady ? 4 : linkedResearch ? 3 : decompositionReady ? 2 : 1;
  const completedStage = finalVersionReady || directFinalReady ? 4 : linkedResearchComplete ? 3 : linkedResearch ? 2 : decompositionReady ? 1 : 0;
  const handleEditorDirty = useCallback((dirty) => { editorDirtyRef.current = dirty; }, []);

  const navigate = useCallback((id, { replace = false, confirmed = false } = {}) => {
    if (saveInFlightRef.current && id !== routeJobIdRef.current) return false;
    if (!confirmed && editorDirtyRef.current && id !== routeJobIdRef.current) { setPendingNavigation({ id, replace }); return false; }
    const path = id ? `/tasks/${encodeURIComponent(id)}` : '/';
    const index = replace ? historyIndexRef.current : historyIndexRef.current + 1;
    window.history[replace ? 'replaceState' : 'pushState']({ reqaiIndex: index }, '', path);
    historyIndexRef.current = index;
    routeJobIdRef.current = id || null;
    setRouteJobId(id || null);
    return true;
  }, []);

  useEffect(() => {
    window.history.replaceState({ ...window.history.state, reqaiIndex: historyIndexRef.current }, '', window.location.href);
    const onPopState = (event) => {
      if (restoringPopRef.current) { restoringPopRef.current = false; return; }
      const id = jobIdFromPath();
      if ((editorDirtyRef.current || saveInFlightRef.current) && id !== routeJobIdRef.current) {
        const delta = Number.isInteger(event.state?.reqaiIndex) ? event.state.reqaiIndex - historyIndexRef.current : null;
        if (delta) { restoringPopRef.current = true; window.history.go(-delta); }
        else window.history.pushState({ reqaiIndex: historyIndexRef.current }, '', routeJobIdRef.current ? `/tasks/${encodeURIComponent(routeJobIdRef.current)}` : '/');
        if (!saveInFlightRef.current) setPendingNavigation({ id, historyDelta: delta }); return;
      }
      if (Number.isInteger(event.state?.reqaiIndex)) historyIndexRef.current = event.state.reqaiIndex;
      routeJobIdRef.current = id; setRouteJobId(id);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const warn = (event) => { if (editorDirtyRef.current || saveInFlightRef.current) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  useEffect(() => {
    const changed = () => {
      identityGenerationRef.current += 1;
      researchRetryRef.current = null; researchRetryInFlightRef.current = false; setResearchRetryBusy(false);
      finalReviewResolverRef.current?.(false); finalReviewResolverRef.current = null; setFinalReviewPrompt(null);
      saveInFlightRef.current = false; setVersionBusy(false); saveRequestRef.current = null;
      clearReviewDrafts();
      editorDirtyRef.current = false;
      editorControllerRef.current = null;
      setIdentityReady(false); setActorScope(null); setHistoryRefreshKey((key) => key + 1); setBackgroundJob(null); setCompletionNotice(null);
      unsentContextRef.current = { text: '', file: null, baseline: null, references: [] }; setHasContextDraft(false);
      setPendingNavigation(null); setRequirements(''); setFile(null); setBaselineFile(null); setReferenceFiles([]); uploadedMaterialsRef.current.clear(); setMaterialUploads(new Map());
      navigate(null, { confirmed: true, replace: true });
      setAuthEpoch((value) => value + 1);
    };
    const check = () => readAccessToken();
    window.addEventListener('reqai:auth-changed', changed);
    window.addEventListener('storage', check);
    window.addEventListener('focus', check);
    return () => {
      window.removeEventListener('reqai:auth-changed', changed);
      window.removeEventListener('storage', check);
      window.removeEventListener('focus', check);
    };
  }, [navigate]);

  useEffect(() => () => { finalReviewResolverRef.current?.(false); }, []);

  async function resolveNavigation(save) {
    if (save && !await editorControllerRef.current?.save?.()) return;
    editorControllerRef.current?.discard?.();
    editorDirtyRef.current = false;
    const next = pendingNavigation;
    setPendingNavigation(null);
    if (!next.view) setHistoryOpen(false);
    if (next.historyDelta) window.history.go(next.historyDelta);
    else if (next.view) { setEditorEpoch((value) => value + 1); setActiveReviewView(next.view); }
    else if (next.submit) submit();
    else if (next.newTask) startNewTask();
    else navigate(next.id, { replace: next.replace, confirmed: true });
  }

  function requestReviewView(view, { preserveDraft = false } = {}) {
    if (editorDirtyRef.current && !preserveDraft) setPendingNavigation({ view });
    else setActiveReviewView(view);
  }

  function compareRecovery(recovery) {
    const next = requirementsVersions[0];
    setRebasePreview({ ...rebaseReview(recovery.state, recovery.baseContent, next?.registry || next?.requirements || parsedResult, recovery.baseDecisions, next?.decisions), versions: requirementsVersions });
  }

  function restoreRecovery(recovery) {
    setRestoredReviewState(recovery.state);
    setActiveReviewView(recovery.state.editor === 'insights' ? 'insights' : null);
    setEditorEpoch((value) => value + 1);
  }

  function loadRemoteRequirementsVersion() {
    if (!remoteRequirementsVersions) return;
    const current = requirementsVersions[0];
    const next = remoteRequirementsVersions[0];
    const snapshot = editorControllerRef.current?.snapshot?.();
    if (snapshot && editorDirtyRef.current) {
      const base = current?.registry || current?.requirements || (isBabokRegistry(parsedResult) ? parsedResult : collectRequirements(parsedResult));
      setRebasePreview({ ...rebaseReview(snapshot, base, next.registry || next.requirements, current?.decisions, next.decisions), versions: remoteRequirementsVersions });
      return;
    }
    editorDirtyRef.current = false;
    setRequirementsVersions(remoteRequirementsVersions);
    setRemoteRequirementsVersions(null);
  }

  function applyRemoteReview(keepLocal) {
    editorControllerRef.current?.discard?.();
    setRestoredReviewState(keepLocal ? rebasePreview.state : null);
    if (keepLocal) setActiveReviewView(rebasePreview.state.editor === 'insights' ? 'insights' : null);
    setEditorEpoch((value) => value + 1);
    setRequirementsVersions(rebasePreview.versions);
    setRemoteRequirementsVersions(null);
    setRebasePreview(null);
    setError('');
    editorDirtyRef.current = keepLocal;
  }

  const loadRequirementsVersions = useCallback(async (id) => {
    const page = await enterpriseApi.listRequirementsVersions(id);
    return Promise.all((page.items || []).map((item) => item.requirements ? item : enterpriseApi.getRequirementsVersion(item.versionId)));
  }, []);

  const loadResult = useCallback(async (id, signal) => {
    const metadata = await enterpriseApi.getResult(id, { signal });
    if (routeJobIdRef.current !== id) return;
    setResult(metadata);
    const [content, versions] = await Promise.all([
      metadata.resultArtifactId && enterpriseApi.getResultContent ? enterpriseApi.getResultContent(id) : '',
      loadRequirementsVersions(id),
    ]);
    if (routeJobIdRef.current !== id) return;
    const parsed = safeJson(content);
    let hydrated = content;
    if (parsed?.mode === 'REQUIREMENTS_INSIGHTS' && parsed.inputRequirementsVersionId && !parsed.baseDecisions) {
      const source = await enterpriseApi.getRequirementsVersion(parsed.inputRequirementsVersionId);
      if (routeJobIdRef.current !== id || signal?.aborted) return;
      hydrated = JSON.stringify({ ...parsed, baseDecisions: source?.decisions || {} });
    }
    setResultContent(hydrated);
    setRequirementsVersions(versions);
    setRemoteRequirementsVersions(null);
    loadedResultJobIdRef.current = id;
  }, [loadRequirementsVersions]);

  const refresh = useCallback(async () => {
    const page = await enterpriseApi.listJobs({ limit: 20 });
    setHistoryRefreshKey((key) => key + 1);
    const rememberedId = localStorage.getItem(BACKGROUND_JOB_KEY);
    const remembered = rememberedId && page.items.find((item) => item.jobId === rememberedId);
    if (remembered && TERMINAL.has(remembered.status)) {
      localStorage.removeItem(BACKGROUND_JOB_KEY);
      setBackgroundJob(null);
      setCompletionNotice(remembered);
      return;
    }
    setBackgroundJob((current) => {
      const currentFresh = current && page.items.find((item) => item.jobId === current.jobId);
      if (currentFresh && !TERMINAL.has(currentFresh.status)) return currentFresh;
      if (remembered && !TERMINAL.has(remembered.status)) return remembered;
      return page.items.find((item) => item.jobId !== routeJobIdRef.current && !TERMINAL.has(item.status)) || null;
    });
  }, []);

  useEffect(() => {
    Promise.all([
      refresh(),
      enterpriseApi.getCapabilities?.().then((value) => {
        if (value.userId && value.tenantId) {
          const scope = JSON.stringify([value.tenantId, value.userId]);
          try { const previous = sessionStorage.getItem('reqai.reviewActor'); if (previous && previous !== scope) clearReviewDrafts(); sessionStorage.setItem('reqai.reviewActor', scope); } catch { /* session recovery is optional */ }
          setActorScope(scope);
        }
        setInputCapabilities({ integrationAvailable: value.capabilities?.domainOperations?.includes('decomposition') || false, discussionAvailable: value.capabilities?.requirementDiscussion !== false, maxBytes: value.capabilities?.inputMaxBytes });
        const configured = value.capabilities?.models;
        if (!configured?.length) return;
        setModels(configured);
        const capabilities = value.capabilities?.modelSettings || {};
        const saved = readNextSettings(value.userId && value.tenantId ? JSON.stringify([value.tenantId, value.userId]) : null, configured, capabilities);
        setModelSettings(capabilities); setModel(saved.model); setTemperature(saved.temperature); setReasoning(saved.reasoning);
      }),
    ]).catch((cause) => setError(cause.message)).finally(() => setIdentityReady(true));
  }, [refresh, authEpoch]);

  useEffect(() => {
    if (routeJobId || window.location.pathname !== '/') return;
    const legacyId = localStorage.getItem('reqai.activeJob') || localStorage.getItem('reqai.viewedJob');
    localStorage.removeItem('reqai.activeJob'); localStorage.removeItem('reqai.viewedJob');
    if (legacyId) navigate(legacyId, { replace: true });
  }, [navigate, routeJobId]);

  useEffect(() => {
    routeJobIdRef.current = routeJobId;
    setLinkedChildId(null); setLinkedChild(null);
    setActiveReviewView(null);
    setRestoredReviewState(null); setRebasePreview(null);
    setDebugOpen(false); setSseObservations([]); setRouteUnavailable(false); setError('');
    if (!routeJobId) {
      const draft = unsentContextRef.current;
      setContextFormOpen(true);
      setRequirements(draft.text); setFile(draft.file); setBaselineFile(draft.baseline); setReferenceFiles(draft.references);
      setJob(null); setResult(null); setResultContent(''); setRequirementsVersions([]); setRemoteRequirementsVersions(null);
      setBusinessContextLoading(false);
      loadedResultJobIdRef.current = null;
      return undefined;
    }
    setFile(null); setBaselineFile(null); setReferenceFiles([]);
    const controller = new AbortController();
    (async () => {
      try {
        const selected = await enterpriseApi.getJob(routeJobId, { signal: controller.signal });
        if (controller.signal.aborted || routeJobIdRef.current !== routeJobId) return;
        setJob(selected);
        if (selected.type === 'DECOMPOSITION' && !TERMINAL.has(selected.status)) setContextFormOpen(false);
        if (selected.type === 'DECOMPOSITION' || selected.mode === 'REQUIREMENTS_INSIGHTS') {
          setRequirements('');
          setBusinessContextLoading(true);
          try {
            const sourceJob = selected.mode === 'REQUIREMENTS_INSIGHTS' && selected.parentJobId
              ? await enterpriseApi.getJob(selected.parentJobId, { signal: controller.signal })
              : selected;
            if (sourceJob.inputArtifactId) {
              const source = await enterpriseApi.downloadArtifact(sourceJob.inputArtifactId);
              const text = await source.text();
              if (!controller.signal.aborted && routeJobIdRef.current === routeJobId) setRequirements(text);
            }
          } catch { /* the result remains usable even if its original artifact expired */ }
          finally {
            if (!controller.signal.aborted && routeJobIdRef.current === routeJobId) setBusinessContextLoading(false);
          }
        }
        setResult(null); setResultContent(''); setRequirementsVersions([]); setRemoteRequirementsVersions(null);
        loadedResultJobIdRef.current = null; editorDirtyRef.current = false;
        if (selected.status === 'SUCCEEDED') await loadResult(routeJobId, controller.signal);
      } catch (cause) {
        if (controller.signal.aborted) return;
        if (routeJobIdRef.current === routeJobId) { setRouteUnavailable(true); setJob(null); setError(userFacingError(cause)); }
      }
    })();
    return () => controller.abort();
  }, [loadResult, routeJobId]);

  useEffect(() => {
    if (!jobId) return undefined;
    const controller = new AbortController();
    subscribeJobEvents(jobId, { signal: controller.signal, onObservation: (observation) => {
      if (routeJobIdRef.current !== jobId) return;
      setSseObservations((current) => [...current.slice(-99), observation]);
    }, onEvent: async (event) => {
      if (routeJobIdRef.current !== jobId || (event.jobId && event.jobId !== jobId)) return;
      setDebugRefreshKey((value) => value + 1);
      if (event.eventType === 'requirements.version-created') {
        const versions = await loadRequirementsVersions(jobId);
        if (controller.signal.aborted || routeJobIdRef.current !== jobId) return;
        if (editorDirtyRef.current) setRemoteRequirementsVersions(versions);
        else {
          setRequirementsVersions(versions);
          setRemoteRequirementsVersions(null);
        }
        return;
      }
      if (event.eventType === 'linked-research.created' && event.linkedJobId) {
        setLinkedChildId(event.linkedJobId);
        setLinkedChild({ jobId: event.linkedJobId, parentJobId: jobId, inputArtifactId: event.requirementsVersionId });
        return;
      }
      const next = event.job || await enterpriseApi.getJob(jobId);
      if (controller.signal.aborted || routeJobIdRef.current !== jobId || next.jobId !== jobId) return;
      setJob(next);
      if (TERMINAL.has(next.status)) {
        if (next.status === 'SUCCEEDED' && loadedResultJobIdRef.current !== next.jobId) await loadResult(next.jobId);
        if (event.type !== 'reconcile') await refresh();
      }
    } });
    return () => controller.abort();
  }, [jobId, loadRequirementsVersions, loadResult, navigate, refresh]);

  useEffect(() => {
    if (!linkedChildId || !jobId) return undefined;
    const controller = new AbortController();
    const accept = (child) => {
      if (!controller.signal.aborted && routeJobIdRef.current === jobId && child?.jobId === linkedChildId && child.parentJobId === jobId) setLinkedChild(child);
    };
    enterpriseApi.getJob(linkedChildId, { signal: controller.signal }).then(accept).catch(() => {});
    subscribeJobEvents(linkedChildId, { signal: controller.signal, onEvent: async (event) => {
      if (event.jobId && event.jobId !== linkedChildId) return;
      accept(event.job || await enterpriseApi.getJob(linkedChildId, { signal: controller.signal }));
    } });
    return () => controller.abort();
  }, [linkedChildId, jobId]);

  useEffect(() => {
    if (!backgroundJob?.jobId || TERMINAL.has(backgroundJob.status)) return undefined;
    let stopped = false;
    const reconcile = async () => {
      try {
        const next = await enterpriseApi.getJob(backgroundJob.jobId);
        if (stopped) return;
        if (TERMINAL.has(next.status)) setHistoryRefreshKey((key) => key + 1);
        if (TERMINAL.has(next.status)) {
          if (localStorage.getItem(BACKGROUND_JOB_KEY) === next.jobId) localStorage.removeItem(BACKGROUND_JOB_KEY);
          setBackgroundJob(null);
          setCompletionNotice(next);
        } else setBackgroundJob(next);
      } catch { /* history remains the recovery path */ }
    };
    reconcile();
    const timer = window.setInterval(reconcile, 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [backgroundJob?.jobId, backgroundJob?.status]);

  useEffect(() => {
    if (!identityReady || !actorScope) return;
    try { localStorage.setItem(`reqai.nextAiSettings:${actorScope}`, JSON.stringify({ model, temperature: Number(temperature), reasoning })); } catch { /* settings still apply to this tab */ }
  }, [actorScope, identityReady, model, temperature, reasoning]);

  const options = useMemo(() => ({ mode: 'DECOMPOSITION', model, temperature: Number(temperature), reasoning }), [model, reasoning, temperature]);

  async function submit() {
    if (editorDirtyRef.current) { setPendingNavigation({ submit: true }); return; }
    const input = file || new Blob([requirements], { type: 'text/plain; charset=utf-8' });
    if (!file && !requirements.trim()) return;
    setContextFormOpen(false);
    setBusy(true);
    setError('');
    setUpload(0);
    try {
      const uploadMaterial = async (material) => {
        if (uploadedMaterialsRef.current.has(material)) return uploadedMaterialsRef.current.get(material);
        try {
          const artifact = await enterpriseApi.uploadArtifact(material, (progress) => { setUpload(progress); setMaterialUploads((current) => new Map(current).set(material, { progress })); });
          uploadedMaterialsRef.current.set(material, artifact);
          setMaterialUploads((current) => new Map(current).set(material, artifact));
          return artifact;
        } catch (cause) { setMaterialUploads((current) => new Map(current).set(material, { error: true })); throw cause; }
      };
      const artifact = await uploadMaterial(input);
      const extra = await Promise.allSettled([baselineFile, ...referenceFiles].filter(Boolean).map(uploadMaterial));
      if (extra.some((item) => item.status === 'rejected')) throw new Error('Не все материалы загружены. Успешные вложения сохранены; повторите запуск, чтобы загрузить оставшиеся.');
      const accepted = inputCapabilities.integrationAvailable
        ? await enterpriseApi.decomposeRequirements({ inputArtifactId: artifact.artifactId, ...(baselineFile ? { baselineArtifactId: uploadedMaterialsRef.current.get(baselineFile).artifactId } : {}), ...(referenceFiles.length ? { referenceArtifactIds: referenceFiles.map((value) => uploadedMaterialsRef.current.get(value).artifactId) } : {}), model, temperature: Number(temperature), reasoning })
        : await enterpriseApi.createJob({ type: 'DECOMPOSITION', inputArtifactId: artifact.artifactId, options });
      unsentContextRef.current = { text: '', file: null, baseline: null, references: [] }; setHasContextDraft(false);
      navigate(accepted.jobId);
      await refresh();
    } catch (cause) {
      if (!routeJobIdRef.current) setContextFormOpen(true);
      setError(cause.code ? userFacingError(cause) : cause.message || 'Не удалось запустить задачу. Повторите попытку.');
    }
    finally { setBusy(false); }
  }

  function load(id) {
    if (!navigate(id)) return;
    if (backgroundJob?.jobId === id) {
      localStorage.removeItem(BACKGROUND_JOB_KEY);
      setBackgroundJob(null);
    }
    setHistoryOpen(false);
  }

  function continueInBackground() {
    if (!job || TERMINAL.has(job.status)) return;
    localStorage.setItem(BACKGROUND_JOB_KEY, job.jobId);
    setBackgroundJob(job);
    navigate(null);
  }

  function startNewTask() {
    if (editorDirtyRef.current) { setPendingNavigation({ id: null, newTask: true }); return; }
    unsentContextRef.current = { text: '', file: null, baseline: null, references: [] }; setHasContextDraft(false);
    navigate(null);
    setContextFormOpen(true);
    setRequirements('');
    setFile(null); setBaselineFile(null); setReferenceFiles([]); uploadedMaterialsRef.current.clear(); setMaterialUploads(new Map());
    setUpload(0);
    setJob(null);
    setResult(null);
    setResultContent('');
    setRequirementsVersions([]);
    setRemoteRequirementsVersions(null);
    setError('');
    setVersionBusy(false);
    setHistoryOpen(false);
    loadedResultJobIdRef.current = null;
    editorDirtyRef.current = false;
    linkedResearchSubmissionRef.current = false;
    setLinkedResearchSubmitting(false);
  }

  async function saveRequirementsVersion({ requirements: nextRequirements, registry: nextRegistry, baseVersionId = null, decisions = {}, editedRecordIds = [] }) {
    if (!result?.jobId || saveInFlightRef.current) return null;
    saveInFlightRef.current = true;
    const savingJobId = result.jobId;
    const savingIdentity = identityGenerationRef.current;
    setVersionBusy(true);
    setError('');
    try {
      if (result.type === 'RESEARCH' || decisions.skippedResearch === true) {
        const issues = openReviewItems(nextRegistry || nextRequirements, decisions.review);
        if (issues.length) {
          const confirmed = await new Promise((resolve) => { finalReviewResolverRef.current = resolve; setFinalReviewPrompt({ issues, resolve }); });
          finalReviewResolverRef.current = null;
          if (!confirmed || routeJobIdRef.current !== savingJobId || savingIdentity !== identityGenerationRef.current) return null;
          decisions = updateReviewMetadata(decisions, { acknowledgment: { confirm: true } });
        } else decisions = updateReviewMetadata(decisions, {});
      }
      const content = { sourceJobId: savingJobId, baseVersionId, decisions, expectedLatestVersionId: requirementsVersions[0]?.versionId || null, ...(nextRegistry ? { registry: nextRegistry, editedRecordIds } : { requirements: nextRequirements }) };
      const fingerprint = JSON.stringify(content);
      if (saveRequestRef.current?.fingerprint !== fingerprint) saveRequestRef.current = { fingerprint, id: crypto.randomUUID() };
      const payload = { ...content, clientMutationId: saveRequestRef.current.id };
      const saved = await enterpriseApi.saveRequirementsVersion(payload);
      if (savingIdentity !== identityGenerationRef.current) return null;
      if (!saved?.versionId) throw new Error('Сервер не подтвердил сохранение версии. Повторите запрос.');
      if (routeJobIdRef.current !== savingJobId) return saved;
      editorControllerRef.current?.discard?.();
      setRestoredReviewState(null);
      setActiveReviewView(null);
      saveRequestRef.current = null;
      setRequirementsVersions((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
      setRemoteRequirementsVersions(null);
      editorDirtyRef.current = false;
      return saved;
    } catch (cause) {
      if (savingIdentity === identityGenerationRef.current && routeJobIdRef.current === savingJobId) {
        setError(cause.code === 'REQUIREMENTS_VERSION_CONFLICT' ? 'На сервере появилась новая версия. Сравните её с вашими правками перед сохранением.' : userFacingError(cause));
        if (cause.code === 'REQUIREMENTS_VERSION_CONFLICT') {
          try { const versions = await loadRequirementsVersions(savingJobId); if (routeJobIdRef.current === savingJobId) setRemoteRequirementsVersions(versions); } catch { /* draft remains available; retry can reload the conflict */ }
        }
      }
      return null;
    } finally { if (savingIdentity === identityGenerationRef.current) { saveInFlightRef.current = false; setVersionBusy(false); } }
  }

  async function startResearchFromDecomposition({ requirementsVersionId }) {
    if (!result?.jobId || !requirementsVersionId || linkedResearchSubmissionRef.current || versionBusy || activeLinkedResearch || childResearchActive) return;
    linkedResearchSubmissionRef.current = true;
    setLinkedResearchSubmitting(true);
    setVersionBusy(true);
    setError('');
    try {
      const accepted = await enterpriseApi.researchRequirements(requirementsVersionId, { model, temperature: Number(temperature), reasoning });
      navigate(accepted.jobId);
      await refresh();
    } catch (cause) { setError(userFacingError(cause)); }
    finally {
      linkedResearchSubmissionRef.current = false;
    setLinkedResearchSubmitting(false);
      setVersionBusy(false);
    }
  }

  async function retryResearch() {
    if (researchRetryInFlightRef.current || job?.mode !== 'REQUIREMENTS_INSIGHTS' || !job.inputArtifactId || !['FAILED', 'CANCELLED'].includes(job.status)) return;
    const sourceJobId = job.jobId;
    const identity = identityGenerationRef.current;
    // Keep the same body/key after an uncertain network response so a second
    // click cannot create a second paid run for the same retry request.
    if (researchRetryRef.current?.sourceJobId !== sourceJobId) researchRetryRef.current = {
      sourceJobId, versionId: job.inputArtifactId, key: crypto.randomUUID(),
      body: { model, temperature: Number(temperature), reasoning },
    };
    const request = researchRetryRef.current;
    researchRetryInFlightRef.current = true;
    setResearchRetryBusy(true); setError('');
    try {
      const accepted = request.accepted || await enterpriseApi.researchRequirements(request.versionId, request.body, request.key);
      request.accepted = accepted;
      if (identity !== identityGenerationRef.current) return;
      setHistoryRefreshKey((key) => key + 1);
      if (routeJobIdRef.current === sourceJobId) navigate(accepted.jobId);
    } catch (cause) {
      if (identity === identityGenerationRef.current && routeJobIdRef.current === sourceJobId) setError(userFacingError(cause));
    } finally {
      if (identity === identityGenerationRef.current) { researchRetryInFlightRef.current = false; setResearchRetryBusy(false); }
    }
  }

  async function download() {
    const blob = await enterpriseApi.downloadArtifact(result.resultArtifactId);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reqai-${result.jobId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const canSubmit = file || requirements.trim();
  const activeJob = job && !TERMINAL.has(job.status);
  const progressingJob = job && ['ACCEPTED', 'QUEUED', 'RUNNING'].includes(job.status);
  const backgroundActive = backgroundJob && !TERMINAL.has(backgroundJob.status);
  const submissionBlocked = activeJob || backgroundActive;
  const decompositionInProgress = busy || Boolean(job?.type === 'DECOMPOSITION' && activeJob);
  useEffect(() => {
    if (decompositionInProgress) setContextFormOpen(false);
  }, [decompositionInProgress]);
  const cancelActiveJob = async () => {
    const id = job.jobId;
    try { await enterpriseApi.cancelJob(id); const next = await enterpriseApi.getJob(id); if (routeJobIdRef.current === id) setJob(next); }
    catch (cause) { if (routeJobIdRef.current === id) setError(userFacingError(cause)); }
  };

  const changeContext = (key, value, setter) => {
    setter(value);
    if (!routeJobIdRef.current) {
      unsentContextRef.current = { ...unsentContextRef.current, [key]: value };
      const draft = unsentContextRef.current;
      setHasContextDraft(Boolean(draft.text.trim() || draft.file || draft.baseline || draft.references.length));
    }
  };
  const commonInput = <ContextInput text={requirements} onText={(value) => changeContext('text', value, setRequirements)} file={file} onFile={(value) => changeContext('file', value, setFile)} baseline={baselineFile} onBaseline={(value) => changeContext('baseline', value, setBaselineFile)} references={referenceFiles} onReferences={(value) => changeContext('references', value, setReferenceFiles)} uploads={materialUploads} busy={decompositionInProgress} {...inputCapabilities} />;

  const submitButton = (
    <button disabled={!canSubmit || busy || submissionBlocked} onClick={submit} className="w-full sm:w-auto text-white py-3 px-6 rounded-lg font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
      {busy ? <><Loader2 className="w-5 h-5 animate-spin" />Загрузка {Math.round(upload * 100)}%</> : submissionBlocked ? <><Loader2 className="w-5 h-5 animate-spin" />{activeJob ? job.type === 'DECOMPOSITION' ? 'Декомпозиция выполняется…' : 'Исследование выполняется…' : 'Другая задача выполняется…'}</> : <><Sparkles className="w-4 h-4" />Декомпозировать требования</>}
    </button>
  );

  const compactReview = currentStage === 2 && !isBabokTextDraft(parsedResult);
  const contextComplete = Boolean(result && !legacyJob && (job?.type === 'DECOMPOSITION' || result.mode === 'DECOMPOSITION'));
  const showReadOnlyBusinessContext = Boolean((linkedResearch && !result) || directFinalReady);
  const contextFormBody = <>
    {commonInput}
    <div className="flex justify-end mt-5">
      <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
        {submitButton}
      </div>
    </div>
  </>;

  return (
    <div className="reqai-workspace min-h-screen bg-[var(--reqai-canvas)]">
      {finalReviewPrompt && <ReviewDialog label="Открытые вопросы перед финализацией" onClose={() => { finalReviewPrompt.resolve(false); setFinalReviewPrompt(null); }}><h2 className="font-bold text-lg">В документе остаются вопросы</h2><p className="text-sm my-3">Сохранение финальной версии не означает, что все требования согласованы. Подтвердите, что сохраняете перечисленные вопросы открытыми. Они войдут в экспорт.</p><ul className="space-y-2">{finalReviewPrompt.issues.map((issue) => <li key={issue.id} className="rounded-lg border border-amber-200 p-3 text-sm">{issue.id}: {issue.text}</li>)}</ul><div className="flex gap-2 mt-4 flex-wrap"><button onClick={() => { finalReviewPrompt.resolve(false); setFinalReviewPrompt(null); }} className="p-3 rounded-lg border">Вернуться к проверке</button><button onClick={() => { finalReviewPrompt.resolve(true); setFinalReviewPrompt(null); }} className="p-3 rounded-lg bg-indigo-600 text-white">Сохранить с открытыми вопросами</button></div></ReviewDialog>}
      {pendingNavigation && !finalReviewPrompt && <UnsavedNavigationDialog busy={versionBusy} onSave={() => resolveNavigation(true)} onDiscard={() => resolveNavigation(false)} onStay={() => setPendingNavigation(null)} />}
      {rebasePreview && <ReviewDialog label="Сравнение версий" onClose={() => setRebasePreview(null)}><h2 className="font-bold text-lg">Сравните правки с новой версией</h2><p>Перенос применит перечисленные локальные изменения поверх новой базы. Проверьте конфликты перед подтверждением.</p>{rebasePreview.changes.map((change, index) => <article key={index} className="my-3 border rounded-lg p-3"><h3>{change.id} · {change.operation}</h3><p>На сервере: {change.remote || 'Нет записи'}</p><p>Моя правка: {change.local || 'Удалить'}</p></article>)}<div className="flex flex-wrap gap-3"><button onClick={() => setRebasePreview(null)} className="p-3 border rounded-lg">Остаться с черновиком</button><button onClick={() => applyRemoteReview(true)} className="p-3 rounded-lg bg-indigo-600 text-white">Перенести мои правки</button><button onClick={() => applyRemoteReview(false)} className="p-3 text-red-700">Отбросить мои правки и загрузить</button></div></ReviewDialog>}
      <nav className="bg-white/95 backdrop-blur border-b border-[var(--reqai-line)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center min-h-16 gap-3 sm:gap-6">
            <span className="text-base font-extrabold tracking-tight mr-auto sm:mr-3"><span className="text-slate-900">Req</span><span className="text-indigo-600">AI</span></span>
            <button onClick={() => startNewTask()} aria-current="page" className="h-16 px-1 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Подготовка требований</button>
            {job && TERMINAL.has(job.status) && <button aria-label="Новая задача" onClick={startNewTask} className="p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Новая задача</span></button>}
            {backgroundActive && <BackgroundJobIndicator job={backgroundJob} onOpen={() => load(backgroundJob.jobId)} />}
            <button aria-label="История" onClick={() => setHistoryOpen(true)} className="p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><History className="w-4 h-4" /><span className="hidden sm:inline">История</span></button>
            <AiSettingsDisclosure model={model}><ModelControls capabilities={modelSettings} models={models} model={model} setModel={(value) => { setModel(value); setReasoning(effectiveReasoning(value, reasoning, modelSettings)); }} temperature={temperature} setTemperature={setTemperature} reasoning={reasoning} setReasoning={setReasoning} /></AiSettingsDisclosure>
            <button ref={debugTriggerRef} aria-label="Debug" title={job ? 'Debug' : 'Debug станет доступен после запуска задачи'} disabled={!job} onClick={() => setDebugOpen(true)} className="ml-auto p-2 rounded-lg text-slate-600 hover:text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><Bug className="w-4 h-4" /></button>
          </div>
        </div>
      </nav>

      {routeUnavailable ? <main className="max-w-3xl mx-auto px-4 py-16"><section className="rounded-2xl border border-red-200 bg-white p-8 text-center"><AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" /><h1 className="text-xl font-bold text-slate-900">Задача недоступна</h1><p className="text-sm text-slate-500 mt-2">Проверьте адрес или права доступа. Другая задача не была открыта автоматически.</p><button onClick={() => navigate(null)} className="mt-5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Создать новую задачу</button></section></main> : legacyJob ? (
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {progressingJob && <ActiveJobPanel job={job} onCancel={cancelActiveJob} onBackground={continueInBackground} />}
          <JobStateCard job={job} onCancel={cancelActiveJob} onRetry={linkedResearch && job?.inputArtifactId ? retryResearch : undefined} retryBusy={researchRetryBusy} />
          <ArchivedLegacyResult job={job} result={result} onDownload={result?.resultArtifactId ? download : null} />
        </main>
      ) : (
        <main className={`max-w-7xl mx-auto px-4 ${compactReview ? "py-4" : "py-6"}`}>
          {job && <section aria-label="Название задачи" className={compactReview ? "mb-2" : "mb-4"}><TaskTitle key={job.jobId} job={job} result={result} onUpdated={(metadata) => { setJob((current) => current && [current.jobId, current.metadataJobId].includes(metadata.jobId) ? ({ ...current, title: metadata.title, metadataRevision: metadata.metadataRevision }) : current); setHistoryRefreshKey((key) => key + 1); }} /></section>}
          {job && hasContextDraft && <button onClick={() => navigate(null)} className="mb-4 p-2 border rounded-lg text-sm text-indigo-700">К черновику новой задачи</button>}
          {(contextComplete || linkedResearch) && <WorkflowStepper compact={compactReview} currentStage={currentStage} completedStage={completedStage} skippedStages={directFinalReady ? [3] : []} />}
          {showReadOnlyBusinessContext && <section className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden"><OriginalBusinessContext value={requirements} loading={businessContextLoading} /></section>}
          {activeLinkedResearch && !contextComplete ? <div className="mb-5"><ActiveJobPanel job={job} onCancel={cancelActiveJob} onBackground={continueInBackground} /></div> : contextComplete && !directFinalReady ? compactReview ? null : <section className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden">
            <OriginalBusinessContext value={requirements} loading={businessContextLoading} editable>
              <div>
                <h2 className="text-balance text-lg md:text-xl font-bold text-slate-900 mb-1">Изменить бизнес-задачу</h2>
                <p className="text-pretty text-sm text-slate-500 mb-4">После изменений запустите декомпозицию повторно.</p>
                {contextFormBody}
              </div>
            </OriginalBusinessContext>
          </section> : linkedResearch || directFinalReady ? null : <>
            <div className="mb-6"><h1 className="text-balance text-2xl md:text-3xl font-bold text-slate-900">Подготовка требований</h1></div>
            <WorkflowStepper currentStage={currentStage} completedStage={completedStage} skippedStages={directFinalReady ? [3] : []} />
            <BusinessContextInputCard open={contextFormOpen} onOpenChange={setContextFormOpen} running={decompositionInProgress} summary={file?.name || requirements.trim()}>
              {contextFormBody}
            </BusinessContextInputCard>
          </>}
          {error && <div role="alert" className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap">{error}</div>}
          <div className="space-y-6">
            {linkedChildId && !compactReview && <section role="status" className="rounded-xl border border-indigo-200 bg-indigo-50 p-4"><p>Для этих требований запущено AI-исследование. Исходная версия остаётся открытой.</p><button className="px-3 py-2 font-semibold text-indigo-700" onClick={() => load(linkedChildId)}>Открыть AI-исследование</button></section>}
            {remoteRequirementsVersions && <section role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4 flex-wrap"><div><p className="text-sm font-semibold text-amber-900">Доступна новая сохранённая версия</p><p className="text-xs text-amber-700 mt-1">Она создана в другом клиенте. Текущие несохранённые изменения оставлены без изменений.</p></div><button onClick={loadRemoteRequirementsVersion} className={compactReview ? "px-4 py-2 rounded-lg bg-indigo-600 text-sm font-semibold text-white hover:bg-indigo-700" : "px-4 py-2 rounded-lg border border-amber-300 bg-white text-sm font-semibold text-amber-800 hover:bg-amber-100"}>Загрузить новую версию</button></section>}
            {progressingJob && !activeLinkedResearch && <ActiveJobPanel job={job} onCancel={cancelActiveJob} onBackground={continueInBackground} />}
            <JobStateCard job={job} onCancel={cancelActiveJob} onRetry={linkedResearch && job?.inputArtifactId ? retryResearch : undefined} retryBusy={researchRetryBusy} />
            {result && identityReady && <RequirementsReviewContext.Provider value={{ conflict: Boolean(remoteRequirementsVersions), childId: linkedChildId, child: linkedChild, submitting: linkedResearchSubmitting, onOpenResearch: () => load(linkedChildId), source: compactReview ? <OriginalBusinessContext compact value={requirements} loading={businessContextLoading} editable><h2 className="text-lg font-bold">Изменить бизнес-задачу</h2><p className="mb-4 text-sm text-slate-600">После изменений запустите декомпозицию повторно.</p>{contextFormBody}</OriginalBusinessContext> : null }}><ResultExportContext.Provider value={<VersionExport key={`${result.jobId}:${authEpoch}`} version={requirementsVersions[0]} isDirty={() => editorDirtyRef.current} onSave={() => editorControllerRef.current?.save?.()} />}><ResultPanel reservedIds={requirementsVersions.flatMap((version) => Object.values(version.registry?.groups || version.requirements || {}).filter(Array.isArray).flat().map((record) => record.id))} editorEpoch={editorEpoch} activeReviewView={activeReviewView} requestReviewView={requestReviewView} restoredReviewState={restoredReviewState} compareRecovery={compareRecovery} restoreRecovery={restoreRecovery} actorScope={actorScope} registerEditor={registerEditor} result={result} resultContent={resultContent} latestVersion={requirementsVersions[0] || null} businessContext={requirements} businessContextLoading={businessContextLoading} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} onDirtyChange={handleEditorDirty} busy={versionBusy} researchBusy={linkedResearchBusy} discussionEnabled={inputCapabilities.discussionAvailable !== false} /></ResultExportContext.Provider></RequirementsReviewContext.Provider>}
          </div>
        </main>
      )}

      <HistoryDrawer key={actorScope || 'anonymous'} open={historyOpen && !pendingNavigation && !rebasePreview && !finalReviewPrompt} onClose={closeHistory} activeJobId={jobId} onSelect={load} refreshKey={historyRefreshKey} />
      <DebugPanel resultContent={resultContent || result?.summary} open={debugOpen} onClose={() => setDebugOpen(false)} jobId={jobId} observations={sseObservations} refreshKey={debugRefreshKey} triggerRef={debugTriggerRef} onDownload={result?.resultArtifactId ? download : null} />
      {completionNotice && <section role="status" aria-label="Задача завершена" className="fixed right-5 bottom-5 z-[90] w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border border-slate-200 bg-white shadow-2xl p-4"><div className="flex items-start gap-3"><span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${completionNotice.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{completionNotice.status === 'SUCCEEDED' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</span><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{completionNotice.status === 'SUCCEEDED' ? 'Задача готова' : STATUS_LABELS[completionNotice.status]}</p><p className="text-sm text-slate-500 mt-0.5">{MODE_LABELS[completionNotice.mode] || TYPE_LABELS[completionNotice.type]}</p><div className="flex gap-2 mt-3"><button onClick={() => { const id = completionNotice.jobId; setCompletionNotice(null); load(id); }} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Открыть результат</button><button aria-label="Закрыть уведомление" onClick={() => setCompletionNotice(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold">Закрыть</button></div></div></div></section>}
    </div>
  );
}

// These pure building blocks are exported so their compatibility rules can be
// tested independently from the long-running workspace lifecycle.
/* eslint-disable react-refresh/only-export-components */
export {
  safeJson,
  primaryStatus,
  userFacingError,
  failureMessage,
  jobIdFromPath,
  formatDuration,
  collectRequirements,
  cloneJson,
  isBabokRegistry,
  babokRegistryFrom,
  babokRegistryCounts,
  withBabokCounts,
  stableBabokId,
  babokManualCitation,
  createBabokManualRecord,
  removeBabokRecord,
  babokRecordDetails,
  makeLegacyRecord,
  displayEnhancementsForInsight,
  inferTargetTypeFromInsightCategory,
  displayBabokEnhancementsForInsight,
  babokRegistryIds,
  addBabokResearchRecord,
  finalBabokRegistry,
  formatElapsed,
  WorkflowStepper,
  AiSettingsDisclosure,
  Markdown,
  EditableRequirementCard,
  BabokRequirementCard,
  BabokAddRequirementForm,
  AddRequirementForm,
  RequirementsLayoutToggle,
  BabokRegistryResult,
  DecompositionResult,
  ApplicabilityBars,
  InsightEnhancementDecisionRow,
  SourceRequirementsSnapshot,
  SourceBusinessContextSnapshot,
  SourceDataMenu,
  OriginalBusinessContext,
  BusinessContextInputCard,
  FinalRequirementsEditor,
  BabokSourceRegistrySnapshot,
  BabokRequirementsInsightsResult,
  RequirementsInsightsResult,
  ResultView,
  ModelControls,
  ExecutionTimeline,
  ActiveJobPanel,
  BackgroundJobIndicator,
  JobStateCard,
  DebugPanel,
  ArchivedLegacyResult,
  UnsavedNavigationDialog,
  ResultPanel,
};
/* eslint-enable react-refresh/only-export-components */

function UnsavedNavigationDialog({ busy, onSave, onDiscard, onStay }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => previous?.focus?.();
  }, []);
  return <div className="fixed inset-0 z-[100] bg-slate-900/40 flex items-center justify-center p-4"><section ref={dialog} role="dialog" aria-modal="true" aria-label="Несохранённые изменения" className="max-w-md rounded-2xl bg-white p-6 shadow-xl" onKeyDown={(event) => {
    if (event.key === 'Escape' && !busy) onStay();
    if (event.key === 'Tab') {
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled)')];
      const first = controls[0]; const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><h2 className="font-bold text-lg">Есть несохранённые изменения</h2><p className="my-3 text-slate-600">Сохраните их перед переходом или явно откажитесь от правок.</p><div className="flex gap-2 flex-wrap"><button disabled={busy} onClick={onStay} className="px-4 py-2 rounded-lg border">Остаться</button><button disabled={busy} onClick={onSave} className="px-4 py-2 rounded-lg bg-indigo-600 text-white">Сохранить и перейти</button><button disabled={busy} onClick={onDiscard} className="px-4 py-2 rounded-lg text-red-700">Отбросить и перейти</button></div></section></div>;
}

function ResultPanel({ result, resultContent, latestVersion, businessContext, businessContextLoading, onSaveRequirements, onStartResearch, onSaveFinal, onDirtyChange, busy, researchBusy = false, actorScope, registerEditor, reservedIds, restoredReviewState, compareRecovery, restoreRecovery, editorEpoch, activeReviewView, requestReviewView, discussionEnabled = true }) {
  return (
    <section className="space-y-4">
      <ReviewSessionProvider businessContext={businessContext} reservedIds={reservedIds} view={activeReviewView} requestView={requestReviewView} restoredState={restoredReviewState} compareRecovery={compareRecovery} restoreRecovery={restoreRecovery} scope={actorScope} jobId={result.jobId} baseVersionId={latestVersion?.versionId} register={registerEditor}><ResultView key={`${result.jobId}:${latestVersion?.versionId || 'base'}:${editorEpoch}`} content={resultContent || result.summary || ''} latestVersion={latestVersion} businessContext={businessContext} businessContextLoading={businessContextLoading} onSaveRequirements={onSaveRequirements} onStartResearch={onStartResearch} onSaveFinal={onSaveFinal} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} jobId={result.jobId} discussionEnabled={discussionEnabled} /></ReviewSessionProvider>
    </section>
  );
}
