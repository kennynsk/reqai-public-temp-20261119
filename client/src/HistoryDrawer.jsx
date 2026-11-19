import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { enterpriseApi } from './api/enterprise-api.js';
import { primaryStatus, STATUS_LABELS } from './task-execution-presentation.js';

const retired = new Set(['DECOMPOSITION_WITH_INSIGHTS', 'STANDARD_RESEARCH', 'AGENT_RESEARCH', 'MODEL_COMPARE', 'AGENT_COMPARE', 'PROMPT_TEST']);
const label = (item) => item.title || (retired.has(item.mode) ? 'Архивная задача' : item.mode === 'REQUIREMENTS_INSIGHTS' ? 'AI-исследование требований' : item.type === 'RESEARCH' ? 'Исследование' : 'Подготовка требований');

export default function HistoryDrawer({ open, onClose, activeJobId, onSelect, refreshKey = 0 }) {
  const drawer = useRef(null);
  const request = useRef(0);
  const [query, setQuery] = useState({ q: '', type: '', status: '' });
  const [page, setPage] = useState({ items: [], nextCursor: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fetchPage = useCallback(async (cursor = null, signal) => {
    const sequence = ++request.current;
    setLoading(true); setError('');
    try {
      const result = await enterpriseApi.listJobs({ limit: 20, groupBy: 'workflow', ...Object.fromEntries(Object.entries(query).filter(([, value]) => value)), ...(cursor ? { cursor } : {}) }, { signal });
      if (sequence !== request.current || signal?.aborted) return;
      setPage((previous) => ({ ...result, items: cursor ? [...previous.items, ...result.items.filter((item) => !previous.items.some((old) => old.jobId === item.jobId))] : result.items }));
    } catch (failure) {
      if (sequence === request.current && failure.name !== 'AbortError') setError('Историю не удалось загрузить. Попробуйте ещё раз.');
    } finally { if (sequence === request.current && !signal?.aborted) setLoading(false); }
  }, [query]);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    const pending = request;
    const timer = window.setTimeout(() => fetchPage(null, controller.signal), query.q ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); pending.current++; };
  }, [open, query, fetchPage, refreshKey]);
  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement;
    const nodes = () => [...drawer.current.querySelectorAll('aside button:not(:disabled), aside input:not(:disabled), aside select, aside summary, aside a[href]')];
    nodes()[0]?.focus();
    const key = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const elements = nodes().filter((node) => !node.closest('details:not([open])') || node.tagName === 'SUMMARY');
      if (event.shiftKey && document.activeElement === elements[0]) { event.preventDefault(); elements.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === elements.at(-1)) { event.preventDefault(); elements[0]?.focus(); }
    };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); if (previous?.isConnected) previous.focus(); };
  }, [open, onClose]);
  const filter = (name, value) => { request.current++; setQuery((current) => ({ ...current, [name]: value })); setPage({ items: [], nextCursor: null }); setLoading(true); };
  if (!open) return null;
  return <div ref={drawer} className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="История задач">
    <button tabIndex={-1} aria-label="Закрыть историю" onClick={onClose} className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" />
    <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
      <div className="p-5 border-b flex items-center justify-between"><h2 className="font-bold">История задач</h2><button aria-label="Закрыть" onClick={onClose} className="p-2 rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-500"><X className="w-5 h-5" /></button></div>
      <div className="p-4 space-y-3 border-b"><label className="block text-sm font-semibold">Поиск по названию и контексту<input type="search" maxLength={200} value={query.q} onChange={(event) => filter('q', event.target.value)} className="reqai-control w-full mt-1 rounded-lg border p-2.5 font-normal" /></label>
        <div role="group" aria-label="Фильтр истории" className="flex flex-wrap gap-2">{[['', 'Все'], ['DECOMPOSITION', 'Декомпозиция'], ['RESEARCH', 'Исследования']].map(([value, name]) => <button key={value} aria-pressed={query.type === value} onClick={() => filter('type', value)} className={`px-3 py-2 rounded-lg text-xs font-semibold ${query.type === value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700'}`}>{name}</button>)}</div>
        <label className="flex gap-2 items-center text-sm">Статус<select value={query.status} onChange={(event) => filter('status', event.target.value)} className="reqai-control border rounded-lg p-2 flex-1"><option value="">Любой</option>{Object.entries(STATUS_LABELS).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-busy={loading}>
        {page.indexingPending && <p role="status" className="text-sm p-3 bg-amber-50 text-amber-900 rounded-lg">Поиск ещё обновляется: часть старых задач может не находиться. Они доступны без поискового запроса.</p>}
        {error && <div role="alert"><p className="text-sm text-red-700">{error}</p><button onClick={() => fetchPage()} className="p-2 text-indigo-700 underline">Повторить загрузку</button></div>}
        {!loading && !error && !page.items.length && <p className="text-sm text-slate-500 py-8 text-center">Задачи не найдены. Измените поиск или фильтры.</p>}
        {page.items.map((item) => <article key={item.jobId} className={`rounded-xl border p-3 ${[item.jobId, ...(item.children || []).map((child) => child.jobId)].includes(activeJobId) ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}>
          <button aria-current={activeJobId === item.jobId ? 'true' : undefined} onClick={() => onSelect(item.jobId)} className="w-full text-left rounded-lg p-1 focus-visible:ring-2 focus-visible:ring-indigo-500"><p className="reqai-title-clamp font-semibold text-slate-900 break-words">{label(item)}</p>{item.contextExcerpt && item.contextExcerpt !== item.title && <p className="reqai-excerpt-clamp text-sm text-slate-600 mt-1">{item.contextExcerpt}</p>}<p className="text-xs text-slate-600 mt-2"><span>{primaryStatus(item).label}</span> · {new Date(item.createdAt).toLocaleDateString('ru-RU')}</p></button>
          {Boolean(item.children?.length || item.savedVersions?.length) && <details className="mt-2"><summary className="p-2 text-sm text-indigo-700 cursor-pointer rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-500">Этапы задачи</summary><div className="border-l border-indigo-200 ml-2 pl-3 space-y-1">
            {(item.children || []).map((child, index) => <button key={child.jobId} aria-current={activeJobId === child.jobId ? 'true' : undefined} onClick={() => onSelect(child.jobId, { finalResearch: 'history' })} className="block p-2 text-sm text-left rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-500">AI-исследование {index + 1} · {primaryStatus(child).label}</button>)}
            {(item.savedVersions || []).slice(0, 1).map((version) => <p key={version.versionId} className="p-2 text-xs text-slate-600">{version.final ? 'Финальная версия сохранена' : 'Проверенная версия сохранена'} · {new Date(version.createdAt).toLocaleDateString('ru-RU')}</p>)}
          </div></details>}
        </article>)}
        {loading && <p role="status" className="text-sm text-slate-600 p-3">Загружаем историю…</p>}
      </div>
      {page.nextCursor && <div className="p-4 border-t"><button disabled={loading} onClick={() => fetchPage(page.nextCursor)} className="w-full p-3 border rounded-xl text-indigo-700 disabled:opacity-50">Загрузить ещё</button></div>}
    </aside>
  </div>;
}
