import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  CheckCircle2,
  Download,
  FileUp,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
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
  REQUIREMENTS_INSIGHTS: 'AI-Ресерч требований',
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
  trends: { label: 'Тренды рынка', color: 'bg-emerald-100 text-emerald-700', active: 'bg-emerald-600 text-white' },
  patterns: { label: 'Архитектурные паттерны', color: 'bg-violet-100 text-violet-700', active: 'bg-violet-600 text-white' },
  risks: { label: 'Риски', color: 'bg-orange-100 text-orange-700', active: 'bg-orange-600 text-white' },
  competitors: { label: 'Конкурентный анализ', color: 'bg-blue-100 text-blue-700', active: 'bg-blue-600 text-white' },
  standards: { label: 'Стандарты и нормативы', color: 'bg-amber-100 text-amber-700', active: 'bg-amber-600 text-white' },
};
const SOURCE_TYPE_LABELS = { regulatory: 'Нормативные документы', industry_report: 'Отраслевой отчёт', case_study: 'Кейс', academic: 'Исследования', open_standard: 'Открытый стандарт', market_research: 'Исследование рынка' };

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

function WorkflowStepper({ currentStage = 1, completedStage = 0 }) {
  const stages = [
    ['Контекст', 'Опишите бизнес-задачу'],
    ['Требования', 'Проверьте декомпозицию'],
    ['AI-ресерч', 'Необязательный шаг'],
    ['Финальная версия', 'Сохраните результат'],
  ];
  return (
    <ol aria-label="Этапы подготовки требований" className="grid grid-cols-2 gap-2 md:grid-cols-4 mb-6">
      {stages.map(([title, subtitle], index) => {
        const number = index + 1;
        const complete = number <= completedStage;
        const current = number === currentStage;
        return <li key={title} aria-current={current ? 'step' : undefined} className={`rounded-xl border p-3 min-w-0 ${complete ? 'border-emerald-200 bg-emerald-50' : current ? 'border-indigo-300 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${complete ? 'bg-emerald-600 text-white' : current ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{complete ? <Check className="w-4 h-4" /> : number}</span>
            <span className={`text-sm font-semibold truncate ${current ? 'text-indigo-900' : complete ? 'text-emerald-900' : 'text-slate-500'}`}>{title}</span>
          </div>
          <p className="text-xs text-slate-400 mt-2 pl-9">{subtitle}</p>
        </li>;
      })}
    </ol>
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

function EditableRequirementCard({ requirement, onEdit, onDelete }) {
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
    <div className={`rounded-xl p-4 border ${requirement.fromResearch ? 'border-blue-500 bg-blue-50/90' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{requirement.id}</span>
        {requirement.fromResearch && <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600"><Sparkles className="w-3.5 h-3.5" />AI</span>}
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
          <p className="text-sm text-gray-700 leading-relaxed">{requirement.text}</p>
          <div className="flex gap-2 mt-3">
            <button onClick={() => setEditing(true)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><Pencil className="w-3 h-3" /> Редактировать</button>
            <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"><Trash2 className="w-3 h-3" /> Удалить</button>
          </div>
        </>
      )}
    </div>
  );
}

function AddRequirementForm({ onAdd }) {
  const [text, setText] = useState('');
  function add() {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  }
  return (
    <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50/50">
      <p className="text-xs font-semibold text-gray-500 mb-2">Добавить новое требование</p>
      <textarea aria-label="Новое требование" value={text} onChange={(event) => setText(event.target.value)} rows={2} placeholder="Введите формулировку требования..." className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:border-indigo-500 focus:outline-none bg-white" />
      <button onClick={add} disabled={!text.trim()} className="mt-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:bg-gray-300 flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Добавить</button>
    </div>
  );
}

function DecompositionResult({ value, latestVersion, onSave, onStartResearch, busy }) {
  const [requirements, setRequirements] = useState(() => latestVersion?.requirements?.business && latestVersion?.requirements?.functional && latestVersion?.requirements?.nonfunctional ? latestVersion.requirements : collectRequirements(value));
  const hasSavedVersion = Boolean(latestVersion?.versionId);
  const hasUnsavedChanges = !hasSavedVersion || JSON.stringify(requirements) !== JSON.stringify(latestVersion.requirements);
  const columns = [
    ['business', 'Бизнес-требования', 'Что должно измениться для клиента и бизнеса', 'border-t-blue-500', 'BT'],
    ['functional', 'Функциональные требования', 'Что система должна уметь делать', 'border-t-purple-500', 'FT'],
    ['nonfunctional', 'Нефункциональные требования', 'Надежность, производительность и compliance', 'border-t-amber-500', 'NFT'],
  ];

  function editRequirement(type, id, text) {
    setRequirements((current) => ({ ...current, [type]: current[type].map((item) => item.id === id ? { ...item, text } : item) }));
  }

  function deleteRequirement(type, id) {
    setRequirements((current) => ({ ...current, [type]: current[type].filter((item) => item.id !== id) }));
  }

  function addRequirement(type, text, fromResearch = false) {
    const prefix = columns.find(([key]) => key === type)?.[4] || 'REQ';
    setRequirements((current) => {
      const number = current[type].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      return { ...current, [type]: [...current[type], { id: `${prefix}-${number}`, text, fromResearch }] };
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><div className="text-xs font-semibold text-indigo-600 mb-1">ШАГ 2</div><h2 className="text-lg font-bold text-gray-900">Проверьте и отредактируйте требования</h2><p className="text-sm text-gray-500 mt-1">AI-ресерч необязателен и доступен после сохранения проверенной версии.</p></div>
      </div>
      <div className="sticky top-20 z-30 bg-white/95 backdrop-blur rounded-2xl shadow-md border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold text-gray-900">Проверенная версия</p>
          <p id="research-save-status" className="text-sm text-gray-500 mt-1">{!hasSavedVersion ? 'Сначала сохраните проверенные требования.' : hasUnsavedChanges ? 'Есть несохранённые изменения.' : `Сохранена ${new Date(latestVersion.createdAt).toLocaleString()}`}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button disabled={busy || !hasUnsavedChanges} onClick={() => onSave({ requirements, baseVersionId: latestVersion?.versionId || null })} className="w-full sm:w-auto px-4 py-2.5 border border-indigo-300 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-400 disabled:bg-slate-50">{hasSavedVersion ? 'Сохранить изменения' : 'Сохранить версию'}</button>
          <button aria-label="Провести AI-Ресерч" aria-describedby="research-save-status" title={!hasSavedVersion || hasUnsavedChanges ? 'Сначала сохраните текущую версию требований' : 'Необязательный следующий шаг'} disabled={busy || !hasSavedVersion || hasUnsavedChanges} onClick={() => onStartResearch({ requirementsVersionId: latestVersion.versionId })} className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-300 flex items-center justify-center gap-2"><Search className="w-4 h-4" />Провести AI-ресерч <span className="font-normal opacity-80">· необязательно</span></button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {columns.map(([key, title, subtitle, color]) => (
          <div key={key} className={`bg-white rounded-2xl shadow-sm border border-gray-200 border-t-4 ${color} p-5`}>
            <h3 className="text-base font-bold text-gray-900 mb-0.5">{title}</h3>
            <p className="text-xs text-gray-400 mb-4">{subtitle}</p>
            <div className="space-y-3">
              {requirements[key].map((item) => <EditableRequirementCard key={item.id} requirement={item} onEdit={(text) => editRequirement(key, item.id, text)} onDelete={() => deleteRequirement(key, item.id)} />)}
              {!requirements[key].length && <p className="text-sm text-gray-400">Нет сформированных требований</p>}
            </div>
            <div className="mt-4"><AddRequirementForm onAdd={(text) => addRequirement(key, text)} /></div>
          </div>
        ))}
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

function RequirementsInsightsResult({ value, latestVersion, onSaveFinal, busy }) {
  const insights = Array.isArray(value.insights) ? value.insights : [];
  const [activeFilter, setActiveFilter] = useState('all');
  const [decisions, setDecisions] = useState({});
  const [showInsights, setShowInsights] = useState(true);
  const visible = activeFilter === 'all' ? insights : insights.filter((item) => item.category === activeFilter);
  const enhancements = insights.flatMap((insight) => (insight.enhancements || []).map((enhancement, index) => ({ ...enhancement, key: `${insight.id}:${index}`, insightTitle: insight.title })));

  function finalRequirements() {
    const base = value.baseRequirements || { business: [], functional: [], nonfunctional: [] };
    const result = Object.fromEntries(['business', 'functional', 'nonfunctional'].map((type) => [type, (base[type] || []).map((item) => ({ ...item }))]));
    const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
    enhancements.filter((item) => decisions[item.key] === 'accepted').forEach((enhancement) => {
      const type = enhancement.targetType;
      if (!result[type] || !enhancement.text) return;
      const next = result[type].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      result[type].push({ id: `${prefixes[type]}-${next}`, text: enhancement.text, fromResearch: true });
    });
    return result;
  }

  if (!showInsights) {
    const labels = { business: 'Бизнес-требования', functional: 'Функциональные требования', nonfunctional: 'Нефункциональные требования' };
    return <section className="space-y-4"><div className="flex items-center justify-between gap-3 flex-wrap"><div><div className="text-xs font-semibold text-indigo-600 mb-1">ПРОВЕРЕННАЯ ВЕРСИЯ</div><h2 className="text-xl font-bold text-gray-900">Требования, переданные в AI-Ресерч</h2></div><button onClick={() => setShowInsights(true)} className="px-4 py-2 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-semibold hover:bg-indigo-50">К результатам AI-Ресерча</button></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Object.entries(labels).map(([type, label]) => <div key={type} className="bg-white rounded-xl border border-gray-200 p-4"><h3 className="font-semibold text-gray-900 mb-3">{label}</h3><div className="space-y-2">{(value.baseRequirements?.[type] || []).map((item) => <div key={item.id} className="rounded-lg bg-gray-50 border border-gray-100 p-3"><span className="text-xs font-bold text-gray-400">{item.id}</span><p className="text-sm text-gray-700 mt-1">{item.text}</p></div>)}</div></div>)}</div></section>;
  }

  const acceptedKeys = enhancements.filter((item) => decisions[item.key] === 'accepted').map((item) => item.key);
  const rejectedKeys = enhancements.filter((item) => decisions[item.key] === 'rejected').map((item) => item.key);
  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /><h2 className="text-xl font-bold text-gray-900">AI-Ресерчер</h2><span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Исследование завершено</span></div><p className="text-sm text-gray-500 mt-2">Выберите полезные улучшения, которые нужно добавить в финальную версию требований.</p></div><button onClick={() => setShowInsights(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />К требованиям</button></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setActiveFilter('all')} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Все результаты · {insights.length}</button>{Object.entries(INSIGHT_CATEGORY_META).map(([key, meta]) => { const count = insights.filter((item) => item.category === key).length; return count ? <button key={key} onClick={() => setActiveFilter(key)} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === key ? meta.active : 'bg-white border border-gray-200 text-gray-600'}`}>{meta.label} · {count}</button> : null; })}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((insight) => { const meta = INSIGHT_CATEGORY_META[insight.category] || INSIGHT_CATEGORY_META.trends; return <article key={insight.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-2"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span><span className="text-xs font-semibold text-gray-500">Применимость {insight.applicability ?? 50}%</span></div><h3 className="font-bold text-gray-900 mt-3">{insight.title}</h3><p className="text-sm text-gray-500 mt-2">{insight.summary}</p><details className="mt-3"><summary className="text-sm text-indigo-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">Подробнее</summary><p className="text-sm text-gray-600 mt-2 leading-relaxed">{insight.detail}</p>{insight.relatedTo?.length > 0 && <div className="flex gap-1.5 flex-wrap mt-3">{insight.relatedTo.map((id) => <span key={id} className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{id}</span>)}</div>}{insight.source_types?.length > 0 && <p className="text-xs text-gray-400 mt-3">Основание: {insight.source_types.map((source) => SOURCE_TYPE_LABELS[source] || source).join(', ')}</p>}</details>{insight.enhancements?.length > 0 && <div className="border-t border-gray-100 mt-4 pt-3 space-y-2">{insight.enhancements.map((enhancement, index) => { const key = `${insight.id}:${index}`; const decision = decisions[key]; return <div key={key} className={`block rounded-lg border p-3 ${decision === 'accepted' ? 'border-emerald-300 bg-emerald-50' : decision === 'rejected' ? 'border-slate-300 bg-slate-50 opacity-75' : 'border-gray-200 bg-gray-50'}`}><span className="text-xs font-semibold text-gray-500">Предлагаемое требование</span><span className="block text-sm text-gray-700 mt-1">{enhancement.text}</span><div className="flex gap-2 mt-3"><button aria-label={`Принять улучшение: ${enhancement.text}`} aria-pressed={decision === 'accepted'} onClick={() => setDecisions((current) => ({ ...current, [key]: 'accepted' }))} className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${decision === 'accepted' ? 'bg-emerald-600 text-white' : 'bg-white border border-emerald-200 text-emerald-700'}`}>Принять</button><button aria-label={`Отклонить улучшение: ${enhancement.text}`} aria-pressed={decision === 'rejected'} onClick={() => setDecisions((current) => ({ ...current, [key]: 'rejected' }))} className={`px-2.5 py-1.5 rounded-md text-xs font-semibold ${decision === 'rejected' ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Отклонить</button></div></div>; })}</div>}</article>; })}</div>
      <div className="sticky bottom-3 bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap"><div><p className="font-semibold text-gray-900">Выбрано улучшений: {acceptedKeys.length}</p><p className="text-xs text-gray-500 mt-1">{latestVersion ? `Финальная версия сохранена ${new Date(latestVersion.createdAt).toLocaleString()}` : 'После проверки сохраните финальную версию требований.'}</p></div><button disabled={busy} onClick={() => onSaveFinal({ requirements: finalRequirements(), baseVersionId: value.inputRequirementsVersionId, decisions: { acceptedEnhancementKeys: acceptedKeys, rejectedEnhancementKeys: rejectedKeys } })} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300">Сохранить финальную версию</button></div>
    </section>
  );
}

function ResultView({ metadata, content, latestVersion, onSaveRequirements, onStartResearch, onSaveFinal, busy }) {
  const value = safeJson(content);
  const [activeSection, setActiveSection] = useState('overview');
  if (!value) return <Markdown>{content}</Markdown>;
  if (value.mode === 'PROMPT_TEST') return <Markdown>{value.text}</Markdown>;
  if (value.mode === 'REQUIREMENTS_INSIGHTS') return <RequirementsInsightsResult value={value} latestVersion={latestVersion} onSaveFinal={onSaveFinal} busy={busy} />;
  if (value.mode === 'DECOMPOSITION' || value.mode === 'DECOMPOSITION_WITH_INSIGHTS' || Array.isArray(value.decomposition)) return <DecompositionResult value={value} latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} busy={busy} />;

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
  const linkedResearchComplete = linkedResearch && job?.status === 'SUCCEEDED';
  const finalVersionReady = linkedResearchComplete && requirementsVersions.some((item) => item.sourceJobId === result?.jobId);
  const currentStage = finalVersionReady ? 4 : linkedResearch ? 3 : decompositionReady ? 2 : 1;
  const completedStage = finalVersionReady ? 4 : linkedResearchComplete ? 3 : linkedResearch ? 2 : decompositionReady ? 1 : 0;

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
    if (!parentJobId || !requirementsVersionId) return;
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
    } catch (cause) { setError(`${cause.code || 'ERROR'}: ${cause.message}`); }
    finally { setVersionBusy(false); }
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
          <div className="mb-6"><h1 className="text-2xl md:text-3xl font-bold text-gray-900">Подготовка требований</h1><p className="text-sm text-slate-500 mt-1">От бизнес-контекста до проверенной финальной версии</p></div>
          <WorkflowStepper currentStage={currentStage} completedStage={completedStage} />
          {contextComplete ? <details className="group bg-white rounded-2xl shadow-sm border border-emerald-200 mb-6">
            <summary aria-label="Завершённый бизнес-контекст" className="list-none cursor-pointer p-4 flex items-center justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-2xl">
              <span className="flex items-center gap-3 min-w-0"><span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0"><Check className="w-4 h-4" /></span><span className="min-w-0"><span className="block text-sm font-bold text-slate-900">Контекст готов</span><span className="block text-xs text-slate-500 truncate mt-0.5">{requirements.trim() || 'Бизнес-контекст сохранён в исходной задаче'}</span></span></span>
              <span className="text-sm font-semibold text-indigo-600 whitespace-nowrap">Изменить контекст</span>
            </summary>
            <div className="border-t border-slate-200 p-4 md:p-6">
              <div className="text-xs font-semibold text-indigo-600 mb-1">ЭТАП 1 · БИЗНЕС-КОНТЕКСТ</div>
              <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Изменить бизнес-задачу</h2>
              <p className="text-sm text-slate-500 mb-4">После изменений запустите декомпозицию повторно.</p>
              {contextFormBody}
            </div>
          </details> : <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6">
            <div className="text-xs font-semibold text-indigo-600 mb-1">ЭТАП 1 · БИЗНЕС-КОНТЕКСТ</div>
            <h2 className="text-lg md:text-xl font-bold text-gray-900 mb-1">Сформулируйте бизнес-задачу</h2>
            <p className="text-sm text-slate-500 mb-4">Опишите цель, ограничения и ожидаемый результат обычным языком.</p>
            {contextFormBody}
          </section>}
          {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap">{error}</div>}
          <div className="space-y-6">
            <JobStateCard job={job} onCancel={cancelActiveJob} />
            {!job && <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center"><h3 className="text-base font-semibold text-gray-700 mb-2">Декомпозиция ещё не выполнена</h3><p className="text-sm text-gray-400">Нажмите «Декомпозировать требования», чтобы получить бизнес-, функциональные и нефункциональные требования.</p></div>}
            {result && <ResultPanel result={result} resultContent={resultContent} download={download} latestVersion={requirementsVersions[0] || null} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} busy={versionBusy} />}
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
              {result && <ResultPanel result={result} resultContent={resultContent} download={download} latestVersion={requirementsVersions[0] || null} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} busy={versionBusy} />}
            </div>
          </div>
        </main>
      )}

      <HistoryDrawer open={historyOpen} onClose={() => setHistoryOpen(false)} history={history} filter={historyFilter} setFilter={setHistoryFilter} activeJobId={jobId} onSelect={load} cursor={cursor} onLoadMore={async () => { const page = await enterpriseApi.listJobs({ limit: 20, cursor }); setHistory((current) => [...current, ...page.items]); setCursor(page.nextCursor); }} />
    </div>
  );
}

function ResultPanel({ result, resultContent, download, latestVersion, onSaveRequirements, onStartResearch, onSaveFinal, busy }) {
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
      <ResultView key={`${result.jobId}:${latestVersion?.versionId || 'base'}`} metadata={result} content={resultContent || result.summary || ''} latestVersion={latestVersion} onSaveRequirements={onSaveRequirements} onStartResearch={onStartResearch} onSaveFinal={onSaveFinal} busy={busy} />
      <details className="bg-white rounded-xl border border-slate-200 p-4"><summary className="text-sm font-semibold text-slate-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded">Техническая информация</summary><div className="mt-4 text-sm text-slate-600 space-y-4"><dl className="grid gap-2 sm:grid-cols-2"><div><dt className="text-xs text-slate-400">Статус API</dt><dd className="font-mono text-xs mt-1">{result.status || 'SUCCEEDED'}</dd></div><div><dt className="text-xs text-slate-400">Результат API</dt><dd className="font-mono text-xs mt-1">{result.outcome || '—'}</dd></div></dl>{result.resultArtifactId && <button onClick={download} className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:border-indigo-300"><Download className="w-4 h-4" />Скачать JSON</button>}<div><p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">Модели и попытки</p>{(result.modelAttempts || []).length ? <ul className="text-xs space-y-2">{result.modelAttempts.map((attempt, index) => <li key={index}>{attempt.stepId}: {attempt.requestedModel} → {attempt.model}, {attempt.result}{attempt.reasonCode ? ` (${attempt.reasonCode})` : ''}</li>)}</ul> : <p className="text-xs text-slate-400">Данные о попытках отсутствуют.</p>}</div></div></details>
    </section>
  );
}
