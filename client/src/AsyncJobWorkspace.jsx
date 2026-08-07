import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  ChevronRight,
  Clock3,
  Download,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
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
  DECOMPOSITION: 'Бизнес-требования',
  DECOMPOSITION_WITH_INSIGHTS: 'Бизнес-требования',
  REQUIREMENTS_INSIGHTS: 'AI-Ресерч требований',
  ...Object.fromEntries(RESEARCH_MODES),
};
const TYPE_LABELS = { DECOMPOSITION: 'Бизнес-требования', RESEARCH: 'Исследование' };
const STATUS_LABELS = { ACCEPTED: 'Принято', QUEUED: 'В очереди', RUNNING: 'В работе', RETRY_WAIT: 'Повторная попытка', SUCCEEDED: 'Завершено', FAILED: 'Ошибка', CANCEL_REQUESTED: 'Отменяется', CANCELLED: 'Отменено' };
const OUTCOME_LABELS = { COMPLETE: 'Полный результат', PARTIAL: 'Частичный результат' };
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
        <div><div className="text-xs font-semibold text-indigo-600 mb-1">ШАГ 2</div><h2 className="text-lg font-bold text-gray-900">Проверьте и отредактируйте требования</h2><p className="text-sm text-gray-500 mt-1">Research не запускается автоматически. Сначала сохраните проверенную версию.</p></div>
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
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="font-semibold text-gray-900">Проверенная версия требований</p>
          <p className="text-sm text-gray-500 mt-1">{latestVersion ? `Сохранена ${new Date(latestVersion.createdAt).toLocaleString()}` : 'Версия ещё не сохранена'}</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button disabled={busy} onClick={() => onSave({ requirements, baseVersionId: latestVersion?.versionId || null })} className="px-4 py-2.5 border border-indigo-300 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-50 disabled:opacity-50">Сохранить версию</button>
          <button disabled={busy} onClick={() => onStartResearch({ requirements, baseVersionId: latestVersion?.versionId || null })} className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 disabled:bg-gray-300 flex items-center gap-2"><Search className="w-4 h-4" />Провести AI-Ресерч</button>
        </div>
      </div>
    </div>
  );
}

