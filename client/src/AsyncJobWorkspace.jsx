import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns3,
  Download,
  ExternalLink,
  FileUp,
  History,
  Loader2,
  Link2,
  List,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  TrendingUp,
  Trash2,
  Users,
  Wrench,
  X,
  XCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { enterpriseApi, subscribeJobEvents } from './api/enterprise-api.js';

const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const RESEARCH_MODES = [
  ['STANDARD_RESEARCH', 'Исследование'],
  ['MODEL_COMPARE', 'Сравнение (модели, температура)'],
  ['AGENT_COMPARE', 'Агентное сравнение'],
  ['AGENT_RESEARCH', 'Агентное исследование'],
  ['PROMPT_TEST', 'Тестирование промптов'],
];
const MODE_LABELS = {
  DECOMPOSITION: 'Подготовка требований',
  DECOMPOSITION_WITH_INSIGHTS: 'Подготовка требований',
  REQUIREMENTS_INSIGHTS: 'AI-исследование требований',
  ...Object.fromEntries(RESEARCH_MODES),
};
const TYPE_LABELS = { DECOMPOSITION: 'Подготовка требований', RESEARCH: 'Исследование' };
const STATUS_LABELS = { ACCEPTED: 'Ожидает запуска', QUEUED: 'В очереди', RUNNING: 'Выполняется', RETRY_WAIT: 'Повторяем этап', SUCCEEDED: 'Готово', FAILED: 'Не выполнено', CANCEL_REQUESTED: 'Отменяется', CANCELLED: 'Отменено' };
const OUTCOME_LABELS = { COMPLETE: 'Готово', PARTIAL: 'Готово частично', FAILED: 'Не выполнено' };
const STATUS_TONES = { ACCEPTED: 'bg-slate-100 text-slate-600', QUEUED: 'bg-slate-100 text-slate-600', RUNNING: 'bg-indigo-100 text-indigo-700', RETRY_WAIT: 'bg-amber-100 text-amber-700', SUCCEEDED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700', CANCEL_REQUESTED: 'bg-amber-100 text-amber-700', CANCELLED: 'bg-slate-100 text-slate-600' };
const DEFAULT_MODELS = ['glm-5.2', 'glm-5-turbo', 'glm-4.7', 'glm-4.7-flash'];
const RESEARCH_KIND_LABELS = {
  trends: 'Тренды',
  competitors: 'Конкуренты',
  practices: 'Лучшие практики',
};
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

function workspaceForMode(mode, type) {
  return type === 'DECOMPOSITION' || ['DECOMPOSITION', 'DECOMPOSITION_WITH_INSIGHTS', 'REQUIREMENTS_INSIGHTS'].includes(mode) ? 'requirements' : 'tools';
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

function WorkflowStepper({ currentStage = 1, completedStage = 0, skippedStages = [] }) {
  const stages = [
    ['Контекст', 'Опишите бизнес-задачу'],
    ['Требования', 'Проверьте декомпозицию'],
    ['AI-исследование', 'Необязательный шаг'],
    ['Финальная версия', 'Сохраните результат'],
  ];
  const current = stages[currentStage - 1] || stages[0];
  return (
    <section aria-label="Прогресс подготовки требований" className="bg-white rounded-2xl border border-slate-200 px-4 py-4 md:px-5 mb-6">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-600">Этап {currentStage} из {stages.length}</p>
          <p className="text-sm font-semibold text-slate-800 mt-0.5 truncate">{current[0]} · <span className="font-normal text-slate-500">{current[1]}</span></p>
        </div>
        <span className="text-xs font-semibold text-slate-400 shrink-0">{currentStage * 25}%</span>
      </div>
      <div role="progressbar" aria-label="Общий прогресс" aria-valuemin="0" aria-valuemax="4" aria-valuenow={currentStage} className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-4">
        <span className="block h-full rounded-full bg-indigo-600 transition-[width]" style={{ width: `${currentStage * 25}%` }} />
      </div>
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
  return <details className="rounded-xl border border-slate-200 bg-slate-50/70 group">
    <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-xl">
      <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Settings2 className="w-4 h-4 text-indigo-500" />Настройки AI</span>
      <span className="text-xs text-slate-400">{model} · рекомендуется</span>
    </summary>
    <div className="px-4 pb-4 pt-1 border-t border-slate-200">{children}</div>
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

function EditableRequirementCard({ requirement, onEdit, onDelete, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(requirement.text);

  function save() {
    if (text.trim()) onEdit(text.trim());
    setEditing(false);
  }

  function cancel() {
    setText(requirement.text);
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
          <textarea aria-label={`Текст требования ${requirement.id}`} value={text} onChange={(event) => setText(event.target.value)} rows={3} autoFocus className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none" />
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

function AddRequirementForm({ onAdd, categoryLabel }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  function add() {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
    setOpen(false);
  }
  if (!open) return <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><Plus className="w-4 h-4" />Добавить требование</button>;
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-700 mb-2">Новое требование · {categoryLabel}</p>
      <textarea aria-label={`Новое требование: ${categoryLabel}`} value={text} onChange={(event) => setText(event.target.value)} rows={3} autoFocus placeholder="Введите формулировку требования..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none bg-white" />
      <div className="mt-2 flex gap-2">
        <button onClick={add} disabled={!text.trim()} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-slate-300">Добавить</button>
        <button onClick={() => { setText(''); setOpen(false); }} className="px-4 py-2 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-200">Отмена</button>
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

function DecompositionResult({ value, latestVersion, onSave, onStartResearch, busy, researchBusy }) {
  const [requirements, setRequirements] = useState(() => latestVersion?.requirements?.business && latestVersion?.requirements?.functional && latestVersion?.requirements?.nonfunctional ? latestVersion.requirements : collectRequirements(value));
  const [layout, setLayout] = useRequirementsLayout();
  const hasSavedVersion = Boolean(latestVersion?.versionId);
  const hasUnsavedChanges = !hasSavedVersion || JSON.stringify(requirements) !== JSON.stringify(latestVersion.requirements);

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
          <div>
            <p className="font-semibold text-slate-900">{hasSavedVersion && !hasUnsavedChanges ? 'Изменения сохранены' : 'Проверенная версия'}</p>
            <p id="research-save-status" className={`text-sm mt-0.5 ${hasSavedVersion && !hasUnsavedChanges ? 'text-emerald-700' : 'text-slate-500'}`}>{!hasSavedVersion ? 'Сохраните требования перед AI-исследованием.' : hasUnsavedChanges ? 'Есть несохранённые изменения.' : `Сохранена ${new Date(latestVersion.createdAt).toLocaleString()}`}</p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button disabled={busy || !hasUnsavedChanges} onClick={() => onSave({ requirements, baseVersionId: latestVersion?.versionId || null })} className={`w-full sm:w-auto px-5 py-2.5 text-sm font-semibold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${hasUnsavedChanges ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'border border-slate-200 text-slate-400 bg-white'}`}>{hasSavedVersion ? 'Сохранить изменения' : 'Сохранить проверенную версию'}</button>
          <button aria-label={researchBusy ? 'AI-исследование выполняется…' : 'Улучшить требования с помощью AI'} aria-describedby="research-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : researchBusy ? 'Дождитесь завершения текущего AI-исследования' : 'Необязательный следующий шаг'} disabled={busy || researchBusy || !hasSavedVersion || hasUnsavedChanges} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="w-full sm:w-auto px-5 py-2.5 border border-indigo-200 bg-white text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400 disabled:bg-slate-100 flex items-center justify-center gap-2">{researchBusy ? <><Loader2 className="w-4 h-4 animate-spin" />AI-исследование выполняется…</> : <><Sparkles className="w-4 h-4" />Улучшить с помощью AI <span className="font-normal text-slate-400">· необязательно</span></>}</button>
          <button aria-describedby="research-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : 'Пропустить необязательное AI-исследование'} disabled={busy || researchBusy || !hasSavedVersion || hasUnsavedChanges} onClick={() => onSave({ requirements, baseVersionId: latestVersion.versionId, decisions: { ...(latestVersion.decisions || {}), skippedResearch: true } })} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Перейти к финальной версии</button>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h2 className="text-base font-bold text-slate-900">Категории требований</h2><p className="text-xs text-slate-500 mt-0.5">Выберите удобное расположение категорий</p></div>
        <RequirementsLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div aria-label="Категории требований" className={`grid gap-4 ${layout === 'columns' ? 'xl:grid-cols-3' : 'grid-cols-1'}`}>
        {REQUIREMENT_COLUMNS.map(([key, title, subtitle, color]) => <section key={key} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
          <div className="flex items-start justify-between gap-3 mb-2"><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{requirements[key].length}</span></div>
          <div className="divide-y divide-slate-200 mt-4">
            {requirements[key].map((item) => <EditableRequirementCard key={item.id} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} />)}
            {!requirements[key].length && <p className="py-6 text-sm text-slate-400">Нет сформированных требований</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><AddRequirementForm categoryLabel={title} onAdd={(text) => addRequirement(key, text)} /></div>
        </section>)}
      </div>
    </div>
  );
}

function ResearchImprovementReview({ value, latestVersion, onSaveFinal, busy }) {
  const suggestions = Array.isArray(value.improvementSuggestions) ? value.improvementSuggestions : [];
  const [decisions, setDecisions] = useState({});
  if (!suggestions.length || !value.baseRequirements) return null;
  const labels = { business: 'Бизнес-требование', functional: 'Функциональное', nonfunctional: 'Нефункциональное' };

  function finalRequirements() {
    const result = Object.fromEntries(Object.entries(value.baseRequirements).map(([key, items]) => [key, items.map((item) => ({ ...item }))]));
    for (const suggestion of suggestions) {
      if (decisions[suggestion.id] !== 'accepted' || !result[suggestion.targetType] || !suggestion.proposedRequirement) continue;
      const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
      const next = result[suggestion.targetType].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      result[suggestion.targetType].push({ id: `${prefixes[suggestion.targetType]}-${next}`, text: suggestion.proposedRequirement, fromResearch: true });
    }
    return result;
  }

  const acceptedIds = suggestions.filter((item) => decisions[item.id] === 'accepted').map((item) => item.id);
  const rejectedIds = suggestions.filter((item) => decisions[item.id] === 'rejected').map((item) => item.id);
  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 md:p-6">
      <h3 className="text-lg font-semibold text-slate-800">Предложения по улучшению требований</h3>
      <p className="text-sm text-slate-500 mt-1 mb-4">Примите полезные изменения или отклоните неподходящие. Решения сохранятся вместе с финальной версией.</p>
      <div className="space-y-3">
        {suggestions.map((suggestion) => {
          const decision = decisions[suggestion.id];
          return <article key={suggestion.id} className={`border rounded-xl p-4 ${decision === 'accepted' ? 'border-emerald-400 bg-emerald-50' : decision === 'rejected' ? 'border-slate-300 bg-slate-50 opacity-75' : 'border-slate-200'}`}>
            <div className="flex items-start justify-between gap-3 flex-wrap"><div><p className="font-semibold text-slate-800">{suggestion.title}</p><p className="text-xs font-semibold text-indigo-600 mt-1">{labels[suggestion.targetType] || suggestion.targetType}</p></div>{decision && <span className={`text-xs font-semibold px-2 py-1 rounded-full ${decision === 'accepted' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{decision === 'accepted' ? 'Принято' : 'Отклонено'}</span>}</div>
            <p className="text-sm text-slate-600 mt-3"><b className="text-slate-700">Зачем:</b> {suggestion.rationale}</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Предлагаемая формулировка</p><p className="text-sm text-slate-800 mt-1">{suggestion.proposedRequirement}</p></div>
            <div className="flex gap-2 mt-4">
              <button aria-label={`Принять: ${suggestion.title}`} aria-pressed={decision === 'accepted'} onClick={() => setDecisions((current) => ({ ...current, [suggestion.id]: 'accepted' }))} className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${decision === 'accepted' ? 'bg-emerald-600 text-white' : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}><CheckCircle2 className="w-4 h-4" />Принять</button>
              <button aria-label={`Отклонить: ${suggestion.title}`} aria-pressed={decision === 'rejected'} onClick={() => setDecisions((current) => ({ ...current, [suggestion.id]: 'rejected' }))} className={`px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${decision === 'rejected' ? 'bg-slate-700 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}><X className="w-4 h-4" />Отклонить</button>
            </div>
          </article>;
        })}
      </div>
      <div className="sticky bottom-3 z-10 mt-5 flex items-center justify-between gap-4 flex-col sm:flex-row bg-white/95 backdrop-blur rounded-xl border border-slate-200 shadow-lg p-4">
        <p className="text-sm text-slate-600"><b>Принято: {acceptedIds.length}</b> · Отклонено: {rejectedIds.length} из {suggestions.length}{latestVersion ? <span className="block text-xs text-emerald-600 mt-1">Финальная версия сохранена {new Date(latestVersion.createdAt).toLocaleString()}</span> : null}</p>
        <button disabled={busy} onClick={() => onSaveFinal({ requirements: finalRequirements(), baseVersionId: value.inputRequirementsVersionId, decisions: { acceptedSuggestionIds: acceptedIds, rejectedSuggestionIds: rejectedIds } })} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Сохранить финальную версию</button>
      </div>
    </section>
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

function FinalRequirementsEditor({ latestVersion, onSave, onShowInsights, onShowSource, onStartResearch, busy, researchBusy = false, researchSkipped = false }) {
  const [requirements, setRequirements] = useState(() => latestVersion?.requirements || { business: [], functional: [], nonfunctional: [] });
  const [layout, setLayout] = useRequirementsLayout();
  const hasUnsavedChanges = JSON.stringify(requirements) !== JSON.stringify(latestVersion?.requirements || {});

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
            <div className="flex items-center gap-2 flex-wrap"><CheckCircle2 className="w-5 h-5 text-emerald-600" /><h1 className="text-xl font-bold text-slate-900">Финальная версия требований</h1><span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Версия сохранена</span></div>
            <p className="text-sm text-slate-500 mt-2">{researchSkipped ? 'AI-исследование пропущено. Итоговые формулировки можно редактировать вручную.' : 'Отредактируйте итоговые формулировки вручную или вернитесь к результатам AI, чтобы изменить выбранные улучшения.'}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {onShowSource && <button onClick={onShowSource} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50">Исходная версия для AI</button>}
            {onShowInsights && <button onClick={onShowInsights} className="px-4 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />К результатам AI-исследования</button>}
            {researchSkipped && onStartResearch && <button disabled={busy || researchBusy} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="px-4 py-2 border border-indigo-200 rounded-lg text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:bg-slate-100 disabled:text-slate-400 flex items-center gap-2">{researchBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}Добавить AI-исследование</button>}
          </div>
        </div>
      </div>

      <div className="sticky top-16 z-30 -mx-4 px-4 py-3 bg-gray-50/95 backdrop-blur border-y border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3"><span className={`w-8 h-8 rounded-full flex items-center justify-center ${hasUnsavedChanges ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{hasUnsavedChanges ? <Pencil className="w-4 h-4" /> : <Check className="w-4 h-4" />}</span><div><p className="font-semibold text-slate-900">{hasUnsavedChanges ? 'Есть несохранённые изменения' : 'Изменения сохранены'}</p><p className="text-xs text-slate-500 mt-0.5">Редакция от {new Date(latestVersion.createdAt).toLocaleString()}</p></div></div>
        <button disabled={busy || !hasUnsavedChanges} onClick={() => onSave({ requirements, baseVersionId: latestVersion.versionId, decisions: latestVersion.decisions || {} })} className="w-full sm:w-auto px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Сохранить изменения</button>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div><h2 className="text-base font-bold text-slate-900">Категории требований</h2><p className="text-xs text-slate-500 mt-0.5">Выберите удобное расположение категорий</p></div>
        <RequirementsLayoutToggle layout={layout} onChange={setLayout} />
      </div>
      <div aria-label="Финальные требования по категориям" className={`grid gap-4 ${layout === 'columns' ? 'xl:grid-cols-3' : 'grid-cols-1'}`}>
        {REQUIREMENT_COLUMNS.map(([key, title, subtitle, color]) => <section key={key} aria-label={title} className={`bg-white rounded-2xl border border-slate-200 border-t-4 ${color} px-5 py-5`}>
          <div className="flex items-start justify-between gap-3 mb-2"><div><h2 className="text-base font-bold text-slate-900">{title}</h2><p className="text-xs text-slate-500 mt-1">{subtitle}</p></div><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">{requirements[key].length}</span></div>
          <div className="divide-y divide-slate-200 mt-4">
            {requirements[key].map((item) => <EditableRequirementCard key={item.id} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} />)}
            {!requirements[key].length && <p className="py-6 text-sm text-slate-400">Нет сформированных требований</p>}
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100"><AddRequirementForm categoryLabel={title} onAdd={(text) => addRequirement(key, text)} /></div>
        </section>)}
      </div>
    </section>
  );
}

function RequirementsInsightsResult({ value, latestVersion, onSaveFinal, busy }) {
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

  if (activeView === 'final' && latestVersion?.versionId) {
    return <FinalRequirementsEditor latestVersion={latestVersion} onSave={onSaveFinal} onShowInsights={() => setActiveView('insights')} onShowSource={() => setActiveView('source')} busy={busy} />;
  }

  const acceptedKeys = enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key);
  const rejectedKeys = enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key);
  const sameKeys = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
  const finalVersionSaved = Boolean(latestVersion?.versionId) && sameKeys(acceptedKeys, savedAcceptedKeys) && sameKeys(rejectedKeys, savedRejectedKeys);
  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /><h1 className="text-xl font-bold text-gray-900">Результаты AI-исследования</h1><span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">{finalVersionSaved ? 'Финальная версия сохранена' : 'Исследование завершено'}</span></div><p className="text-sm text-gray-500 mt-2">Выберите полезные улучшения, которые нужно добавить в финальную версию требований.</p></div><button onClick={() => setActiveView('source')} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />Исходные требования</button></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setActiveFilter('all')} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Все результаты · {insights.length}</button>{Object.entries(INSIGHT_CATEGORY_META).map(([key, meta]) => { const count = insights.filter((item) => item.category === key).length; return count ? <button key={key} onClick={() => setActiveFilter(key)} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === key ? meta.active : 'bg-white border border-gray-200 text-gray-600'}`}>{meta.label} · {count}</button> : null; })}</div>
      <div role="region" aria-label="Карточки результатов AI-исследования" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((insight) => { const meta = INSIGHT_CATEGORY_META[insight.category] || INSIGHT_CATEGORY_META.trends; const CategoryIcon = meta.icon; const insightEnhancements = displayEnhancementsForInsight(insight); const relatedTo = Array.isArray(insight.relatedTo) ? insight.relatedTo : []; const sourceTypes = Array.isArray(insight.source_types) ? insight.source_types : []; return <article key={insight.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 min-w-0"><CategoryIcon data-testid={`insight-category-icon-${insight.category}`} aria-hidden="true" className="w-4 h-4 text-gray-400 shrink-0" /><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span></span><ApplicabilityBars value={insight.applicability ?? 50} /></div><h3 className="font-bold text-gray-900 mt-3">{insight.title}</h3><p className="text-sm text-gray-500 mt-2 leading-relaxed">{insight.summary}</p>{relatedTo.length > 0 && <div data-testid={`insight-relations-${insight.id}`} className="flex items-center gap-1.5 mt-3 flex-wrap"><Link2 aria-hidden="true" className="w-3.5 h-3.5 text-gray-400 shrink-0" />{relatedTo.map((id) => <span key={id} className="text-xs font-mono font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{id}</span>)}</div>}<details className="mt-3 group"><summary className="list-none text-sm text-gray-400 hover:text-gray-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded flex items-center gap-1"><ChevronDown aria-hidden="true" className="w-3.5 h-3.5 group-open:hidden" /><ChevronUp aria-hidden="true" className="w-3.5 h-3.5 hidden group-open:block" /><span className="group-open:hidden">Подробнее</span><span className="hidden group-open:inline">Свернуть</span></summary><div className="mt-3 pt-3 border-t border-gray-100"><p className="text-sm text-gray-600 leading-relaxed">{insight.detail}</p>{sourceTypes.length > 0 && <div className="flex items-center gap-1.5 flex-wrap mt-3"><ExternalLink aria-hidden="true" className="w-3 h-3 text-gray-400 shrink-0" />{sourceTypes.map((source) => <span key={source} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{SOURCE_TYPE_LABELS[source] || source}</span>)}</div>}</div></details>{insightEnhancements.length > 0 && <div className="border-t border-gray-100 mt-4 pt-3 space-y-2">{insightEnhancements.map((enhancement, index) => { const key = `${insight.id}:${index}`; return <InsightEnhancementDecisionRow key={key} enhancement={enhancement} decision={decisions[key]} onDecision={(decision) => setDecisions((current) => ({ ...current, [key]: decision }))} />; })}</div>}</article>; })}</div>
      <div className="sticky bottom-3 bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap"><div><p className="font-semibold text-gray-900">Выбрано улучшений: {acceptedKeys.length}</p><p className="text-xs text-gray-500 mt-1">{latestVersion ? `Финальная версия сохранена ${new Date(latestVersion.createdAt).toLocaleString()}` : 'После проверки сохраните финальную версию требований.'}</p></div><button disabled={busy} onClick={() => finalVersionSaved ? setActiveView('final') : onSaveFinal({ requirements: finalRequirements(), baseVersionId: latestVersion?.versionId || value.inputRequirementsVersionId, decisions: { acceptedEnhancementKeys: acceptedKeys, rejectedEnhancementKeys: rejectedKeys } })} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300">{finalVersionSaved ? 'К финальным требованиям' : latestVersion ? 'Сохранить новую редакцию' : 'Сохранить финальную версию'}</button></div>
    </section>
  );
}

function ResultView({ metadata, content, latestVersion, onSaveRequirements, onStartResearch, onSaveFinal, busy, researchBusy = false }) {
  const value = safeJson(content);
  const [activeSection, setActiveSection] = useState('overview');
  if (!value) return <Markdown>{content}</Markdown>;
  if (value.mode === 'PROMPT_TEST') return <Markdown>{value.text}</Markdown>;
  if (value.mode === 'REQUIREMENTS_INSIGHTS') return <RequirementsInsightsResult value={value} latestVersion={latestVersion} onSaveFinal={onSaveFinal} busy={busy} />;
  if (value.mode === 'DECOMPOSITION' || value.mode === 'DECOMPOSITION_WITH_INSIGHTS' || Array.isArray(value.decomposition)) {
    if (latestVersion?.decisions?.skippedResearch) return <FinalRequirementsEditor latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} busy={busy} researchBusy={researchBusy} researchSkipped />;
    return <DecompositionResult value={value} latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} busy={busy} researchBusy={researchBusy} />;
  }

  const analyses = value.analyses || [];
  const reports = value.reports || [];
  const suggestions = value.improvementSuggestions || [];
  const tabs = [
    ['overview', 'Краткий вывод'],
    ['insights', `Инсайты${reports.length ? ` · ${reports.length}` : ''}`],
    ['risks', 'Риски'],
    ['recommendations', `Улучшения${suggestions.length ? ` · ${suggestions.length}` : ''}`],
    ['full', 'Полный отчёт'],
  ];

  const categoryCards = analyses.flatMap((analysis) => analysis.categories || []);
  const reportsView = <div className="space-y-3">{reports.map((report, index) => <details key={`${report.variant}-${report.categoryId}-${report.kind}-${index}`} className="bg-white rounded-xl border border-slate-200 p-4" open={index === 0}><summary className="font-semibold text-slate-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">{report.categoryName || report.categoryId} · {RESEARCH_KIND_LABELS[report.kind] || report.kind}{report.variant ? ` · ${report.variant}` : ''}</summary>{report.content ? <div className="mt-4"><Markdown>{report.content}</Markdown></div> : <p className="text-red-700 mt-3">Не удалось получить раздел: {report.reasonCode}</p>}</details>)}</div>;

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Разделы результата исследования" className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(([key, label]) => <button key={key} role="tab" aria-selected={activeSection === key} onClick={() => setActiveSection(key)} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${activeSection === key ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'}`}>{label}</button>)}
      </div>

      {activeSection === 'overview' && <section role="tabpanel" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6">
        <div className="grid gap-3 sm:grid-cols-3 mb-6"><div className="rounded-xl bg-indigo-50 p-4"><p className="text-xs text-indigo-500">Категорий</p><p className="text-2xl font-bold text-indigo-900 mt-1">{categoryCards.length}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-emerald-600">Разделов исследования</p><p className="text-2xl font-bold text-emerald-900 mt-1">{reports.length}</p></div><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-600">Предложений</p><p className="text-2xl font-bold text-amber-900 mt-1">{suggestions.length}</p></div></div>
        <h3 className="text-lg font-semibold text-slate-900 mb-3">Главное</h3>{value.synthesis ? <Markdown>{value.synthesis}</Markdown> : <p className="text-sm text-slate-500">Краткая сводка отсутствует. Перейдите к инсайтам или полному отчёту.</p>}
        {suggestions.length > 0 && <button onClick={() => setActiveSection('recommendations')} className="mt-5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Перейти к улучшениям</button>}
      </section>}

      {activeSection === 'insights' && <section role="tabpanel" className="space-y-4">{categoryCards.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{categoryCards.map((category) => <article key={category.id} className="bg-white rounded-xl border border-slate-200 p-4"><h4 className="font-semibold text-slate-800">{category.name}</h4><p className="text-sm text-slate-600 mt-1">{category.description}</p></article>)}</div>}{reportsView}</section>}

      {activeSection === 'risks' && <section role="tabpanel" className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-6"><h3 className="text-lg font-semibold text-slate-900 mb-3">Риски и ограничения</h3>{metadata?.failedSteps?.length > 0 && <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">Некоторые этапы завершились неуспешно: {metadata.failedSteps.length}. Подробности доступны в технической информации.</p>}{value.risks ? <Markdown>{typeof value.risks === 'string' ? value.risks : JSON.stringify(value.risks, null, 2)}</Markdown> : value.synthesis ? <Markdown>{value.synthesis}</Markdown> : <p className="text-sm text-slate-500">Отдельный раздел рисков не сформирован. Проверьте полный отчёт.</p>}</section>}

      {activeSection === 'recommendations' && <div role="tabpanel"><ResearchImprovementReview value={value} latestVersion={latestVersion} onSaveFinal={onSaveFinal} busy={busy} />{!suggestions.length && value.improvedRequirements && <section className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="text-lg font-semibold text-slate-800 mb-3">Улучшенные требования</h3><textarea readOnly value={value.improvedRequirements} className="w-full h-80 px-3 py-2 border border-slate-200 rounded-lg focus:outline-none resize-none" /></section>}{!suggestions.length && !value.improvedRequirements && <p className="bg-white rounded-xl border border-slate-200 p-5 text-sm text-slate-500">Предложения по улучшению не сформированы.</p>}</div>}

      {activeSection === 'full' && <section role="tabpanel" className="space-y-4">{reportsView}{value.comparison && <div className="bg-white rounded-xl border border-slate-200 p-5"><h3 className="text-lg font-semibold text-slate-800 mb-3">Сравнение</h3><pre className="text-xs whitespace-pre-wrap bg-slate-50 rounded-lg p-4 border border-slate-200 overflow-auto">{JSON.stringify(value.comparison, null, 2)}</pre></div>}{!reports.length && !value.comparison && <pre className="text-xs whitespace-pre-wrap bg-white rounded-xl border border-slate-200 p-5 overflow-auto">{JSON.stringify(value, null, 2)}</pre>}</section>}
    </div>
  );
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
      <div className="flex-1 overflow-y-auto p-4 space-y-2">{filtered.length === 0 ? <p className="text-sm text-slate-400 text-center py-10">В этой категории задач пока нет.</p> : filtered.map((item) => { const status = primaryStatus(item); return <button key={item.jobId} aria-current={activeJobId === item.jobId ? 'true' : undefined} onClick={() => onSelect(item.jobId)} className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${activeJobId === item.jobId ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:border-indigo-200 hover:bg-slate-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-slate-900 truncate">{MODE_LABELS[item.mode] || TYPE_LABELS[item.type] || 'Задача'}</p><span className={`inline-flex mt-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${status.tone}`}>{status.label}</span></div><time className="text-xs text-slate-400 whitespace-nowrap">{new Date(item.createdAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></div></button>; })}</div>
      {cursor && <div className="p-4 border-t border-slate-200"><button onClick={onLoadMore} className="w-full px-4 py-2.5 rounded-xl border border-indigo-200 text-indigo-700 text-sm font-semibold hover:bg-indigo-50">Загрузить ещё</button></div>}
    </aside>
  </div>;
}

export default function AsyncJobWorkspace() {
  const [mode, setMode] = useState('DECOMPOSITION');
  const [workspace, setWorkspace] = useState('requirements');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [requirements, setRequirements] = useState('');
  const [file, setFile] = useState(null);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [model, setModel] = useState('glm-5.2');
  const [temperature, setTemperature] = useState(0.2);
  const [variantA, setVariantA] = useState({ model: 'glm-5.2', temperature: 0.2 });
  const [variantB, setVariantB] = useState({ model: 'glm-5-turbo', temperature: 0.2 });
  const [compareTarget, setCompareTarget] = useState('CATEGORIES');
  const [researchKind, setResearchKind] = useState('trends');
  const [researchKinds, setResearchKinds] = useState(['trends', 'competitors', 'practices']);
  const [categories, setCategories] = useState('');
  const [allCategories, setAllCategories] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [userPrompt, setUserPrompt] = useState('');
  const [upload, setUpload] = useState(0);
  const [job, setJob] = useState(null);
  const [result, setResult] = useState(null);
  const [resultContent, setResultContent] = useState('');
  const [history, setHistory] = useState([]);
  const [requirementsVersions, setRequirementsVersions] = useState([]);
  const [versionBusy, setVersionBusy] = useState(false);
  const linkedResearchSubmissionRef = useRef(false);
  const [cursor, setCursor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const jobId = job?.jobId;
  const jobStatus = job?.status;
  const isDecomposition = mode === 'DECOMPOSITION' || mode === 'DECOMPOSITION_WITH_INSIGHTS';
  const type = isDecomposition ? 'DECOMPOSITION' : 'RESEARCH';
  const parsedResult = safeJson(resultContent);
  const decompositionReady = Boolean(result && (job?.type === 'DECOMPOSITION' || ['DECOMPOSITION', 'DECOMPOSITION_WITH_INSIGHTS'].includes(parsedResult?.mode)));
  const linkedResearch = job?.mode === 'REQUIREMENTS_INSIGHTS' || parsedResult?.mode === 'REQUIREMENTS_INSIGHTS';
  const activeLinkedResearch = Boolean(job?.type === 'RESEARCH' && job?.mode === 'REQUIREMENTS_INSIGHTS' && !TERMINAL.has(job.status));
  const linkedResearchBusy = versionBusy || activeLinkedResearch;
  const linkedResearchComplete = linkedResearch && job?.status === 'SUCCEEDED';
  const finalVersionReady = linkedResearchComplete && requirementsVersions.some((item) => item.sourceJobId === result?.jobId);
  const directFinalReady = Boolean(decompositionReady && requirementsVersions[0]?.sourceJobId === result?.jobId && requirementsVersions[0]?.decisions?.skippedResearch);
  const currentStage = finalVersionReady || directFinalReady ? 4 : linkedResearch ? 3 : decompositionReady ? 2 : 1;
  const completedStage = finalVersionReady || directFinalReady ? 4 : linkedResearchComplete ? 3 : linkedResearch ? 2 : decompositionReady ? 1 : 0;

  const loadResult = useCallback(async (id) => {
    const metadata = await enterpriseApi.getResult(id);
    setResult(metadata);
    setResultContent(metadata.resultArtifactId && enterpriseApi.getResultContent ? await enterpriseApi.getResultContent(id) : '');
    const page = await enterpriseApi.listRequirementsVersions(id);
    const versions = await Promise.all((page.items || []).map((item) => item.requirements ? item : enterpriseApi.getRequirementsVersion(item.versionId)));
    setRequirementsVersions(versions);
  }, []);

  const refresh = useCallback(async () => {
    const page = await enterpriseApi.listJobs({ limit: 20 });
    setHistory(page.items);
    setCursor(page.nextCursor);
    const active = localStorage.getItem('reqai.activeJob');
    if (active) {
      try {
        const value = await enterpriseApi.getJob(active);
        setJob(value);
        setWorkspace(workspaceForMode(value.mode, value.type));
        if (value.mode) setMode(value.mode === 'REQUIREMENTS_INSIGHTS' ? 'DECOMPOSITION' : value.mode);
        if (TERMINAL.has(value.status)) {
          localStorage.removeItem('reqai.activeJob');
          if (value.status === 'SUCCEEDED') await loadResult(value.jobId);
        }
      } catch { localStorage.removeItem('reqai.activeJob'); }
    }
  }, [loadResult]);

  useEffect(() => {
    Promise.all([
      refresh(),
      enterpriseApi.getCapabilities?.().then((value) => {
        const configured = value.capabilities?.models;
        if (!configured?.length) return;
        setModels(configured);
        setModel(configured[0]);
        setVariantA((current) => ({ ...current, model: configured[0] }));
        setVariantB((current) => ({ ...current, model: configured[1] || configured[0] }));
      }),
    ]).catch((cause) => setError(cause.message));
  }, [refresh]);

  useEffect(() => {
    if (!jobId || TERMINAL.has(jobStatus)) return undefined;
    const controller = new AbortController();
    subscribeJobEvents(jobId, { signal: controller.signal, onEvent: async (event) => {
      const next = event.job || await enterpriseApi.getJob(jobId);
      setJob(next);
      if (TERMINAL.has(next.status)) {
        localStorage.removeItem('reqai.activeJob');
        if (next.status === 'SUCCEEDED') await loadResult(next.jobId);
        await refresh();
      }
    } });
    return () => controller.abort();
  }, [jobId, jobStatus, loadResult, refresh]);

  const options = useMemo(() => {
    const base = { mode, model, temperature: Number(temperature), allCategories };
    const selectedCategories = categories.split('\n').map((value) => value.trim()).filter(Boolean);
    if (selectedCategories.length) base.researchCategories = selectedCategories;
    if (mode === 'STANDARD_RESEARCH' || mode === 'AGENT_COMPARE') base.researchKinds = researchKinds;
    if (mode === 'MODEL_COMPARE') Object.assign(base, { variantA, variantB, compareTarget, researchKind });
    if (mode === 'PROMPT_TEST') base.inputFormat = 'PROMPT_JSON';
    return base;
  }, [allCategories, categories, compareTarget, mode, model, researchKind, researchKinds, temperature, variantA, variantB]);

  async function submit() {
    const promptEnvelope = mode === 'PROMPT_TEST' ? JSON.stringify({ systemPrompt, userPrompt }) : null;
    const input = promptEnvelope ? new Blob([promptEnvelope], { type: 'application/json' }) : file || new Blob([requirements], { type: 'text/plain; charset=utf-8' });
    if ((!file && !requirements.trim() && mode !== 'PROMPT_TEST') || (mode === 'PROMPT_TEST' && !userPrompt.trim())) return;
    setBusy(true);
    setError('');
    setUpload(0);
    try {
      const artifact = await enterpriseApi.uploadArtifact(input, setUpload);
      const accepted = await enterpriseApi.createJob({ type, inputArtifactId: artifact.artifactId, options });
      localStorage.setItem('reqai.activeJob', accepted.jobId);
      setJob(await enterpriseApi.getJob(accepted.jobId));
      setResult(null);
      setResultContent('');
      setRequirementsVersions([]);
      await refresh();
    } catch (cause) { setError(`${cause.code || 'ERROR'}: ${cause.message}`); }
    finally { setBusy(false); }
  }

  async function load(id) {
    const selected = await enterpriseApi.getJob(id);
    setJob(selected);
    setWorkspace(workspaceForMode(selected.mode, selected.type));
    if (selected.mode) setMode(selected.mode === 'REQUIREMENTS_INSIGHTS' ? 'DECOMPOSITION' : selected.mode);
    setResult(null);
    setResultContent('');
    setRequirementsVersions([]);
    if (selected.status === 'SUCCEEDED') await loadResult(id);
    setHistoryOpen(false);
  }

  async function saveRequirementsVersion({ requirements: nextRequirements, baseVersionId = null, decisions = {} }) {
    if (!result?.jobId) return null;
    setVersionBusy(true);
    setError('');
    try {
      const saved = await enterpriseApi.saveRequirementsVersion({ sourceJobId: result.jobId, baseVersionId, requirements: nextRequirements, decisions });
      setRequirementsVersions((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
      return saved;
    } catch (cause) {
      setError(`${cause.code || 'ERROR'}: ${cause.message}`);
      return null;
    } finally { setVersionBusy(false); }
  }

  async function startResearchFromDecomposition({ requirementsVersionId }) {
    const parentJobId = result?.jobId;
    if (!parentJobId || !requirementsVersionId || linkedResearchSubmissionRef.current || versionBusy || activeLinkedResearch) return;
    linkedResearchSubmissionRef.current = true;
    setVersionBusy(true);
    setError('');
    try {
      const accepted = await enterpriseApi.createJob({
        type: 'RESEARCH',
        inputArtifactId: requirementsVersionId,
        parentJobId,
        options: { mode: 'REQUIREMENTS_INSIGHTS', model, temperature: Number(temperature), allCategories: true },
      });
      localStorage.setItem('reqai.activeJob', accepted.jobId);
      setWorkspace('requirements');
      setMode('DECOMPOSITION');
      setJob(await enterpriseApi.getJob(accepted.jobId));
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

  const canSubmit = mode === 'PROMPT_TEST' ? userPrompt.trim() : file || requirements.trim();
  const activeJob = job && !TERMINAL.has(job.status);
  const normalActiveJob = job && ['ACCEPTED', 'QUEUED', 'RUNNING'].includes(job.status);
  const cancelActiveJob = () => enterpriseApi.cancelJob(job.jobId).then(() => load(job.jobId));
  const submitLabel = isDecomposition ? 'Декомпозировать требования' : mode === 'STANDARD_RESEARCH' ? 'Анализировать требования' : 'Запустить задачу';

  const commonInput = mode !== 'PROMPT_TEST' && (
    <>
      <label className="block mb-4">
        {!isDecomposition && <span className="text-lg font-semibold text-slate-700 mb-2 block">Введите бизнес-требования</span>}
        <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={isDecomposition ? 'Опишите бизнес-задачу...' : 'Например: Разработать приложение с функциями оплаты, отслеживания и программы лояльности...'} className={`w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none bg-slate-50/50 ${isDecomposition ? 'h-32' : 'h-48'}`} />
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-indigo-600">
        <FileUp className="w-4 h-4" /><span>{file ? file.name : 'Приложить файл до 100 МБ'}</span>
        <input aria-label="Файл требований" type="file" className="sr-only" onChange={(event) => setFile(event.target.files[0])} />
      </label>
    </>
  );

  const submitButton = (
    <button disabled={!canSubmit || busy || activeJob || (researchKinds.length === 0 && ['STANDARD_RESEARCH', 'AGENT_COMPARE'].includes(mode))} onClick={submit} className="w-full sm:w-auto text-white py-3 px-6 rounded-lg font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
      {busy ? <><Loader2 className="w-5 h-5 animate-spin" />Загрузка {Math.round(upload * 100)}%</> : activeJob ? <><Loader2 className="w-5 h-5 animate-spin" />{job.type === 'DECOMPOSITION' ? 'Декомпозиция выполняется…' : 'Исследование выполняется…'}</> : <>{isDecomposition ? <Sparkles className="w-4 h-4" /> : <Search className="w-5 h-5" />}{submitLabel}</>}
    </button>
  );

  const contextComplete = Boolean(result && (job?.type === 'DECOMPOSITION' || ['DECOMPOSITION', 'DECOMPOSITION_WITH_INSIGHTS'].includes(result.mode)));
  const contextFormBody = <>
    {commonInput}
    <div className="mt-4"><AiSettingsDisclosure model={model}><ModelControls models={models} model={model} setModel={setModel} temperature={temperature} setTemperature={setTemperature} /></AiSettingsDisclosure></div>
    <div className="flex items-end justify-between mt-5 flex-col sm:flex-row gap-4">
      <p className="text-xs text-gray-400 max-w-lg">AI создаст бизнес-, функциональные и нефункциональные требования. Их можно будет отредактировать перед необязательным исследованием.</p>
      <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
        {submitButton}
        {normalActiveJob && <button onClick={cancelActiveJob} className="w-full sm:w-auto px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Отменить</button>}
      </div>
    </div>
  </>;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white/95 backdrop-blur border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center min-h-16 gap-3 sm:gap-6">
            <span className="text-base font-extrabold text-gray-900 tracking-tight mr-auto sm:mr-3">ReqAI</span>
            <button onClick={() => { setWorkspace('requirements'); setMode('DECOMPOSITION'); }} aria-current={workspace === 'requirements' ? 'page' : undefined} className={`h-16 px-1 text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${workspace === 'requirements' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Подготовка требований</button>
            <details className="relative group">
              <summary aria-label="Дополнительные инструменты" title="Дополнительные инструменты" className={`list-none cursor-pointer p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${workspace === 'tools' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}><Wrench className="w-4 h-4" /><span className="hidden sm:inline">Дополнительные инструменты</span></summary>
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white shadow-xl p-2 z-50">{RESEARCH_MODES.map(([key, label]) => <button key={key} onClick={(event) => { setWorkspace('tools'); setMode(key); event.currentTarget.closest('details').removeAttribute('open'); }} className={`w-full text-left px-3 py-2.5 rounded-lg text-sm ${mode === key && workspace === 'tools' ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>)}</div>
            </details>
            <button aria-label="История" onClick={() => setHistoryOpen(true)} className="p-2 sm:px-3 sm:py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100 flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"><History className="w-4 h-4" /><span className="hidden sm:inline">История</span></button>
          </div>
        </div>
      </nav>

      {workspace === 'requirements' ? (
        <main className="max-w-7xl mx-auto px-4 py-6">
          {(contextComplete || activeLinkedResearch || (linkedResearch && result)) && <WorkflowStepper currentStage={currentStage} completedStage={completedStage} skippedStages={directFinalReady ? [3] : []} />}
          {activeLinkedResearch && !contextComplete ? <section className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 mb-5 flex items-center justify-between gap-5 flex-wrap">
            <div className="flex items-center gap-4">
              <span className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><Loader2 className="w-5 h-5 animate-spin" /></span>
              <div><h1 className="text-2xl md:text-3xl font-bold text-slate-900">AI-исследование требований</h1><p className="text-sm text-slate-500 mt-1">Анализируем проверенную версию и формируем предложения по улучшению.</p></div>
            </div>
            <button onClick={cancelActiveJob} className="px-4 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:text-red-600 hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Отменить</button>
          </section> : contextComplete && !directFinalReady ? <section className="bg-white rounded-2xl border border-slate-200 mb-5 overflow-hidden">
            <div className="p-5 md:px-6 flex items-start justify-between gap-6 flex-wrap">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{activeLinkedResearch ? 'AI-исследование требований' : 'Проверка требований'}</h1>
                <p className="text-sm text-slate-500 mt-1">{activeLinkedResearch ? 'Анализируем сохранённую версию. Требования ниже показаны для контроля исходных данных.' : 'Изучите формулировки по категориям и сохраните проверенную версию.'}</p>
              </div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${activeLinkedResearch ? 'bg-indigo-50 text-indigo-700' : 'bg-emerald-50 text-emerald-700'}`}>{activeLinkedResearch ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}{activeLinkedResearch ? 'Исследование выполняется' : 'Контекст обработан'}</span>
            </div>
            <details className="group border-t border-slate-200">
              <summary aria-label="Исходный бизнес-контекст" className="list-none cursor-pointer px-5 md:px-6 py-3.5 flex items-center justify-between gap-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <span className="min-w-0"><span className="font-semibold text-slate-700">Исходная бизнес-задача</span><span className="block text-xs text-slate-500 truncate mt-0.5 max-w-3xl">{requirements.trim() || 'Бизнес-контекст сохранён в исходной задаче'}</span></span>
                <span className="font-semibold text-indigo-600 whitespace-nowrap">Посмотреть и изменить</span>
              </summary>
              <div className="border-t border-slate-200 bg-slate-50/60 p-4 md:p-6">
                <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Изменить бизнес-задачу</h2>
                <p className="text-sm text-slate-500 mb-4">После изменений запустите декомпозицию повторно.</p>
                {contextFormBody}
              </div>
            </details>
          </section> : (linkedResearch && result) || directFinalReady ? null : <>
            <div className="mb-6"><h1 className="text-2xl md:text-3xl font-bold text-gray-900">Подготовка требований</h1><p className="text-sm text-slate-500 mt-1">От бизнес-контекста до проверенной финальной версии</p></div>
            <WorkflowStepper currentStage={currentStage} completedStage={completedStage} skippedStages={directFinalReady ? [3] : []} />
            <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
              <div className="text-xs font-semibold text-indigo-600 mb-1">ЭТАП 1 · БИЗНЕС-КОНТЕКСТ</div>
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Сформулируйте бизнес-задачу</h2>
              <p className="text-sm text-slate-500 mb-4">Опишите цель, ограничения и ожидаемый результат обычным языком.</p>
              {contextFormBody}
            </section>
          </>}
          {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap">{error}</div>}
          <div className="space-y-6">
            <JobStateCard job={job} onCancel={cancelActiveJob} />
            {result && <ResultPanel result={result} resultContent={resultContent} download={download} latestVersion={requirementsVersions[0] || null} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} busy={versionBusy} researchBusy={linkedResearchBusy} />}
          </div>
        </main>
      ) : (
        <main className="max-w-7xl mx-auto px-4 py-6">
          <div className="w-full">
            <div className="mb-6"><div className="text-xs font-semibold text-indigo-600 mb-1">ДОПОЛНИТЕЛЬНЫЙ ИНСТРУМЕНТ</div><h1 className="text-2xl md:text-3xl font-bold text-gray-900">{MODE_LABELS[mode]}</h1><p className="text-sm text-slate-500 mt-1">Расширенный анализ вне основного сценария подготовки требований</p></div>
            <div className="space-y-6">
              <section className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 md:p-6">
                {mode === 'PROMPT_TEST' ? <>
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Запрос для проверки</h2><p className="text-sm text-slate-500 mb-4">Введите основной запрос. Системный промпт и модель доступны в настройках AI.</p>
                  <label className="block mb-6"><span className="text-sm font-semibold text-slate-700 mb-2 block">Запрос к LLM</span><textarea aria-label="Пользовательский промпт" value={userPrompt} onChange={(event) => setUserPrompt(event.target.value)} placeholder="Введите пользовательский промпт..." className="w-full h-40 px-4 py-3 border-2 border-slate-200 rounded-lg bg-slate-50/50 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none" /></label>
                </> : <>
                  <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Исходные данные</h2><p className="text-sm text-slate-500 mb-4">Добавьте требования или бизнес-контекст для анализа.</p>
                  {commonInput}
                </>}

                <AiSettingsDisclosure model={model}><div className="space-y-5">
                {mode !== 'MODEL_COMPARE' && <ModelControls models={models} model={model} setModel={setModel} temperature={temperature} setTemperature={setTemperature} />}
                {mode === 'PROMPT_TEST' && <label className="block"><span className="text-sm font-semibold text-slate-700 mb-2 block">Системный промпт</span><textarea aria-label="Системный промпт" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} placeholder="Вставьте системный промпт (role: system)..." className="w-full h-32 px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none bg-white" /></label>}
                {['STANDARD_RESEARCH', 'AGENT_RESEARCH', 'AGENT_COMPARE'].includes(mode) && <div className="space-y-4">
                  <label className="block"><span className="text-sm font-semibold text-slate-700 mb-2 block">Категории (необязательно, по одной на строку)</span><textarea value={categories} onChange={(event) => setCategories(event.target.value)} className="w-full h-24 px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-none bg-white" /></label>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input className="accent-indigo-600" type="checkbox" checked={allCategories} onChange={(event) => setAllCategories(event.target.checked)} /> Все категории</label>
                  {(mode === 'STANDARD_RESEARCH' || mode === 'AGENT_COMPARE') && <div className="flex flex-wrap gap-4">{Object.entries(RESEARCH_KIND_LABELS).map(([kind, label]) => <label key={kind} className="flex items-center gap-2 text-sm text-slate-700"><input className="accent-indigo-600" type="checkbox" checked={researchKinds.includes(kind)} onChange={(event) => setResearchKinds((current) => event.target.checked ? [...new Set([...current, kind])] : current.filter((item) => item !== kind))} />{label}</label>)}</div>}
                </div>}

                {mode === 'MODEL_COMPARE' && <div className="space-y-6">
                  <div className="mb-6 flex flex-wrap gap-2"><button onClick={() => setCompareTarget('CATEGORIES')} className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${compareTarget === 'CATEGORIES' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'}`}>Категории</button><button onClick={() => setCompareTarget('RESEARCH')} className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${compareTarget === 'RESEARCH' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-200'}`}>Исследование</button></div>
                  {compareTarget === 'RESEARCH' && <label className="block mt-4"><span className="text-sm font-semibold text-slate-700 mb-2 block">Тип исследования</span><select value={researchKind} onChange={(event) => setResearchKind(event.target.value)} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100">{Object.entries(RESEARCH_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
                  <div className="grid gap-4 md:grid-cols-2">{[['A', variantA, setVariantA], ['B', variantB, setVariantB]].map(([label, value, setter]) => <fieldset key={label} className="border border-slate-200 bg-white rounded-xl p-4"><legend className="px-1 text-sm font-semibold text-slate-600">Вариант {label}</legend><label className="block mb-4"><span className="text-sm font-semibold text-slate-700 mb-2 block">Модель</span><select value={value.model} onChange={(event) => setter({ ...value, model: event.target.value })} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100">{models.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-slate-700 mb-2 block">Температура</span><input aria-label={`Температура ${label}`} type="number" min="0" max="2" step="0.1" value={value.temperature} onChange={(event) => setter({ ...value, temperature: Number(event.target.value) })} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg bg-white focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" /></label></fieldset>)}</div>
                </div>}
                </div></AiSettingsDisclosure>
                <div className="mt-6 flex flex-col sm:flex-row justify-end gap-2">
                  {submitButton}
                  {normalActiveJob && <button onClick={cancelActiveJob} className="w-full sm:w-auto px-4 py-3 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Отменить</button>}
                </div>
                {error && <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
              </section>
              <JobStateCard job={job} onCancel={cancelActiveJob} />
              {result && <ResultPanel result={result} resultContent={resultContent} download={download} latestVersion={requirementsVersions[0] || null} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} busy={versionBusy} researchBusy={linkedResearchBusy} />}
            </div>
          </div>
        </main>
      )}

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} filter={historyFilter} setFilter={setHistoryFilter} activeJobId={jobId} onSelect={load} cursor={cursor} onLoadMore={async () => { const page = await enterpriseApi.listJobs({ limit: 20, cursor }); setHistory((current) => [...current, ...page.items]); setCursor(page.nextCursor); }} />
    </div>
  );
}

function ResultPanel({ result, resultContent, download, latestVersion, onSaveRequirements, onStartResearch, onSaveFinal, busy, researchBusy = false }) {
  const parsedContent = safeJson(resultContent);
  const embeddedInsights = parsedContent?.mode === 'REQUIREMENTS_INSIGHTS';
  const decompositionResult = result.type === 'DECOMPOSITION' || ['DECOMPOSITION', 'DECOMPOSITION_WITH_INSIGHTS'].includes(result.mode) || ['DECOMPOSITION', 'DECOMPOSITION_WITH_INSIGHTS'].includes(parsedContent?.mode) || Array.isArray(parsedContent?.decomposition);
  const status = primaryStatus(result);
  return (
    <section className="space-y-4">
      {!embeddedInsights && !decompositionResult && <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Результат задачи</p><div className="flex items-center gap-2 mt-1"><h2 className="text-xl font-semibold text-slate-800">{MODE_LABELS[result.mode] || TYPE_LABELS[result.type] || 'Исследование'}</h2><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${status.tone}`}>{status.label}</span></div></div>
        </div>
        {result.outcome === 'PARTIAL' && <div className="mt-4 flex gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">Частичный результат: некоторые этапы завершились ошибкой.</p></div>}
      </div>}
      <ResultView key={`${result.jobId}:${latestVersion?.versionId || 'base'}`} metadata={result} content={resultContent || result.summary || ''} latestVersion={latestVersion} onSaveRequirements={onSaveRequirements} onStartResearch={onStartResearch} onSaveFinal={onSaveFinal} busy={busy} researchBusy={researchBusy} />
      <details className="bg-white rounded-xl border border-slate-200 p-4"><summary className="text-sm font-semibold text-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">Техническая информация</summary><div className="mt-4 text-sm text-slate-600 space-y-4"><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-xs text-slate-400">Статус API</dt><dd className="font-mono text-xs mt-1">{result.status || 'SUCCEEDED'}</dd></div><div><dt className="text-xs text-slate-400">Результат API</dt><dd className="font-mono text-xs mt-1">{result.outcome || '—'}</dd></div></dl>{result.resultArtifactId && <button onClick={download} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:border-indigo-300"><Download className="w-4 h-4" />Скачать JSON</button>}<div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Модели и попытки</p>{(result.modelAttempts || []).length ? <ul className="text-xs space-y-2">{result.modelAttempts.map((attempt, index) => <li key={index}>{attempt.stepId}: {attempt.requestedModel} → {attempt.model}, {attempt.result}{attempt.reasonCode ? ` (${attempt.reasonCode})` : ''}</li>)}</ul> : <p className="text-xs text-slate-400">Данные о попытках отсутствуют.</p>}</div></div></details>
    </section>
  );
}
