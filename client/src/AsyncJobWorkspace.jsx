import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ExternalLink,
  FileUp,
  History,
  Info,
  Loader2,
  Link2,
  List,
  MoreHorizontal,
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
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { enterpriseApi, subscribeJobEvents } from './api/enterprise-api.js';
import { EXECUTION_PHASES, executionPhaseIndex, focusMessageForJob, isModelPhase, visualProgressForJob } from './job-progress.js';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const BACKGROUND_JOB_KEY = 'reqai.backgroundJob';
const RETIRED_MODES = new Set(['DECOMPOSITION_WITH_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST']);
const MODE_LABELS = {
  DECOMPOSITION: 'Подготовка требований',
  REQUIREMENTS_INSIGHTS: 'AI-исследование требований',
};
const TYPE_LABELS = { DECOMPOSITION: 'Подготовка требований', RESEARCH: 'Исследование' };
const STATUS_LABELS = { ACCEPTED: 'Ожидает запуска', QUEUED: 'В очереди', RUNNING: 'Выполняется', RETRY_WAIT: 'Повторяем этап', SUCCEEDED: 'Готово', FAILED: 'Не выполнено', CANCEL_REQUESTED: 'Отменяется', CANCELLED: 'Отменено' };
const OUTCOME_LABELS = { COMPLETE: 'Готово', PARTIAL: 'Готово частично', FAILED: 'Не выполнено' };
const STATUS_TONES = { ACCEPTED: 'bg-slate-100 text-slate-600', QUEUED: 'bg-slate-100 text-slate-600', RUNNING: 'bg-indigo-100 text-indigo-700', RETRY_WAIT: 'bg-amber-100 text-amber-700', SUCCEEDED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', CANCEL_REQUESTED: 'bg-amber-100 text-amber-700', CANCELLED: 'bg-slate-100 text-slate-600' };
const DEFAULT_MODELS = ['glm-5.3', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'];
const INSIGHT_CATEGORY_META = {
  trends: { label: 'Тренды рынка', color: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-600 text-white', icon: TrendingUp },
  patterns: { label: 'Архитектурные паттерны', color: 'bg-violet-100 text-violet-700', active: 'bg-violet-600 text-white', icon: Sparkles },
  risks: { label: 'Риски', color: 'bg-orange-100 text-orange-700', active: 'bg-orange-600 text-white', icon: AlertTriangle },
  competitors: { label: 'Конкурентный анализ', color: 'bg-blue-100 text-blue-700', active: 'bg-blue-600 text-white', icon: Users },
  standards: { label: 'Стандарты и нормативы', color: 'bg-amber-100 text-amber-700', active: 'bg-amber-600 text-white', icon: BookOpen },
};
const SOURCE_TYPE_LABELS = { regulatory: 'Нормативные документы', industry_report: 'Отраслевой отчёт', case_study: 'Кейс', academic: 'Исследования', open_standard: 'Открытый стандарт', market_research: 'Исследование рынка' };
const TARGET_TYPE_LABELS = {
  business: 'В бизнес-требования',
  functional: 'В функциональные',
  nonfunctional: 'В нефункциональные',
};
const TARGET_TYPE_COLORS = {
  business: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
  functional: 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100',
  nonfunctional: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
};
const TARGET_TYPE_ICON_COLORS = {
  business: 'text-blue-600',
  functional: 'text-violet-600',
  nonfunctional: 'text-amber-600',
};
const REQUIREMENT_COLUMNS = [
  ['business', 'Бизнес-требования', 'Что должно измениться для клиента и бизнеса', 'border-t-blue-500', 'BT'],
  ['functional', 'Функциональные требования', 'Что система должна уметь делать', 'border-t-violet-500', 'FT'],
  ['nonfunctional', 'Нефункциональные требования', 'Надёжность, производительность и соответствие требованиям', 'border-t-amber-500', 'NFT'],
];

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function primaryStatus(jobOrResult) {
  if (!jobOrResult) return null;
  if (jobOrResult.outcome === 'PARTIAL') return { label: OUTCOME_LABELS.PARTIAL, tone: 'bg-amber-100 text-amber-700' };
  const status = jobOrResult.status || (jobOrResult.outcome ? 'SUCCEEDED' : null);
  return { label: STATUS_LABELS[status] || OUTCOME_LABELS[jobOrResult.outcome] || 'Статус неизвестен', tone: STATUS_TONES[status] || 'bg-slate-100 text-slate-600' };
}

function userFacingError(cause) {
  if (cause?.code === 'USER_ACTIVE_JOB_LIMIT') return 'Другая задача уже выполняется. Дождитесь её завершения и попробуйте снова.';
  return `${cause?.code || 'ERROR'}: ${cause?.message || 'Не удалось выполнить действие'}`;
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

function WorkflowStepper({ currentStage = 1, completedStage = 0, skippedStages = [] }) {
  const stages = [
    ['Контекст', 'Опишите бизнес-задачу'],
    ['Требования', 'Проверьте декомпозицию'],
    ['AI-исследование', 'Необязательный шаг'],
    ['Финальная версия', 'Сохраните результат'],
  ];
  return (
    <section aria-label="Прогресс подготовки требований" className="bg-white rounded-2xl border border-slate-200 px-4 py-4 md:px-5 mb-6">
      <p className="text-xs font-bold uppercase tracking-wide text-indigo-600 mb-4">Этап {currentStage} из {stages.length}</p>
      <ol aria-label="Этапы подготовки требований" className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
        {stages.map(([title, subtitle], index) => {
          const number = index + 1;
          const skipped = skippedStages.includes(number);
          const complete = number <= completedStage && !skipped;
          const isCurrent = number === currentStage;
          return <li key={title} aria-current={isCurrent ? 'step' : undefined} className="min-w-0 flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${isCurrent ? 'bg-indigo-600 text-white ring-4 ring-indigo-50' : complete ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{complete && !isCurrent ? <Check className="w-3.5 h-3.5" /> : number}</span>
            <span className="min-w-0">
              <span className={`block text-xs font-semibold truncate ${isCurrent ? 'text-indigo-900' : complete ? 'text-emerald-800' : 'text-slate-500'}`}>{title}</span>
              <span className="hidden xl:block text-[11px] text-slate-400 truncate mt-0.5">{skipped ? 'Пропущено' : subtitle}</span>
            </span>
          </li>;
        })}
      </ol>
    </section>
  );
}

function AiSettingsDisclosure({ model, children }) {
  return <details className="relative group">
    <summary aria-label="Настройки AI" className="list-none cursor-pointer p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
      <Settings2 className="w-4 h-4 text-indigo-500" />
      <span className="hidden sm:inline">Настройки AI</span>
      <span className="hidden lg:inline text-xs font-normal text-slate-400">{model} · рекомендуется</span>
    </summary>
    <div className="absolute right-0 top-full mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-xl z-50">{children}</div>
  </details>;
}

function Markdown({ children }) {
  if (!children) return null;
  return (
    <div className="prose prose-slate max-w-none prose-headings:font-bold prose-a:text-blue-700 prose-p:leading-relaxed">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{children}</ReactMarkdown>
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

function EditableRequirementCard({ requirement, onEdit, onDelete, onDraftChange, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(requirement.text);

  function save() {
    if (text.trim()) onEdit(text.trim());
    onDraftChange?.(false);
    setEditing(false);
  }

  function cancel() {
    setText(requirement.text);
    onDraftChange?.(false);
    setEditing(false);
  }

  return (
    <article className={`group relative py-5 first:pt-0 last:pb-0 ${requirement.fromResearch ? 'bg-indigo-50/40 -mx-3 px-3 rounded-xl' : ''}`}>
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{requirement.id}</span>
          {requirement.fromResearch && <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600"><Sparkles className="w-3.5 h-3.5" />AI</span>}
        </div>
        {!editing && !readOnly && <details className="relative">
          <summary role="button" aria-label={`Действия для ${requirement.id}`} title="Действия" className="list-none cursor-pointer rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><MoreHorizontal className="w-5 h-5" /></summary>
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
            <button onClick={save} className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Сохранить</button>
            <button onClick={cancel} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Отмена</button>
          </div>
        </div>
      ) : (
        <>
          <p className="text-[15px] text-slate-700 leading-7 max-w-4xl">{requirement.text}</p>
        </>
      )}
    </article>
  );
}

function AddRequirementForm({ onAdd, onDraftChange, categoryLabel }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  function add() {
    if (!text.trim()) return;
    onAdd(text.trim());
    onDraftChange?.(false);
    setText('');
    setOpen(false);
  }
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="w-4 h-4" />Добавить требование</button>;
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">Новое требование · {categoryLabel}</p>
      <textarea aria-label={`Новое требование: ${categoryLabel}`} value={text} onChange={(event) => { setText(event.target.value); onDraftChange?.(Boolean(event.target.value)); }} rows={3} autoFocus placeholder="Введите формулировку требования..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none bg-white" />
      <div className="mt-2 flex gap-2">
        <button onClick={add} disabled={!text.trim()} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300">Добавить</button>
        <button onClick={() => { setText(''); onDraftChange?.(false); setOpen(false); }} className="px-4 py-2 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200">Отмена</button>
      </div>
    </div>
  );
}

function useRequirementsLayout() {
  const [layout, setLayoutState] = useState(() => localStorage.getItem('reqai.requirementsLayout') === 'rows' ? 'rows' : 'columns');
  function setLayout(value) {
    setLayoutState(value);
    localStorage.setItem('reqai.requirementsLayout', value);
  }
  return [layout, setLayout];
}

function RequirementsLayoutToggle({ layout, onChange }) {
  return <div role="group" aria-label="Вид требований" className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
    <button type="button" aria-pressed={layout === 'columns'} onClick={() => onChange('columns')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${layout === 'columns' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><Columns3 className="w-3.5 h-3.5" />Столбцы</button>
    <button type="button" aria-pressed={layout === 'rows'} onClick={() => onChange('rows')} className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold ${layout === 'rows' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><List className="w-3.5 h-3.5" />Строки</button>
  </div>;
}

function DecompositionResult({ value, latestVersion, onSave, onStartResearch, onDirtyChange, busy, researchBusy }) {
  const [requirements, setRequirements] = useState(() => latestVersion?.requirements?.business && latestVersion?.requirements?.functional && latestVersion?.requirements?.nonfunctional ? latestVersion.requirements : collectRequirements(value));
  const [dirtyDrafts, setDirtyDrafts] = useState(() => new Set());
  const [layout, setLayout] = useRequirementsLayout();
  const hasSavedVersion = Boolean(latestVersion?.versionId);
  const hasUnsavedChanges = dirtyDrafts.size > 0 || !hasSavedVersion || JSON.stringify(requirements) !== JSON.stringify(latestVersion.requirements);

  function setDraftDirty(key, dirty) {
    setDirtyDrafts((current) => { const next = new Set(current); if (dirty) next.add(key); else next.delete(key); return next; });
  }

  useEffect(() => onDirtyChange?.(hasUnsavedChanges), [hasUnsavedChanges, onDirtyChange]);

  function editRequirement(type, id, text) {
    setRequirements((current) => ({ ...current, [type]: current[type].map((item) => item.id === id ? { ...item, text } : item) }));
  }

  function deleteRequirement(type, id) {
    setRequirements((current) => ({ ...current, [type]: current[type].filter((item) => item.id !== id) }));
  }

  function addRequirement(type, text, fromResearch = false) {
    const prefix = REQUIREMENT_COLUMNS.find(([key]) => key === type)?.[4] || 'REQ';
    setRequirements((current) => {
      const number = current[type].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      return { ...current, [type]: [...current[type], { id: `${prefix}-${number}`, text, fromResearch }] };
    });
  }

  return (
    <div className="space-y-5">
      <div className="sticky top-16 z-30 -mx-4 px-4 py-3 bg-gray-50/95 backdrop-blur border-y border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {hasSavedVersion && !hasUnsavedChanges && <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><Check className="w-4 h-4" /></span>}
          <p id="research-save-status" className={`text-sm font-semibold ${hasSavedVersion && !hasUnsavedChanges ? 'text-emerald-700' : 'text-slate-700'}`}>{!hasSavedVersion ? 'Сохраните требования перед AI-исследованием' : hasUnsavedChanges ? 'Есть несохранённые изменения' : `Сохранено · ${new Date(latestVersion.createdAt).toLocaleString()}`}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {hasUnsavedChanges && <button disabled={busy} onClick={() => onSave({ requirements, baseVersionId: latestVersion?.versionId || null })} className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{hasSavedVersion ? 'Сохранить изменения' : 'Сохранить проверенную версию'}</button>}
          <button aria-label={researchBusy ? 'AI-исследование выполняется…' : 'Улучшить требования с помощью AI'} aria-describedby="research-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : researchBusy ? 'Дождитесь завершения текущего AI-исследования' : 'Необязательный следующий шаг'} disabled={busy || researchBusy || !hasSavedVersion || hasUnsavedChanges} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="w-full sm:w-auto px-5 py-2.5 border border-indigo-200 bg-white text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400 disabled:bg-slate-100 flex items-center justify-center gap-2">{researchBusy ? <><Loader2 className="w-4 h-4 animate-spin" />AI-исследование выполняется…</> : <><Sparkles className="w-4 h-4" />Улучшить с помощью AI <span className="font-normal text-slate-400">· необязательно</span></>}</button>
          <button aria-describedby="research-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : 'Пропустить необязательное AI-исследование'} disabled={busy || researchBusy || !hasSavedVersion || hasUnsavedChanges} onClick={() => onSave({ requirements, baseVersionId: latestVersion.versionId, decisions: { ...(latestVersion.decisions || {}), skippedResearch: true } })} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Перейти к финальной версии</button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-bold text-slate-900">Категории требований</h2>
        <RequirementsLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div aria-label="Категории требований" className={`grid gap-4 ${layout === 'columns' ? 'xl:grid-cols-3' : 'grid-cols-1'}`}>
        {REQUIREMENT_COLUMNS.map(([key, title, subtitle, color]) => <section key={key} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
          <div className="flex items-start justify-between gap-3 mb-2"><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{requirements[key].length}</span></div>
          <div className="divide-y divide-slate-200 mt-4">
            {requirements[key].map((item) => <EditableRequirementCard key={item.id} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} onDraftChange={(dirty) => setDraftDirty(`${key}:${item.id}`, dirty)} />)}
            {!requirements[key].length && <p className="py-6 text-sm text-slate-400">Нет сформированных требований</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><AddRequirementForm categoryLabel={title} onAdd={(text) => addRequirement(key, text)} onDraftChange={(dirty) => setDraftDirty(`${key}:new`, dirty)} /></div>
        </section>)}
      </div>
    </div>
  );
}

function ApplicabilityBars({ value }) {
  const numericValue = Number(value);
  const normalizedValue = Number.isFinite(numericValue) ? Math.min(100, Math.max(0, numericValue)) : 50;
  const bars = 5;
  const filled = Math.round((normalizedValue / 100) * bars);

  return (
    <div
      role="meter"
      aria-label="Применимость"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow={normalizedValue}
      aria-valuetext={`Применимость ${normalizedValue}%`}
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
    .filter((enhancement) => enhancement && typeof enhancement.text === 'string' && enhancement.text.trim())
    .map((enhancement) => ({
      ...enhancement,
      targetType: TARGET_TYPE_LABELS[enhancement.targetType] ? enhancement.targetType : 'functional',
      text: enhancement.text.trim(),
    }));
  if (structured.length) return structured;
  const text = [insight.title, insight.summary]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join('\n\n');
  return text ? [{ targetType: inferTargetTypeFromInsightCategory(insight.category), text }] : [];
}

function InsightEnhancementDecisionRow({ enhancement, decision, onDecision }) {
  const [open, setOpen] = useState(false);
  const type = enhancement.targetType || 'functional';
  const label = TARGET_TYPE_LABELS[type] || TARGET_TYPE_LABELS.functional;
  const accepted = decision === 'accepted';
  const rejected = decision === 'rejected';

  return (
    <div className={`rounded-lg border overflow-hidden transition-colors ${accepted ? 'border-emerald-300 bg-emerald-50/60' : rejected ? 'border-slate-300 bg-slate-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-stretch min-h-[2.5rem]">
        <button
          type="button"
          aria-label={`Принять улучшение: ${enhancement.text}`}
          aria-pressed={accepted}
          onClick={() => onDecision('accepted')}
          title={accepted ? 'Улучшение принято' : 'Принять сразу'}
          className="flex items-center justify-center px-3 border-r border-gray-100 hover:bg-gray-50 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500"
        >
          {accepted ? <Check className="w-4 h-4 text-emerald-600" /> : <Plus className={`w-4 h-4 ${TARGET_TYPE_ICON_COLORS[type] || TARGET_TYPE_ICON_COLORS.functional}`} />}
        </button>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? 'Скрыть' : 'Показать'} предложение: ${label}`}
          onClick={() => setOpen((current) => !current)}
          className="flex-1 min-w-0 px-3 py-2 flex items-center gap-2 text-left text-sm hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
        >
          <span className="font-medium text-gray-800 truncate flex-1 min-w-0">{label}</span>
          {accepted && <span className="text-[11px] font-semibold text-emerald-700">Принято</span>}
          {rejected && <span className="text-[11px] font-semibold text-slate-500">Отклонено</span>}
          {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
        </button>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-3 border-t border-gray-100">
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{enhancement.text}</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button
              type="button"
              aria-label={`Подтвердить принятие улучшения: ${enhancement.text}`}
              aria-pressed={accepted}
              onClick={() => onDecision('accepted')}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${accepted ? 'border-emerald-600 bg-emerald-600 text-white' : TARGET_TYPE_COLORS[type] || TARGET_TYPE_COLORS.functional}`}
            >
              Принять
            </button>
            <button
              type="button"
              aria-label={`Отклонить улучшение: ${enhancement.text}`}
              aria-pressed={rejected}
              onClick={() => onDecision('rejected')}
              className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-colors ${rejected ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              Отклонить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceRequirementsSnapshot({ requirements, onBack }) {
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
      <div role="region" aria-label="Требования, переданные в AI-исследование" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REQUIREMENT_COLUMNS.map(([type, title, subtitle, color]) => {
          const items = requirements?.[type] || [];
          return <section key={type} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
            <div className="flex items-start justify-between gap-3 mb-2"><div><h3 className="text-base font-bold text-slate-900">{title}</h3><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{items.length}</span></div>
            <div className="divide-y divide-slate-200 mt-4">
              {items.map((item) => <EditableRequirementCard key={item.id} requirement={item} readOnly />)}
              {!items.length && <p className="py-6 text-sm text-slate-400">Нет сформированных требований</p>}
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

function OriginalBusinessContext({ value, loading = false, editable = false, children }) {
  const context = value?.trim();
  return (
    <details className="group border-t border-slate-200">
      <summary aria-label="Исходный бизнес-контекст" className="list-none cursor-pointer px-5 md:px-6 py-3.5 flex items-center justify-between gap-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
        <span className="min-w-0">
          <span className="font-semibold text-slate-700">Исходная бизнес-задача</span>
          <span className="block text-xs text-slate-500 truncate mt-0.5 max-w-3xl">{loading ? 'Загружаем исходный контекст…' : context || 'Исходный контекст недоступен'}</span>
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

function FinalRequirementsEditor({ latestVersion, onSave, onShowInsights, onShowSource, onShowContext, onStartResearch, onDirtyChange, busy, researchBusy = false, researchSkipped = false }) {
  const [requirements, setRequirements] = useState(() => latestVersion?.requirements || { business: [], functional: [], nonfunctional: [] });
  const [dirtyDrafts, setDirtyDrafts] = useState(() => new Set());
  const [layout, setLayout] = useRequirementsLayout();
  const hasUnsavedChanges = dirtyDrafts.size > 0 || JSON.stringify(requirements) !== JSON.stringify(latestVersion?.requirements || {});

  function setDraftDirty(key, dirty) {
    setDirtyDrafts((current) => { const next = new Set(current); if (dirty) next.add(key); else next.delete(key); return next; });
  }

  useEffect(() => onDirtyChange?.(hasUnsavedChanges), [hasUnsavedChanges, onDirtyChange]);

  function editRequirement(type, id, text) {
    setRequirements((current) => ({ ...current, [type]: current[type].map((item) => item.id === id ? { ...item, text } : item) }));
  }

  function deleteRequirement(type, id) {
    setRequirements((current) => ({ ...current, [type]: current[type].filter((item) => item.id !== id) }));
  }

  function addRequirement(type, text) {
    const prefix = REQUIREMENT_COLUMNS.find(([key]) => key === type)?.[4] || 'REQ';
    setRequirements((current) => {
      const number = current[type].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      return { ...current, [type]: [...current[type], { id: `${prefix}-${number}`, text }] };
    });
  }

  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h1 className="text-xl font-bold text-slate-900">Финальная версия требований</h1></div>
            <p className="text-sm font-semibold text-emerald-700 mt-2">Сохранено · {new Date(latestVersion.createdAt).toLocaleString()}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {onShowSource && onShowContext && <SourceDataMenu onShowContext={onShowContext} onShowRequirements={onShowSource} />}
            {onShowInsights && <button onClick={onShowInsights} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />К результатам AI-исследования</button>}
            {researchSkipped && onStartResearch && <button disabled={busy || researchBusy} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="px-4 py-2 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:bg-slate-100 disabled:text-slate-400 flex items-center gap-2">{researchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Добавить AI-исследование</button>}
          </div>
        </div>
      </div>

      {hasUnsavedChanges && <div className="sticky top-16 z-30 -mx-4 px-4 py-3 bg-gray-50/95 backdrop-blur border-y border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${hasUnsavedChanges ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{hasUnsavedChanges ? <Pencil className="w-4 h-4" /> : <Check className="w-4 h-4" />}</span><div><p className="font-semibold text-slate-900">{hasUnsavedChanges ? 'Есть несохранённые изменения' : 'Изменения сохранены'}</p><p className="text-xs text-slate-500 mt-0.5">Редакция от {new Date(latestVersion.createdAt).toLocaleString()}</p></div></div>
        <button disabled={busy} onClick={() => onSave({ requirements, baseVersionId: latestVersion.versionId, decisions: latestVersion.decisions || {} })} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Сохранить изменения</button>
      </div>}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-bold text-slate-900">Категории требований</h2>
        <RequirementsLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div aria-label="Финальные требования по категориям" className={`grid gap-4 ${layout === 'columns' ? 'xl:grid-cols-3' : 'grid-cols-1'}`}>
        {REQUIREMENT_COLUMNS.map(([key, title, subtitle, color]) => <section key={key} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
          <div className="flex items-start justify-between gap-3 mb-2"><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{requirements[key].length}</span></div>
          <div className="divide-y divide-slate-200 mt-4">
            {requirements[key].map((item) => <EditableRequirementCard key={item.id} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} onDraftChange={(dirty) => setDraftDirty(`${key}:${item.id}`, dirty)} />)}
            {!requirements[key].length && <p className="py-6 text-sm text-slate-400">Нет сформированных требований</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><AddRequirementForm categoryLabel={title} onAdd={(text) => addRequirement(key, text)} onDraftChange={(dirty) => setDraftDirty(`${key}:new`, dirty)} /></div>
        </section>)}
      </div>
    </section>
  );
}

function RequirementsInsightsResult({ value, latestVersion, businessContext, businessContextLoading, onSaveFinal, onDirtyChange, busy }) {
  const insights = Array.isArray(value.insights) ? value.insights : [];
  const enhancements = insights.flatMap((insight) => displayEnhancementsForInsight(insight).map((enhancement, index) => ({ ...enhancement, key: `${insight.id}:${index}`, insightTitle: insight.title })));
  const savedAcceptedKeys = Array.isArray(latestVersion?.decisions?.acceptedEnhancementKeys) ? latestVersion.decisions.acceptedEnhancementKeys : [];
  const savedRejectedKeys = Array.isArray(latestVersion?.decisions?.rejectedEnhancementKeys) ? latestVersion.decisions.rejectedEnhancementKeys : [];
  const [activeFilter, setActiveFilter] = useState('all');
  const [decisions, setDecisions] = useState(() => Object.fromEntries([
    ...savedAcceptedKeys.map((key) => [key, 'accepted']),
    ...savedRejectedKeys.map((key) => [key, 'rejected']),
  ]));
  const [activeView, setActiveView] = useState(latestVersion?.versionId ? 'final' : 'insights');
  const visible = activeFilter === 'all' ? insights : insights.filter((item) => item.category === activeFilter);
  const hasDecisionChanges = Object.keys(decisions).some((key) => decisions[key] !== (savedAcceptedKeys.includes(key) ? 'accepted' : savedRejectedKeys.includes(key) ? 'rejected' : undefined));

  useEffect(() => {
    if (activeView === 'insights') onDirtyChange?.(hasDecisionChanges);
    else if (activeView === 'source' || activeView === 'context') onDirtyChange?.(false);
  }, [activeView, hasDecisionChanges, onDirtyChange]);

  function finalRequirements() {
    const base = latestVersion?.requirements || value.baseRequirements || { business: [], functional: [], nonfunctional: [] };
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

  if (activeView === 'source') {
    return <SourceRequirementsSnapshot requirements={value.baseRequirements} onBack={() => setActiveView(latestVersion?.versionId ? 'final' : 'insights')} />;
  }

  if (activeView === 'context') {
    return <SourceBusinessContextSnapshot value={businessContext} loading={businessContextLoading} onBack={() => setActiveView(latestVersion?.versionId ? 'final' : 'insights')} />;
  }

  if (activeView === 'final' && latestVersion?.versionId) {
    return <FinalRequirementsEditor latestVersion={latestVersion} onSave={onSaveFinal} onShowInsights={() => setActiveView('insights')} onShowSource={() => setActiveView('source')} onShowContext={() => setActiveView('context')} onDirtyChange={onDirtyChange} busy={busy} />;
  }

  const acceptedKeys = enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key);
  const rejectedKeys = enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key);
  const sameKeys = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const finalVersionSaved = Boolean(latestVersion?.versionId) && sameKeys(acceptedKeys, savedAcceptedKeys) && sameKeys(rejectedKeys, savedRejectedKeys);
  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /><h1 className="text-xl font-bold text-gray-900">Результаты AI-исследования</h1></div><p className="text-sm text-gray-500 mt-2">Выберите полезные улучшения для финальной версии требований.</p></div><SourceDataMenu onShowContext={() => setActiveView('context')} onShowRequirements={() => setActiveView('source')} /></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setActiveFilter('all')} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Все результаты · {insights.length}</button>{Object.entries(INSIGHT_CATEGORY_META).map(([key, meta]) => { const count = insights.filter((item) => item.category === key).length; return count ? <button key={key} onClick={() => setActiveFilter(key)} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === key ? meta.active : 'bg-white border border-gray-200 text-gray-600'}`}>{meta.label} · {count}</button> : null; })}</div>
      <div role="region" aria-label="Карточки результатов AI-исследования" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {visible.map((insight) => {
          const meta = INSIGHT_CATEGORY_META[insight.category] || INSIGHT_CATEGORY_META.trends;
          const CategoryIcon = meta.icon;
          const insightEnhancements = displayEnhancementsForInsight(insight);
          const relatedTo = Array.isArray(insight.relatedTo) ? insight.relatedTo : [];
          const sourceTypes = Array.isArray(insight.source_types) ? insight.source_types : [];
          const proposalLabel = `${insightEnhancements.length} ${insightEnhancements.length === 1 ? 'предложение' : insightEnhancements.length > 1 && insightEnhancements.length < 5 ? 'предложения' : 'предложений'}`;
          return <article key={insight.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 min-w-0"><CategoryIcon data-testid={`insight-category-icon-${insight.category}`} aria-hidden="true" className="w-4 h-4 text-gray-400 shrink-0" /><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span></span><ApplicabilityBars value={insight.applicability ?? 50} /></div>
            <h3 className="font-bold text-gray-900 mt-3">{insight.title}</h3>
            <p className="text-sm text-gray-500 mt-2 leading-relaxed">{insight.summary}</p>
            <details className="mt-3 group">
              <summary className="list-none text-sm font-semibold text-indigo-600 hover:text-indigo-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded flex items-center gap-1"><ChevronDown aria-hidden="true" className="w-3.5 h-3.5 group-open:hidden" /><ChevronUp aria-hidden="true" className="w-3.5 h-3.5 hidden group-open:block" /><span className="group-open:hidden">Подробнее{insightEnhancements.length ? ` · ${proposalLabel}` : ''}</span><span className="hidden group-open:inline">Свернуть</span></summary>
              <div className="hidden group-open:block mt-3 pt-3 border-t border-gray-100">
                {relatedTo.length > 0 && <div data-testid={`insight-relations-${insight.id}`} className="flex items-center gap-1.5 flex-wrap"><Link2 aria-hidden="true" className="w-3.5 h-3.5 text-gray-400 shrink-0" />{relatedTo.map((id) => <span key={id} className="text-xs font-mono font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{id}</span>)}</div>}
                {insight.detail && <p className="text-sm text-gray-600 leading-relaxed mt-3">{insight.detail}</p>}
                {sourceTypes.length > 0 && <div className="flex items-center gap-1.5 flex-wrap mt-3"><ExternalLink aria-hidden="true" className="w-3 h-3 text-gray-400 shrink-0" />{sourceTypes.map((source) => <span key={source} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{SOURCE_TYPE_LABELS[source] || source}</span>)}</div>}
                {insightEnhancements.length > 0 && <div className="border-t border-gray-100 mt-4 pt-3 space-y-2">{insightEnhancements.map((enhancement, index) => { const key = `${insight.id}:${index}`; return <InsightEnhancementDecisionRow key={key} enhancement={enhancement} decision={decisions[key]} onDecision={(decision) => setDecisions((current) => ({ ...current, [key]: decision }))} />; })}</div>}
              </div>
            </details>
          </article>;
        })}
      </div>
      <div className="sticky bottom-3 bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap"><p className="font-semibold text-gray-900">Выбрано улучшений: {acceptedKeys.length}</p><button disabled={busy} onClick={() => finalVersionSaved ? setActiveView('final') : onSaveFinal({ requirements: finalRequirements(), baseVersionId: latestVersion?.versionId || value.inputRequirementsVersionId, decisions: { acceptedEnhancementKeys: acceptedKeys, rejectedEnhancementKeys: rejectedKeys } })} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300">{finalVersionSaved ? 'К финальным требованиям' : latestVersion ? 'Сохранить новую редакцию' : 'Сохранить финальную версию'}</button></div>
    </section>
  );
}

function ResultView({ content, latestVersion, businessContext, businessContextLoading, onSaveRequirements, onStartResearch, onSaveFinal, onDirtyChange, busy, researchBusy = false }) {
  const value = safeJson(content);
  if (!value) return <Markdown>{content}</Markdown>;
  if (value.mode === 'REQUIREMENTS_INSIGHTS') return <RequirementsInsightsResult value={value} latestVersion={latestVersion} businessContext={businessContext} businessContextLoading={businessContextLoading} onSaveFinal={onSaveFinal} onDirtyChange={onDirtyChange} busy={busy} />;
  if (value.mode === 'DECOMPOSITION' || Array.isArray(value.decomposition)) {
    if (latestVersion?.decisions?.skippedResearch) return <FinalRequirementsEditor latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} researchSkipped />;
    return <DecompositionResult value={value} latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} />;
  }
  return <p className="text-sm text-slate-500">Формат результата не поддерживается текущей версией интерфейса.</p>;
}

function ModelControls({ models, model, setModel, temperature, setTemperature }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Модель</span>
        <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100">
          {models.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Температура</span>
        <input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
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
  return <ol aria-label="Этапы выполнения задачи" className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
    {EXECUTION_PHASES.map((label, index) => {
      const completed = index < activeIndex;
      const active = index === activeIndex;
      const state = completed ? 'завершено' : active ? 'выполняется' : 'ожидает';
      return <li key={label} aria-current={active ? 'step' : undefined} aria-label={`${label}: ${state}`} className={`rounded-xl border px-3 py-2.5 flex items-center gap-2 ${active ? 'border-indigo-200 bg-indigo-50/80' : completed ? 'border-emerald-100 bg-emerald-50/60' : 'border-slate-100 bg-slate-50/70'}`}>
        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${active ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 animate-pulse' : completed ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
          {completed ? <Check className="w-3 h-3" /> : active ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
        </span>
        <span className={`text-xs font-semibold ${active ? 'text-indigo-800' : completed ? 'text-emerald-800' : 'text-slate-400'}`}>{label}</span>
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
  const visualProgress = visualProgressForJob(job, now);
  const progress = Math.floor(visualProgress);
  const estimated = isModelPhase(job) && job.status === 'RUNNING' && progress > Number(job.progress || 0);
  const focusMessage = focusMessageForJob(job, now);
  const title = job.type === 'DECOMPOSITION'
    ? 'Декомпозиция требований'
    : job.mode === 'REQUIREMENTS_INSIGHTS' ? 'AI-исследование требований' : MODE_LABELS[job.mode] || 'AI-задача';
  const TitleTag = job.type === 'DECOMPOSITION' || job.mode === 'REQUIREMENTS_INSIGHTS' ? 'h2' : 'p';
  const durationHint = job.type === 'DECOMPOSITION' ? 'обычно 1–3 минуты' : job.mode === 'REQUIREMENTS_INSIGHTS' ? 'обычно 3–6 минут' : 'обычно несколько минут';
  const takingLonger = elapsedMs >= (job.type === 'DECOMPOSITION' ? 3 : 6) * 60_000;
  return <section aria-label="Выполнение задачи" className="bg-white rounded-2xl border border-indigo-200 shadow-sm overflow-hidden">
    <div className="p-5 md:p-6">
      <div className="flex items-start justify-between gap-5 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <span className="w-11 h-11 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Loader2 className="w-5 h-5 animate-spin" /></span>
          <div className="min-w-0">
            <TitleTag className="text-lg md:text-xl font-bold text-slate-900">{title}</TitleTag>
            {takingLonger && <p className="text-sm text-slate-500 mt-1">Обработка занимает больше обычного, но задача продолжает выполняться.</p>}
          </div>
        </div>
        <p className="text-sm text-slate-500 shrink-0" aria-label={`Прошло ${formatElapsed(elapsedMs)}, ${durationHint}`}><span className="font-mono font-semibold text-slate-700">{formatElapsed(elapsedMs)}</span> · {durationHint}</p>
      </div>
      {focusMessage && <div role="status" aria-live="polite" className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 flex items-center gap-3 overflow-hidden">
        <span className="flex gap-1 shrink-0" aria-hidden="true"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce" /><span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:150ms]" /><span className="w-1.5 h-1.5 rounded-full bg-indigo-300 animate-bounce [animation-delay:300ms]" /></span>
        <p className="text-sm font-medium text-indigo-900">{focusMessage}</p>
      </div>}
      <ExecutionTimeline job={job} />
      <div className="mt-5">
        <div className="flex items-center justify-between gap-3 mb-2"><span className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">Прогресс{estimated && <span title="Процент — ориентировочная оценка. Переходы между этапами подтверждаются сервером." aria-label="Об ориентировочной оценке прогресса" className="inline-flex text-slate-400 cursor-help"><Info className="w-3.5 h-3.5" /></span>}</span><span className="text-xs font-bold text-indigo-700">{progress}%</span></div>
        <div role="progressbar" aria-label="Прогресс выполнения задачи" aria-valuemin="0" aria-valuemax="100" aria-valuenow={progress} aria-valuetext={estimated ? `Оценка ${progress} процентов, текущий этап подтверждён сервером` : `${progress} процентов подтверждено сервером`} className="relative h-3 rounded-full bg-slate-100 overflow-hidden">
          <span className="block h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-[width] duration-1000 ease-out" style={{ width: `${visualProgress}%` }} />
          <span className="reqai-progress-shimmer absolute inset-y-0 bg-gradient-to-r from-transparent via-white/75 to-transparent" aria-hidden="true" />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <div className="flex gap-2 flex-wrap">
          <button onClick={onBackground} className="px-4 py-2.5 rounded-lg border border-indigo-200 bg-white text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Продолжить в фоне</button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:text-red-600 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Отменить</button>
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
  const progress = Math.floor(visualProgressForJob(job, now));
  return <button aria-label={`Фоновая задача: ${job.message || STATUS_LABELS[job.status]}`} onClick={onOpen} className="px-3 py-2 rounded-lg text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /><span className="hidden lg:inline">Задача в фоне</span><span>{progress}%</span></button>;
}

function JobStateCard({ job, onCancel }) {
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
            <p className="text-xs text-slate-500 mt-0.5">{active ? 'Результат появится на странице автоматически.' : failed ? 'Попробуйте запустить задачу ещё раз.' : 'Можно сформировать требования повторно.'}</p>
          </div>
        </div>
        {active && <button onClick={onCancel} className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-600 hover:border-red-300 hover:text-red-600">Отменить</button>}
      </div>
    </section>
  );
}

function HistoryDrawer({ open, onClose, history, filter, setFilter, activeJobId, onSelect, cursor, onLoadMore }) {
  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, open]);
  if (!open) return null;
  const filtered = history.filter((item) => filter === 'all' || (filter === 'decomposition' ? item.type === 'DECOMPOSITION' : item.type === 'RESEARCH'));
  return <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="История задач">
    <button aria-label="Закрыть историю" onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" />
    <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-900">История задач</h2><p className="text-xs text-slate-500 mt-0.5">Откройте ранее сохранённый результат</p></div><button aria-label="Закрыть" onClick={onClose} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5" /></button></div>
      <div className="px-5 py-3 border-b border-slate-100 flex gap-2" role="group" aria-label="Фильтр истории">{[['all', 'Все'], ['decomposition', 'Декомпозиция'], ['research', 'Исследования']].map(([key, label]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${filter === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{label}</button>)}</div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">{filtered.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">В этой категории задач пока нет.</p> : filtered.map((item) => { const status = primaryStatus(item); const label = RETIRED_MODES.has(item.mode) ? 'Архивная задача' : MODE_LABELS[item.mode] || TYPE_LABELS[item.type] || 'Задача'; return <button key={item.jobId} aria-current={activeJobId === item.jobId ? 'true' : undefined} onClick={() => onSelect(item.jobId)} className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${activeJobId === item.jobId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 truncate">{label}</p><span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${status.tone}`}>{status.label}</span></div><time className="text-xs text-slate-400 whitespace-nowrap">{new Date(item.createdAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div></button>; })}</div>
      {cursor && <div className="p-4 border-t border-slate-200"><button onClick={onLoadMore} className="w-full px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-semibold hover:bg-indigo-50">Загрузить ещё</button></div>}
    </aside>
  </div>;
}

function DebugPanel({ open, onClose, jobId, observations, refreshKey, triggerRef, onDownload }) {
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
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {trace && <section aria-label="Сводка трассировки" className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[['Статус', trace.status], ['Этап', trace.currentStep || '—'], ['Создана', trace.createdAt ? new Date(trace.createdAt).toLocaleString() : '—'], ['Длительность', formatDuration(trace.durationMs)]].map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-3"><dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt><dd className="text-xs font-semibold text-slate-700 mt-1 break-words">{value}</dd></div>)}
        </section>}
        <div className="flex items-center justify-between gap-3 mb-3"><h3 className="font-semibold text-slate-900">Timeline</h3><div className="flex gap-2">{onDownload && <button onClick={onDownload} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"><Download className="inline w-3.5 h-3.5 mr-1" />JSON</button>}<button onClick={() => load()} disabled={loading} className="px-3 py-1.5 rounded-lg border border-indigo-200 text-xs font-semibold text-indigo-700 disabled:opacity-50">Обновить</button></div></div>
        {loading && !trace ? <div className="py-12 text-center text-sm text-slate-500"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Загрузка трассировки…</div> : entries.length === 0 ? <p className="py-12 text-center text-sm text-slate-400">События пока не записаны.</p> : <ol className="space-y-3" aria-label="Timeline выполнения задачи">{entries.map((entry) => {
          const isOpen = expanded.has(entry.id); const detail = details[entry.id];
          return <li key={entry.id} className="relative pl-5 before:absolute before:left-[5px] before:top-4 before:bottom-[-14px] before:w-px before:bg-slate-200 last:before:hidden"><span className="absolute left-0 top-4 w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-white" /><div className="rounded-xl border border-slate-200 bg-white overflow-hidden"><button aria-expanded={isOpen} onClick={() => toggle(entry)} className="w-full p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"><div className="flex justify-between gap-3"><div className="min-w-0"><div className="flex gap-2 items-center flex-wrap"><span className="font-semibold text-sm text-slate-800">{entry.name}</span><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${TRACE_TONES[entry.status] || TRACE_TONES.INFO}`}>{entry.status}</span>{entry.source === 'CLIENT_LOCAL' && <span className="text-[10px] text-violet-700 bg-violet-50 rounded-full px-2 py-0.5">текущая вкладка</span>}</div><p className="text-xs text-slate-400 mt-1">{entry.category}{entry.stepId ? ` · ${entry.stepId}` : ''}</p></div><div className="text-right shrink-0"><time className="text-[11px] text-slate-400">{entry.startedAt ? new Date(entry.startedAt).toLocaleTimeString() : '—'}</time><p className="text-[11px] text-slate-500 mt-1">{formatDuration(entry.durationMs)}</p></div></div></button>{isOpen && <div className="border-t border-slate-100 bg-slate-50 p-3 space-y-2"><p className="text-xs text-slate-500">Детали: {entry.detail?.state === 'NOT_RECORDED' ? 'не записаны' : entry.detail?.state === 'EXPIRED' ? 'срок хранения истёк' : entry.detail?.state === 'REDACTED' ? 'скрыты политикой доступа' : entry.detail?.state || '—'}</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-3 text-[11px] text-slate-100">{JSON.stringify(detail?.content ?? detail ?? entry.metadata ?? {}, null, 2)}</pre></div>}</div></li>;
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
      <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Архивная задача · только чтение</p><h1 className="text-2xl font-bold text-slate-900 mt-1">Результат старой версии</h1><p className="text-sm text-slate-500 mt-2">Этот сценарий больше нельзя запускать или повторять. Сохранённые данные и диагностика остаются доступны.</p></div>
      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.tone}`}>{status.label}</span>
    </div>
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mt-6">
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3"><dt className="text-xs text-slate-400">Режим</dt><dd className="font-mono text-xs text-slate-700 mt-1 break-all">{job.mode || 'UNKNOWN'}</dd></div>
      {timestamps.map(([label, value]) => <div key={label} className="rounded-xl bg-slate-50 border border-slate-200 p-3"><dt className="text-xs text-slate-400">{label}</dt><dd className="text-xs font-semibold text-slate-700 mt-1">{new Date(value).toLocaleString()}</dd></div>)}
    </dl>
    {(result?.summary || job.message) && <div className="mt-5 rounded-xl border border-slate-200 p-4"><h2 className="text-sm font-semibold text-slate-800">Сводка</h2><p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{result?.summary || job.message}</p></div>}
    {result?.outcome === 'PARTIAL' && <div className="mt-4 flex gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">Архивный результат завершён частично.</p></div>}
    {onDownload && <button onClick={onDownload} className="mt-5 px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-semibold hover:bg-indigo-50"><Download className="inline w-4 h-4 mr-2" />Скачать артефакт</button>}
  </section>;
}

export default function AsyncJobWorkspace() {
  const [routeJobId, setRouteJobId] = useState(() => jobIdFromPath());
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [requirements, setRequirements] = useState('');
  const [businessContextLoading, setBusinessContextLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [model, setModel] = useState('glm-5.3');
  const [temperature, setTemperature] = useState(0.2);
  const [upload, setUpload] = useState(0);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [resultContent, setResultContent] = useState('');
  const [history, setHistory] = useState([]);
  const [backgroundJob, setBackgroundJob] = useState(null);
  const [completionNotice, setCompletionNotice] = useState(null);
  const [requirementsVersions, setRequirementsVersions] = useState([]);
  const [remoteRequirementsVersions, setRemoteRequirementsVersions] = useState(null);
  const editorDirtyRef = useRef(false);
  const loadedResultJobIdRef = useRef(null);
  const [versionBusy, setVersionBusy] = useState(false);
  const linkedResearchSubmissionRef = useRef(false);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
  const linkedResearchBusy = versionBusy || activeLinkedResearch;
  const linkedResearchComplete = linkedResearch && job?.status === 'SUCCEEDED';
  const finalVersionReady = linkedResearchComplete && requirementsVersions.some((item) => item.sourceJobId === result?.jobId);
  const directFinalReady = Boolean(decompositionReady && requirementsVersions[0]?.sourceJobId === result?.jobId && requirementsVersions[0]?.decisions?.skippedResearch);
  const currentStage = finalVersionReady || directFinalReady ? 4 : linkedResearch ? 3 : decompositionReady ? 2 : 1;
  const completedStage = finalVersionReady || directFinalReady ? 4 : linkedResearchComplete ? 3 : linkedResearch ? 2 : decompositionReady ? 1 : 0;
  const handleEditorDirty = useCallback((dirty) => { editorDirtyRef.current = dirty; }, []);

  const navigate = useCallback((id, { replace = false } = {}) => {
    const path = id ? `/tasks/${encodeURIComponent(id)}` : '/';
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
    routeJobIdRef.current = id || null;
    setRouteJobId(id || null);
  }, []);

  useEffect(() => {
    const onPopState = () => { const id = jobIdFromPath(); routeJobIdRef.current = id; setRouteJobId(id); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  function loadRemoteRequirementsVersion() {
    if (!remoteRequirementsVersions) return;
    editorDirtyRef.current = false;
    setRequirementsVersions(remoteRequirementsVersions);
    setRemoteRequirementsVersions(null);
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
    setResultContent(content);
    setRequirementsVersions(versions);
    setRemoteRequirementsVersions(null);
    loadedResultJobIdRef.current = id;
  }, [loadRequirementsVersions]);

  const refresh = useCallback(async () => {
    const page = await enterpriseApi.listJobs({ limit: 20 });
    setHistory(page.items);
    setCursor(page.nextCursor);
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
        const configured = value.capabilities?.models;
        if (!configured?.length) return;
        setModels(configured);
        setModel(configured[0]);
      }),
    ]).catch((cause) => setError(cause.message));
  }, [refresh]);

  useEffect(() => {
    if (routeJobId || window.location.pathname !== '/') return;
    const legacyId = localStorage.getItem('reqai.activeJob') || localStorage.getItem('reqai.viewedJob');
    localStorage.removeItem('reqai.activeJob'); localStorage.removeItem('reqai.viewedJob');
    if (legacyId) navigate(legacyId, { replace: true });
  }, [navigate, routeJobId]);

  useEffect(() => {
    routeJobIdRef.current = routeJobId;
    setDebugOpen(false); setSseObservations([]); setRouteUnavailable(false); setError('');
    if (!routeJobId) {
      setJob(null); setResult(null); setResultContent(''); setRequirementsVersions([]); setRemoteRequirementsVersions(null);
      setBusinessContextLoading(false);
      loadedResultJobIdRef.current = null;
      return undefined;
    }
    const controller = new AbortController();
    (async () => {
      try {
        const selected = await enterpriseApi.getJob(routeJobId, { signal: controller.signal });
        if (controller.signal.aborted || routeJobIdRef.current !== routeJobId) return;
        setJob(selected);
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
        if (editorDirtyRef.current) setRemoteRequirementsVersions(versions);
        else {
          setRequirementsVersions(versions);
          setRemoteRequirementsVersions(null);
        }
        return;
      }
      if (event.eventType === 'linked-research.created' && event.linkedJobId) {
        navigate(event.linkedJobId);
        return;
      }
      const next = event.job || await enterpriseApi.getJob(jobId);
      if (next.jobId !== jobId) return;
      setJob(next);
      if (TERMINAL.has(next.status)) {
        if (next.status === 'SUCCEEDED' && loadedResultJobIdRef.current !== next.jobId) await loadResult(next.jobId);
        if (event.type !== 'reconcile') await refresh();
      }
    } });
    return () => controller.abort();
  }, [jobId, loadRequirementsVersions, loadResult, navigate, refresh]);

  useEffect(() => {
    if (!backgroundJob?.jobId || TERMINAL.has(backgroundJob.status)) return undefined;
    let stopped = false;
    const reconcile = async () => {
      try {
        const next = await enterpriseApi.getJob(backgroundJob.jobId);
        if (stopped) return;
        setHistory((current) => current.map((item) => item.jobId === next.jobId ? { ...item, ...next } : item));
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

  const options = useMemo(() => ({ mode: 'DECOMPOSITION', model, temperature: Number(temperature) }), [model, temperature]);

  async function submit() {
    const input = file || new Blob([requirements], { type: 'text/plain; charset=utf-8' });
    if (!file && !requirements.trim()) return;
    setBusy(true);
    setError('');
    setUpload(0);
    try {
      const artifact = await enterpriseApi.uploadArtifact(input, setUpload);
      const accepted = await enterpriseApi.createJob({ type: 'DECOMPOSITION', inputArtifactId: artifact.artifactId, options });
      navigate(accepted.jobId);
      await refresh();
    } catch (cause) { setError(`${cause.code || 'ERROR'}: ${cause.message}`); }
    finally { setBusy(false); }
  }

  function load(id) {
    navigate(id);
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
    if (editorDirtyRef.current && !window.confirm('Есть несохранённые изменения. Начать новую задачу и отбросить их?')) return;
    navigate(null);
    setRequirements('');
    setFile(null);
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
  }

  async function saveRequirementsVersion({ requirements: nextRequirements, baseVersionId = null, decisions = {} }) {
    if (!result?.jobId) return null;
    setVersionBusy(true);
    setError('');
    try {
      const saved = await enterpriseApi.saveRequirementsVersion({ sourceJobId: result.jobId, baseVersionId, requirements: nextRequirements, decisions });
      setRequirementsVersions((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
      setRemoteRequirementsVersions(null);
      editorDirtyRef.current = false;
      return saved;
    } catch (cause) {
      setError(`${cause.code || 'ERROR'}: ${cause.message}`);
      return null;
    } finally { setVersionBusy(false); }
  }

  async function startResearchFromDecomposition({ requirementsVersionId }) {
    if (!result?.jobId || !requirementsVersionId || linkedResearchSubmissionRef.current || versionBusy || activeLinkedResearch) return;
    linkedResearchSubmissionRef.current = true;
    setVersionBusy(true);
    setError('');
    try {
      const accepted = await enterpriseApi.researchRequirements(requirementsVersionId, { model, temperature: Number(temperature) });
      navigate(accepted.jobId);
      await refresh();
    } catch (cause) { setError(userFacingError(cause)); }
    finally {
      linkedResearchSubmissionRef.current = false;
      setVersionBusy(false);
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
  const cancelActiveJob = () => enterpriseApi.cancelJob(job.jobId).then(() => enterpriseApi.getJob(job.jobId)).then((next) => setJob(next));

  const commonInput = (
    <>
      <label className="block mb-4">
        <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="Опишите бизнес-задачу..." className="w-full h-32 px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:outline-none focus:ring-indigo-100 resize-none bg-slate-50/50" />
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-indigo-600">
        <FileUp className="w-4 h-4" /><span>{file ? file.name : 'Приложить файл до 100 МБ'}</span>
        <input aria-label="Файл требований" type="file" className="sr-only" onChange={(event) => setFile(event.target.files[0])} />
      </label>
    </>
  );

  const submitButton = (
    <button disabled={!canSubmit || busy || submissionBlocked} onClick={submit} className="w-full sm:w-auto text-white py-3 px-6 rounded-lg font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
      {busy ? <><Loader2 className="w-5 h-5 animate-spin" />Загрузка {Math.round(upload * 100)}%</> : submissionBlocked ? <><Loader2 className="w-5 h-5 animate-spin" />{activeJob ? job.type === 'DECOMPOSITION' ? 'Декомпозиция выполняется…' : 'Исследование выполняется…' : 'Другая задача выполняется…'}</> : <><Sparkles className="w-4 h-4" />Декомпозировать требования</>}
    </button>
  );

  const contextComplete = Boolean(result && !legacyJob && (job?.type === 'DECOMPOSITION' || result.mode === 'DECOMPOSITION'));
  const showReadOnlyBusinessContext = Boolean(activeLinkedResearch || directFinalReady);
  const contextFormBody = <>
    {commonInput}
    <div className="flex justify-end mt-5">
      <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
        {submitButton}
      </div>
    </div>
  </>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center min-h-16 gap-3 sm:gap-6">
            <span className="text-base font-extrabold text-gray-900 tracking-tight mr-auto sm:mr-3">ReqAI</span>
            <button onClick={() => startNewTask()} aria-current="page" className="h-16 px-1 text-sm font-semibold border-b-2 border-indigo-600 text-indigo-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Подготовка требований</button>
            {job && TERMINAL.has(job.status) && <button aria-label="Новая задача" onClick={startNewTask} className="p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="w-4 h-4" /><span className="hidden sm:inline">Новая задача</span></button>}
            {backgroundActive && <BackgroundJobIndicator job={backgroundJob} onOpen={() => load(backgroundJob.jobId)} />}
            <button aria-label="История" onClick={() => setHistoryOpen(true)} className="p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><History className="w-4 h-4" /><span className="hidden sm:inline">История</span></button>
            <AiSettingsDisclosure model={model}><ModelControls models={models} model={model} setModel={setModel} temperature={temperature} setTemperature={setTemperature} /></AiSettingsDisclosure>
            <button ref={debugTriggerRef} aria-label="Debug" title={job ? 'Debug' : 'Debug станет доступен после запуска задачи'} disabled={!job} onClick={() => setDebugOpen(true)} className="ml-auto p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent disabled:cursor-not-allowed flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"><Bug className="w-4 h-4" /></button>
          </div>
        </div>
      </nav>

      {routeUnavailable ? <main className="max-w-3xl mx-auto px-4 py-16"><section className="rounded-2xl border border-red-200 bg-white p-8 text-center"><AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" /><h1 className="text-xl font-bold text-slate-900">Задача недоступна</h1><p className="text-sm text-slate-500 mt-2">Проверьте адрес или права доступа. Другая задача не была открыта автоматически.</p><button onClick={() => navigate(null)} className="mt-5 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold">Создать новую задачу</button></section></main> : legacyJob ? (
        <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
          {progressingJob && <ActiveJobPanel job={job} onCancel={cancelActiveJob} onBackground={continueInBackground} />}
          <JobStateCard job={job} onCancel={cancelActiveJob} />
          <ArchivedLegacyResult job={job} result={result} onDownload={result?.resultArtifactId ? download : null} />
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 py-6">
          {(contextComplete || activeLinkedResearch || (linkedResearch && result)) && <WorkflowStepper currentStage={currentStage} completedStage={completedStage} skippedStages={directFinalReady ? [3] : []} />}
          {showReadOnlyBusinessContext && <section className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden"><OriginalBusinessContext value={requirements} loading={businessContextLoading} /></section>}
          {activeLinkedResearch && !contextComplete ? <div className="mb-5"><ActiveJobPanel job={job} onCancel={cancelActiveJob} onBackground={continueInBackground} /></div> : contextComplete && !directFinalReady ? <section className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden">
            <div className="p-5 md:px-6"><h1 className="text-2xl md:text-3xl font-bold text-slate-900">Проверка требований</h1></div>
            <OriginalBusinessContext value={requirements} loading={businessContextLoading} editable>
              <div>
                <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Изменить бизнес-задачу</h2>
                <p className="text-sm text-slate-500 mb-4">После изменений запустите декомпозицию повторно.</p>
                {contextFormBody}
              </div>
            </OriginalBusinessContext>
          </section> : (linkedResearch && result) || directFinalReady ? null : <>
            <div className="mb-6"><h1 className="text-2xl md:text-3xl font-bold text-gray-900">Подготовка требований</h1></div>
            <WorkflowStepper currentStage={currentStage} completedStage={completedStage} skippedStages={directFinalReady ? [3] : []} />
            <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Сформулируйте бизнес-задачу</h2>
              <p className="text-sm text-slate-500 mb-4">Опишите цель, ограничения и ожидаемый результат обычным языком.</p>
              {contextFormBody}
            </section>
          </>}
          {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap">{error}</div>}
          <div className="space-y-6">
            {remoteRequirementsVersions && <section role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4 flex-wrap"><div><p className="text-sm font-semibold text-amber-900">Доступна новая сохранённая версия</p><p className="text-xs text-amber-700 mt-1">Она создана в другом клиенте. Текущие несохранённые изменения оставлены без изменений.</p></div><button onClick={loadRemoteRequirementsVersion} className="px-4 py-2 rounded-lg border border-amber-300 bg-white text-sm font-semibold text-amber-800 hover:bg-amber-100">Загрузить новую версию</button></section>}
            {progressingJob && !activeLinkedResearch && <ActiveJobPanel job={job} onCancel={cancelActiveJob} onBackground={continueInBackground} />}
            <JobStateCard job={job} onCancel={cancelActiveJob} />
            {result && <ResultPanel result={result} resultContent={resultContent} latestVersion={requirementsVersions[0] || null} businessContext={requirements} businessContextLoading={businessContextLoading} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} onDirtyChange={handleEditorDirty} busy={versionBusy} researchBusy={linkedResearchBusy} />}
          </div>
        </main>
      )}

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} filter={historyFilter} setFilter={setHistoryFilter} activeJobId={jobId} onSelect={load} cursor={cursor} onLoadMore={async () => { const page = await enterpriseApi.listJobs({ limit: 20, cursor }); setHistory((current) => [...current, ...page.items]); setCursor(page.nextCursor); }} />
      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} jobId={jobId} observations={sseObservations} refreshKey={debugRefreshKey} triggerRef={debugTriggerRef} onDownload={result?.resultArtifactId ? download : null} />
      {completionNotice && <section role="status" aria-label="Задача завершена" className="fixed right-5 bottom-5 z-[90] w-[min(24rem,calc(100vw-2.5rem))] rounded-2xl border border-slate-200 bg-white shadow-2xl p-4"><div className="flex items-start gap-3"><span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${completionNotice.status === 'SUCCEEDED' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{completionNotice.status === 'SUCCEEDED' ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}</span><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{completionNotice.status === 'SUCCEEDED' ? 'Задача готова' : STATUS_LABELS[completionNotice.status]}</p><p className="text-sm text-slate-500 mt-0.5">{MODE_LABELS[completionNotice.mode] || TYPE_LABELS[completionNotice.type]}</p><div className="flex gap-2 mt-3"><button onClick={() => { const id = completionNotice.jobId; setCompletionNotice(null); load(id); }} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold">Открыть результат</button><button aria-label="Закрыть уведомление" onClick={() => setCompletionNotice(null)} className="px-3 py-2 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold">Закрыть</button></div></div></div></section>}
    </div>
  );
}

function ResultPanel({ result, resultContent, latestVersion, businessContext, businessContextLoading, onSaveRequirements, onStartResearch, onSaveFinal, onDirtyChange, busy, researchBusy = false }) {
  return (
    <section className="space-y-4">
      <ResultView key={`${result.jobId}:${latestVersion?.versionId || 'base'}`} content={resultContent || result.summary || ''} latestVersion={latestVersion} businessContext={businessContext} businessContextLoading={businessContextLoading} onSaveRequirements={onSaveRequirements} onStartResearch={onStartResearch} onSaveFinal={onSaveFinal} onDirtyChange={onDirtyChange} busy={busy} researchBusy={researchBusy} />
    </section>
  );
}