function ResearchImprovementReview({ value, latestVersion, onSaveFinal, busy }) {
  const suggestions = Array.isArray(value.improvementSuggestions) ? value.improvementSuggestions : [];
  const [accepted, setAccepted] = useState(() => new Set());
  if (!suggestions.length || !value.baseRequirements) return null;
  const labels = { business: 'Бизнес-требование', functional: 'Функциональное', nonfunctional: 'Нефункциональное' };

  function finalRequirements() {
    const result = Object.fromEntries(Object.entries(value.baseRequirements).map(([key, items]) => [key, items.map((item) => ({ ...item }))]));
    for (const suggestion of suggestions) {
      if (!accepted.has(suggestion.id) || !result[suggestion.targetType] || !suggestion.proposedRequirement) continue;
      const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
      const next = result[suggestion.targetType].reduce((max, item) => Math.max(max, Number(String(item.id).match(/\d+$/)?.[0] || 0)), 0) + 1;
      result[suggestion.targetType].push({ id: `${prefixes[suggestion.targetType]}-${next}`, text: suggestion.proposedRequirement, fromResearch: true });
    }
    return result;
  }

  const acceptedIds = suggestions.filter((item) => accepted.has(item.id)).map((item) => item.id);
  const rejectedIds = suggestions.filter((item) => !accepted.has(item.id)).map((item) => item.id);
  return (
    <section className="bg-white rounded-xl shadow-lg p-6">
      <h3 className="text-lg font-semibold text-slate-800">Предложения по улучшению требований</h3>
      <p className="text-sm text-slate-500 mt-1 mb-4">Выберите предложения, которые войдут в финальную версию.</p>
      <div className="space-y-3">
        {suggestions.map((suggestion) => <label key={suggestion.id} className={`block border rounded-xl p-4 cursor-pointer ${accepted.has(suggestion.id) ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
          <div className="flex gap-3"><input type="checkbox" checked={accepted.has(suggestion.id)} onChange={(event) => setAccepted((current) => { const next = new Set(current); if (event.target.checked) next.add(suggestion.id); else next.delete(suggestion.id); return next; })} /><div><p className="font-semibold text-slate-800">{suggestion.title}</p><p className="text-xs text-indigo-600 mt-1">{labels[suggestion.targetType] || suggestion.targetType}</p><p className="text-sm text-slate-600 mt-2">{suggestion.rationale}</p><p className="text-sm text-slate-800 mt-2 bg-white/70 rounded-lg p-3">{suggestion.proposedRequirement}</p></div></div>
        </label>)}
      </div>
      <div className="mt-5 flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-slate-500">Принято: {acceptedIds.length} из {suggestions.length}{latestVersion ? ` · финальная версия сохранена ${new Date(latestVersion.createdAt).toLocaleString()}` : ''}</p>
        <button disabled={busy} onClick={() => onSaveFinal({ requirements: finalRequirements(), baseVersionId: value.inputRequirementsVersionId, decisions: { acceptedSuggestionIds: acceptedIds, rejectedSuggestionIds: rejectedIds } })} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300">Сохранить финальную версию</button>
      </div>
    </section>
  );
}

function RequirementsInsightsResult({ value, latestVersion, onSaveFinal, busy }) {
  const insights = Array.isArray(value.insights) ? value.insights : [];
  const [activeFilter, setActiveFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [showInsights, setShowInsights] = useState(true);
  const visible = activeFilter === 'all' ? insights : insights.filter((item) => item.category === activeFilter);
  const enhancements = insights.flatMap((insight) => (insight.enhancements || []).map((enhancement, index) => ({ ...enhancement, key: `${insight.id}:${index}`, insightTitle: insight.title })));

  function finalRequirements() {
    const base = value.baseRequirements || { business: [], functional: [], nonfunctional: [] };
    const result = Object.fromEntries(['business', 'functional', 'nonfunctional'].map((type) => [type, (base[type] || []).map((item) => ({ ...item }))]));
    const prefixes = { business: 'BT', functional: 'FT', nonfunctional: 'NFT' };
    enhancements.filter((item) => selected.has(item.key)).forEach((enhancement) => {
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

  const acceptedKeys = enhancements.filter((item) => selected.has(item.key)).map((item) => item.key);
  const rejectedKeys = enhancements.filter((item) => !selected.has(item.key)).map((item) => item.key);
  return (
    <section className="space-y-5">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><div className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-500" /><h2 className="text-xl font-bold text-gray-900">AI-Ресерчер</h2><span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">Исследование завершено</span></div><p className="text-sm text-gray-500 mt-2">Выберите полезные улучшения, которые нужно добавить в финальную версию требований.</p></div><button onClick={() => setShowInsights(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-2"><ArrowLeft className="w-4 h-4" />К требованиям</button></div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1"><button onClick={() => setActiveFilter('all')} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === 'all' ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>Все результаты · {insights.length}</button>{Object.entries(INSIGHT_CATEGORY_META).map(([key, meta]) => { const count = insights.filter((item) => item.category === key).length; return count ? <button key={key} onClick={() => setActiveFilter(key)} className={`px-3 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeFilter === key ? meta.active : 'bg-white border border-gray-200 text-gray-600'}`}>{meta.label} · {count}</button> : null; })}</div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((insight) => { const meta = INSIGHT_CATEGORY_META[insight.category] || INSIGHT_CATEGORY_META.trends; return <article key={insight.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"><div className="flex items-center justify-between gap-2"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span><span className="text-xs font-semibold text-gray-500">Применимость {insight.applicability ?? 50}%</span></div><h3 className="font-bold text-gray-900 mt-3">{insight.title}</h3><p className="text-sm text-gray-500 mt-2">{insight.summary}</p><details className="mt-3"><summary className="text-sm text-indigo-600 cursor-pointer">Подробнее</summary><p className="text-sm text-gray-600 mt-2 leading-relaxed">{insight.detail}</p>{insight.relatedTo?.length > 0 && <div className="flex gap-1.5 flex-wrap mt-3">{insight.relatedTo.map((id) => <span key={id} className="text-xs font-mono text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{id}</span>)}</div>}{insight.source_types?.length > 0 && <p className="text-xs text-gray-400 mt-3">Основание: {insight.source_types.map((source) => SOURCE_TYPE_LABELS[source] || source).join(', ')}</p>}</details>{insight.enhancements?.length > 0 && <div className="border-t border-gray-100 mt-4 pt-3 space-y-2">{insight.enhancements.map((enhancement, index) => { const key = `${insight.id}:${index}`; return <label key={key} className={`block rounded-lg border p-3 cursor-pointer ${selected.has(key) ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}><span className="flex gap-2"><input type="checkbox" checked={selected.has(key)} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(key); else next.delete(key); return next; })} /><span><span className="text-xs font-semibold text-gray-500">Добавить в требования</span><span className="block text-sm text-gray-700 mt-1">{enhancement.text}</span></span></span></label>; })}</div>}</article>; })}</div>
      <div className="sticky bottom-3 bg-white rounded-xl shadow-lg border border-gray-200 p-4 flex items-center justify-between gap-4 flex-wrap"><div><p className="font-semibold text-gray-900">Выбрано улучшений: {acceptedKeys.length}</p><p className="text-xs text-gray-500 mt-1">{latestVersion ? `Финальная версия сохранена ${new Date(latestVersion.createdAt).toLocaleString()}` : 'После проверки сохраните финальную версию требований.'}</p></div><button disabled={busy} onClick={() => onSaveFinal({ requirements: finalRequirements(), baseVersionId: value.inputRequirementsVersionId, decisions: { acceptedEnhancementKeys: acceptedKeys, rejectedEnhancementKeys: rejectedKeys } })} className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:bg-gray-300">Сохранить финальную версию</button></div>
    </section>
  );
}

function ResultView({ metadata, content, latestVersion, onSaveRequirements, onStartResearch, onSaveFinal, busy }) {
  const value = safeJson(content);
  if (!value) return <Markdown>{content}</Markdown>;
  if (value.mode === 'PROMPT_TEST') return <Markdown>{value.text}</Markdown>;
  if (value.mode === 'REQUIREMENTS_INSIGHTS') return <RequirementsInsightsResult value={value} latestVersion={latestVersion} onSaveFinal={onSaveFinal} busy={busy} />;
  if (value.mode === 'DECOMPOSITION' || value.mode === 'DECOMPOSITION_WITH_INSIGHTS' || Array.isArray(value.decomposition)) return <DecompositionResult value={value} latestVersion={latestVersion} onSave={onSaveRequirements} onStartResearch={onStartResearch} busy={busy} />;
  return (
    <div className="space-y-6">
      {value.analyses?.map((analysis, index) => (
        <section key={`${analysis.variant || analysis.style}-${index}`} className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-xl font-semibold text-slate-800 mb-4">Выявленные категории</h3>
          <div className="grid gap-4">
            {analysis.categories?.map((category) => (
              <div key={category.id} className="border-2 border-slate-200 rounded-lg p-5">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <h4 className="text-lg font-semibold text-slate-800">{category.name}</h4>
                    <p className="text-slate-600 mt-1">{category.description}</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-blue-600 shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      {value.reports?.map((report, index) => (
        <details key={`${report.variant}-${report.categoryId}-${report.kind}-${index}`} className="bg-white rounded-xl shadow-lg p-6" open={index === 0}>
          <summary className="font-semibold text-slate-800 cursor-pointer">
            {report.categoryName || report.categoryId} · {RESEARCH_KIND_LABELS[report.kind] || report.kind}
            {report.variant ? ` · ${report.variant}` : ''}{report.actualModel ? ` · ${report.actualModel}` : ''}
          </summary>
          {report.content ? <div className="mt-4"><Markdown>{report.content}</Markdown></div> : <p className="text-red-700 mt-3">Ошибка: {report.reasonCode}</p>}
        </details>
      ))}
      {value.synthesis && <section className="bg-white rounded-xl shadow-lg p-6"><h3 className="text-lg font-semibold text-slate-800 mb-3">Сводка исследования</h3><Markdown>{value.synthesis}</Markdown></section>}
      <ResearchImprovementReview value={value} latestVersion={latestVersion} onSaveFinal={onSaveFinal} busy={busy} />
      {value.improvedRequirements && !value.improvementSuggestions?.length && <section className="bg-white rounded-xl shadow-lg p-6"><h3 className="text-lg font-semibold text-slate-800 mb-3">Улучшенные требования</h3><textarea readOnly value={value.improvedRequirements} className="w-full h-80 px-3 py-2 border-2 border-slate-200 rounded-lg focus:outline-none resize-none" /></section>}
      {value.comparison && <section className="bg-white rounded-xl shadow-lg p-6"><h3 className="text-lg font-semibold text-slate-800 mb-3">Сравнение</h3><pre className="text-xs whitespace-pre-wrap bg-slate-50 rounded-lg p-4 border border-slate-200 overflow-auto">{JSON.stringify(value.comparison, null, 2)}</pre></section>}
      {!value.reports?.length && !value.analyses?.length && !value.synthesis && !value.improvedRequirements && !value.comparison && <pre className="text-xs whitespace-pre-wrap bg-white rounded-xl shadow-lg p-6 overflow-auto">{JSON.stringify(value, null, 2)}</pre>}
      {metadata?.failedSteps?.length > 0 && <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">Неуспешных этапов: {metadata.failedSteps.length}</p>}
    </div>
  );
}

function ModelControls({ models, model, setModel, temperature, setTemperature }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Модель</span>
        <select value={model} onChange={(event) => setModel(event.target.value)} className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none">
          {models.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700 mb-1.5 block">Температура</span>
        <input type="number" min="0" max="2" step="0.1" value={temperature} onChange={(event) => setTemperature(event.target.value)} className="w-full h-10 px-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none" />
      </label>
    </div>
  );
}

function JobStateCard({ job, onCancel }) {
  if (!job) return null;
  if (job.status === 'SUCCEEDED') return null;
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

export default function AsyncJobWorkspace() {
  const [mode, setMode] = useState('DECOMPOSITION');
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
  const primaryModule = isDecomposition ? 'decomposer' : 'researcher';

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
    if (selected.mode) setMode(selected.mode === 'REQUIREMENTS_INSIGHTS' ? 'DECOMPOSITION' : selected.mode);
    setResult(null);
    setResultContent('');
    setRequirementsVersions([]);
    if (selected.status === 'SUCCEEDED') await loadResult(id);
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

  async function startResearchFromDecomposition({ requirements: nextRequirements, baseVersionId = null }) {
    const parentJobId = result?.jobId;
    if (!parentJobId) return;
    setVersionBusy(true);
    setError('');
    try {
      const saved = await enterpriseApi.saveRequirementsVersion({ sourceJobId: parentJobId, baseVersionId, requirements: nextRequirements, decisions: {} });
      const accepted = await enterpriseApi.createJob({
        type: 'RESEARCH',
        inputArtifactId: saved.versionId,
        parentJobId,
        options: { mode: 'REQUIREMENTS_INSIGHTS', model, temperature: Number(temperature), allCategories: true },
      });
      localStorage.setItem('reqai.activeJob', accepted.jobId);
      setMode('DECOMPOSITION');
      setRequirementsVersions((current) => [saved, ...current.filter((item) => item.versionId !== saved.versionId)]);
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
  const submitLabel = isDecomposition ? 'Декомпозировать требования' : mode === 'STANDARD_RESEARCH' ? 'Анализировать требования' : 'Запустить задачу';

  const commonInput = mode !== 'PROMPT_TEST' && (
    <>
      <label className="block mb-4">
        {!isDecomposition && <span className="text-lg font-semibold text-slate-700 mb-2 block">Введите бизнес-требования</span>}
        <textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder={isDecomposition ? 'Опишите бизнес-задачу...' : 'Например: Разработать приложение с функциями оплаты, отслеживания и программы лояльности...'} className={`w-full px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none bg-slate-50/50 ${isDecomposition ? 'h-32' : 'h-64'}`} />
      </label>
      <label className="inline-flex items-center gap-2 text-sm text-slate-500 cursor-pointer hover:text-blue-600">
        <FileUp className="w-4 h-4" /><span>{file ? file.name : 'Приложить файл до 100 МБ'}</span>
        <input aria-label="Файл требований" type="file" className="sr-only" onChange={(event) => setFile(event.target.files[0])} />
      </label>
    </>
  );

  const submitButton = (
    <button disabled={!canSubmit || busy || activeJob || (researchKinds.length === 0 && ['STANDARD_RESEARCH', 'AGENT_COMPARE'].includes(mode))} onClick={submit} className={`text-white py-3 px-6 rounded-lg font-semibold disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${isDecomposition ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-blue-600 hover:bg-blue-700'} ${isDecomposition ? '' : 'w-full'}`}>
      {busy ? <><Loader2 className="w-5 h-5 animate-spin" />Загрузка {Math.round(upload * 100)}%</> : activeJob ? <><Loader2 className="w-5 h-5 animate-spin" />{job.type === 'DECOMPOSITION' ? 'Декомпозиция выполняется…' : 'Исследование выполняется…'}</> : <>{isDecomposition ? <Sparkles className="w-4 h-4" /> : <Search className="w-5 h-5" />}{submitLabel}</>}
    </button>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center h-14 gap-6">
            <span className="text-sm font-bold text-gray-900 tracking-tight mr-4">ReqAI</span>
            <button onClick={() => setMode('DECOMPOSITION')} className={`h-14 px-1 text-sm font-medium border-b-2 transition-colors ${primaryModule === 'decomposer' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Бизнес-требования</button>
            <button onClick={() => setMode('STANDARD_RESEARCH')} className={`h-14 px-1 text-sm font-medium border-b-2 transition-colors ${primaryModule === 'researcher' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>Исследование рынка</button>
          </div>
        </div>
      </nav>

      {primaryModule === 'decomposer' ? (
        <main className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Бизнес требования</h1>
          <section className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
            <div className="text-xs font-semibold text-indigo-600 mb-1">ШАГ 1</div>
            <h2 className="text-lg font-bold text-gray-900 mb-4">Сформулируйте бизнес-задачу</h2>
            {commonInput}
            <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
              <p className="text-xs text-gray-400 max-w-lg">Сначала зафиксируйте цель бизнеса, затем разложите её на три типа требований. После этого можно запустить AI-Ресерчер для обогащения требований.</p>
              <div className="flex items-center gap-3">
                <select aria-label="Модель" value={model} onChange={(event) => setModel(event.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-indigo-500 focus:outline-none">{models.map((value) => <option key={value}>{value}</option>)}</select>
                {submitButton}
              </div>
            </div>
          </section>
          {error && <div className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 whitespace-pre-wrap">{error}</div>}
          <div className="space-y-6">
            <JobStateCard job={job} onCancel={() => enterpriseApi.cancelJob(job.jobId).then(() => load(job.jobId))} />
            {!job && <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center"><h3 className="text-base font-semibold text-gray-700 mb-2">Декомпозиция ещё не выполнена</h3><p className="text-sm text-gray-400">Нажмите «Декомпозировать требования», чтобы получить бизнес-, функциональные и нефункциональные требования.</p></div>}
            {result && <ResultPanel result={result} resultContent={resultContent} download={download} latestVersion={requirementsVersions[0] || null} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} busy={versionBusy} />}
          </div>
        </main>
      ) : (
        <main className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-50 to-slate-100 p-6">
          <div className="max-w-full mx-auto w-full">
            <div className="mb-8"><h1 className="text-3xl font-bold text-slate-800 mb-2">Исследователь бизнес-требований</h1><p className="text-slate-600">Анализ требований, выявление категорий и глубокое исследование рынка</p></div>
            <div className="mb-6 flex gap-2 flex-wrap">
              {RESEARCH_MODES.map(([key, label]) => <button key={key} onClick={() => setMode(key)} className={`px-4 py-2 rounded-lg font-semibold border-2 transition-colors ${mode === key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'}`}>{label}</button>)}
            </div>
            <div className="space-y-6">
              {mode !== 'MODEL_COMPARE' && <section className="bg-white rounded-xl shadow-lg p-4"><h3 className="text-lg font-semibold text-slate-800 mb-3">Модель и температура</h3><ModelControls models={models} model={model} setModel={setModel} temperature={temperature} setTemperature={setTemperature} /></section>}
              <section className="bg-white rounded-xl shadow-lg p-8">
                {mode === 'PROMPT_TEST' ? <>
                  <h3 className="text-xl font-semibold text-slate-800 mb-4">Тестирование промптов</h3>
                  <label className="block mb-6"><span className="text-sm font-semibold text-slate-700 mb-2 block">Системный промпт</span><textarea aria-label="Системный промпт" value={systemPrompt} onChange={(event) => setSystemPrompt(event.target.value)} placeholder="Вставьте системный промпт (role: system)..." className="w-full h-40 px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none" /></label>
                  <label className="block mb-6"><span className="text-sm font-semibold text-slate-700 mb-2 block">Запрос к LLM</span><textarea aria-label="Пользовательский промпт" value={userPrompt} onChange={(event) => setUserPrompt(event.target.value)} placeholder="Введите пользовательский промпт..." className="w-full h-40 px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none" /></label>
                </> : <>
                  <h3 className="text-xl font-semibold text-slate-800 mb-4">{MODE_LABELS[mode]}</h3>
                  {commonInput}
                </>}

                {['STANDARD_RESEARCH', 'AGENT_RESEARCH', 'AGENT_COMPARE'].includes(mode) && <div className="mt-6 space-y-4">
                  <label className="block"><span className="text-sm font-semibold text-slate-700 mb-2 block">Категории (необязательно, по одной на строку)</span><textarea value={categories} onChange={(event) => setCategories(event.target.value)} className="w-full h-24 px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-blue-500 focus:outline-none resize-none" /></label>
                  <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allCategories} onChange={(event) => setAllCategories(event.target.checked)} /> Все категории</label>
                  {(mode === 'STANDARD_RESEARCH' || mode === 'AGENT_COMPARE') && <div className="flex flex-wrap gap-4">{Object.entries(RESEARCH_KIND_LABELS).map(([kind, label]) => <label key={kind} className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={researchKinds.includes(kind)} onChange={(event) => setResearchKinds((current) => event.target.checked ? [...new Set([...current, kind])] : current.filter((item) => item !== kind))} />{label}</label>)}</div>}
                </div>}

                {mode === 'MODEL_COMPARE' && <div className="space-y-6">
                  <div className="mb-6 flex gap-2"><button onClick={() => setCompareTarget('CATEGORIES')} className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 ${compareTarget === 'CATEGORIES' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>Категории</button><button onClick={() => setCompareTarget('RESEARCH')} className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 ${compareTarget === 'RESEARCH' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>Исследование</button></div>
                  {commonInput}
                  {compareTarget === 'RESEARCH' && <label className="block mt-4"><span className="text-sm font-semibold text-slate-700 mb-2 block">Тип исследования</span><select value={researchKind} onChange={(event) => setResearchKind(event.target.value)} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg">{Object.entries(RESEARCH_KIND_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
                  <div className="grid gap-6 md:grid-cols-2">{[['A', variantA, setVariantA], ['B', variantB, setVariantB]].map(([label, value, setter]) => <fieldset key={label} className="border border-slate-200 rounded-lg p-4"><legend className="px-1 text-sm font-semibold text-slate-600">Вариант {label}</legend><label className="block mb-4"><span className="text-sm font-semibold text-slate-700 mb-2 block">Модель</span><select value={value.model} onChange={(event) => setter({ ...value, model: event.target.value })} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg">{models.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block"><span className="text-sm font-semibold text-slate-700 mb-2 block">Температура</span><input aria-label={`Температура ${label}`} type="number" min="0" max="2" step="0.1" value={value.temperature} onChange={(event) => setter({ ...value, temperature: Number(event.target.value) })} className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg" /></label></fieldset>)}</div>
                </div>}
                <div className="mt-6">{submitButton}</div>
                {error && <div className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</div>}
              </section>
              <JobStateCard job={job} onCancel={() => enterpriseApi.cancelJob(job.jobId).then(() => load(job.jobId))} />
              {result && <ResultPanel result={result} resultContent={resultContent} download={download} latestVersion={requirementsVersions[0] || null} onSaveRequirements={saveRequirementsVersion} onStartResearch={startResearchFromDecomposition} onSaveFinal={saveRequirementsVersion} busy={versionBusy} />}
            </div>
          </div>
        </main>
      )}

      <section className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-3"><Clock3 className="w-4 h-4 text-gray-400" /><h2 className="text-sm font-semibold text-gray-800">История задач</h2></div>
          {history.length === 0 ? <p className="text-sm text-gray-400">Задач пока нет.</p> : <div className="border border-gray-200 rounded-lg divide-y divide-gray-200 overflow-hidden">{history.map((item) => <button key={item.jobId} onClick={() => load(item.jobId)} className="w-full px-3 py-2.5 text-left hover:bg-indigo-50/60 transition-colors flex items-center justify-between gap-3"><span className="min-w-0 flex items-center gap-2 flex-wrap"><b className="text-sm text-gray-900">{MODE_LABELS[item.mode] || TYPE_LABELS[item.type] || item.mode || item.type}</b><span className="text-xs text-gray-500">{STATUS_LABELS[item.status] || item.status}</span>{item.outcome && <span className={`text-xs ${item.outcome === 'PARTIAL' ? 'text-amber-700' : 'text-emerald-700'}`}>{OUTCOME_LABELS[item.outcome] || item.outcome}</span>}</span><time className="text-xs text-gray-400 whitespace-nowrap">{new Date(item.createdAt).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</time></button>)}</div>}
          {cursor && <button onClick={async () => { const page = await enterpriseApi.listJobs({ limit: 20, cursor }); setHistory((current) => [...current, ...page.items]); setCursor(page.nextCursor); }} className="mt-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700">Загрузить ещё</button>}
        </div>
      </section>
    </div>
  );
}

function ResultPanel({ result, resultContent, download, latestVersion, onSaveRequirements, onStartResearch, onSaveFinal, busy }) {
  const embeddedInsights = safeJson(resultContent)?.mode === 'REQUIREMENTS_INSIGHTS';
  return (
    <section className="space-y-4">
      {!embeddedInsights && <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <div><h2 className="text-xl font-semibold text-slate-800">Результат</h2><p className={`text-sm mt-1 ${result.outcome === 'PARTIAL' ? 'text-amber-700' : 'text-emerald-700'}`}>{result.outcome}</p></div>
          {result.resultArtifactId && <button onClick={download} className="inline-flex items-center gap-2 px-4 py-2 border-2 border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:border-blue-400"><Download className="w-4 h-4" />Скачать JSON</button>}
        </div>
        {result.outcome === 'PARTIAL' && <div className="mt-4 flex gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3"><AlertTriangle className="w-5 h-5 shrink-0" /><p className="text-sm">Частичный результат: некоторые этапы завершились ошибкой.</p></div>}
      </div>}
      <ResultView key={`${result.jobId}:${latestVersion?.versionId || 'base'}`} metadata={result} content={resultContent || result.summary || ''} latestVersion={latestVersion} onSaveRequirements={onSaveRequirements} onStartResearch={onStartResearch} onSaveFinal={onSaveFinal} busy={busy} />
      <details className="bg-white rounded-xl shadow-lg p-6"><summary className="text-sm font-semibold text-slate-700 cursor-pointer">Модели и попытки</summary><ul className="text-sm mt-3 space-y-2 text-slate-600">{(result.modelAttempts || []).map((attempt, index) => <li key={index}>{attempt.stepId}: {attempt.requestedModel} → {attempt.model}, {attempt.result}{attempt.reasonCode ? ` (${attempt.reasonCode})` : ''}</li>)}</ul></details>
    </section>
  );
}
