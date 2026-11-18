import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Download, X } from 'lucide-react';
import { enterpriseApi } from './api/enterprise-api.js';
import { isolateModal } from './modal-layer.js';
import { CODE_MESSAGES, formatDuration, supportText } from './task-execution-presentation.js';

const TRACE_TONES = { RUNNING: 'bg-indigo-100 text-indigo-700', COMPLETED: 'bg-emerald-100 text-emerald-700', SUCCEEDED: 'bg-emerald-100 text-emerald-700', FAILED: 'bg-red-100 text-red-700' };
const CONNECTION_LABELS = { disconnected: 'Связь с сервером прервалась', connected: 'Связь с сервером установлена', reconnect: 'Браузер восстанавливает связь', reconcile: 'Браузер сверяет состояние задачи', 'parse-error': 'Браузер не смог прочитать обновление' };
const DETAIL_LABELS = { NOT_RECORDED: 'не записаны', EXPIRED: 'срок хранения истёк', REDACTED: 'скрыты политикой доступа' };
const EVENT_LABELS = {
  validate: 'Проверка входных данных',
  'plan-chunks': 'Подготовка материалов',
  'decompose-chunk': 'Генерация требований',
  'merge-decomposition': 'Сборка черновика',
  'requirements-insights': 'AI-исследование',
  'recover-requirements': 'Сохранение частичного результата',
  'BABOK audit started': 'Независимая проверка началась',
  'BABOK audit accepted': 'Независимая проверка пройдена',
  'BABOK audit rejected': 'Ответ независимой проверки отклонён',
  'BABOK audit skipped': 'Независимая проверка пропущена',
  'BABOK audit response contract repair': 'Повтор независимой проверки',
  'BABOK semantic correction required': 'Требуется исправить формулировки',
  'Task completed': 'Задача завершена',
  'Task failed': 'Задача завершилась с ошибкой',
};
const timeOf = (date) => date ? new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
const traceError = (error) => [401, 403].includes(error?.status) ? 'Нет доступа к этим сведениям.' : 'Не удалось загрузить сведения о выполнении. Попробуйте обновить.';

function TraceEntry({ entry, detail, expanded, onToggle }) {
  const labels = entry.source === 'CLIENT_LOCAL' ? CONNECTION_LABELS : EVENT_LABELS;
  const label = Object.hasOwn(labels, entry.name) ? labels[entry.name] : null;
  const issues = entry.metadata?.issues ?? entry.metadata?.details?.issues ?? entry.metadata?.summary?.details?.issues;
  const issue = Array.isArray(issues) ? issues.find((item) => typeof item?.code === 'string' && Object.hasOwn(CODE_MESSAGES, item.code)) : null;
  const reasonCode = issue?.code || entry.metadata?.reasonCode || entry.metadata?.summary?.reasonCode;
  const reason = typeof reasonCode === 'string' && Object.hasOwn(CODE_MESSAGES, reasonCode) ? CODE_MESSAGES[reasonCode] : null;
  return <li className="rounded-lg border border-slate-200 bg-white">
    <button type="button" aria-expanded={expanded} onClick={onToggle} className="w-full rounded-lg p-3 text-left focus-visible:outline-indigo-500">
      <div className="flex justify-between gap-2">
        <div className="min-w-0 break-words">
          <span className="mr-2 font-semibold text-slate-800">{label || entry.name}</span>
          <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${TRACE_TONES[entry.status] || 'bg-slate-100 text-slate-600'}`}>{entry.status}</span>
          {entry.source === 'CLIENT_LOCAL' && <span className="ml-2 text-xs text-violet-700">текущая вкладка</span>}
          {reason && <p className="mt-1 text-xs text-slate-700">{reason}</p>}
          <p className="mt-1 text-xs text-slate-500">{entry.category}{entry.stepId && ` · ${entry.stepId}`}{reason && ` · ${reasonCode}`}</p>
        </div>
        <div className="shrink-0 text-right text-xs text-slate-500"><time>{timeOf(entry.startedAt)}</time><p>{formatDuration(entry.durationMs)}</p></div>
      </div>
    </button>
    {expanded && <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3">
      {label && <code className="block break-words text-xs text-slate-600">{entry.name}</code>}
      <p className="text-xs text-slate-600">Детали: {DETAIL_LABELS[detail?.state || entry.detail?.state] || detail?.state || entry.detail?.state || '—'}</p>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(detail?.content ?? detail ?? entry.metadata ?? {}, null, 2)}</pre>
    </div>}
  </li>;
}

export default function TaskExecutionPanel(props) {
  return props.open ? <OpenTaskExecutionPanel key={props.jobId} {...props} /> : null;
}

function OpenTaskExecutionPanel({ onClose, job, jobId, observations = [], refreshKey, triggerRef, onDownload }) {
  const panelRef = useRef(null);
  const request = useRef(0);
  const pageCount = useRef(1);
  const traceRef = useRef(null);
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState({});
  const [details, setDetails] = useState({});
  const [copyState, setCopyState] = useState('');
  const close = useEffectEvent(onClose);

  const load = useCallback(async (append = false) => {
    if (!jobId) return;
    const current = traceRef.current;
    const requestId = ++request.current;
    setLoading(true);
    setError('');
    try {
      let cursor = append ? current.nextCursor : null;
      let page;
      const pages = [];
      for (let i = 0; i < (append ? 1 : pageCount.current); i++) {
        page = await enterpriseApi.getJobTrace(jobId, { cursor, limit: 50 });
        if (requestId !== request.current) return;
        pages.push(page);
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      const items = [...(append ? current.timeline : []), ...pages.flatMap((value) => value.timeline || [])];
      const next = { ...page, timeline: [...new Map(items.map((entry) => [entry.id, entry])).values()] };
      traceRef.current = next;
      pageCount.current = append ? pageCount.current + 1 : pages.length;
      setTrace(next);
    } catch (cause) {
      if (requestId === request.current) setError(traceError(cause));
    } finally {
      if (requestId === request.current) setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    load();
    return () => { request.current += 1; };
  }, [load, refreshKey]);

  useEffect(() => {
    const node = panelRef.current;
    const previous = triggerRef?.current || document.activeElement;
    const release = isolateModal(node);
    const handleKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key !== 'Tab') return;
      const controls = [...node.querySelectorAll('button:not(:disabled),textarea')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    node.querySelector('button')?.focus();
    return () => { window.removeEventListener('keydown', handleKey); release(); previous?.focus(); };
  }, [triggerRef]);

  async function toggle(entry) {
    setExpanded((current) => ({ ...current, [entry.id]: !current[entry.id] }));
    if (expanded[entry.id] || details[entry.id] || entry.source !== 'TRACE' || entry.detail?.state !== 'AVAILABLE') return;
    try {
      const value = await enterpriseApi.getJobTraceDetail(jobId, entry.id);
      setDetails((current) => ({ ...current, [entry.id]: value }));
    } catch (cause) { setDetails((current) => ({ ...current, [entry.id]: { state: 'ERROR', message: traceError(cause) } })); }
  }

  const localEntries = observations.map((item, index) => ({
    id: `client:${index}:${item.timestamp}`, source: 'CLIENT_LOCAL', category: 'SSE', name: item.type,
    status: 'INFO', startedAt: item.timestamp, durationMs: 0, metadata: item, detail: { state: 'NOT_RECORDED' },
  }));
  const entries = [...(trace?.timeline || []), ...localEntries].sort((a, b) => new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
  const support = supportText(trace || job || { jobId }, trace?.executionSummary?.stages || []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(support);
      setCopyState('done');
    } catch { setCopyState('manual'); }
  }

  return createPortal(<div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label="Журнал задачи">
    <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-slate-950/35" />
    <aside ref={panelRef} className="absolute inset-y-0 right-0 flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl lg:max-w-2xl">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Журнал задачи</h2>
        <button type="button" aria-label="Закрыть" onClick={onClose} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 focus-visible:outline-indigo-500"><X className="size-5" /></button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-5">
        <button type="button" disabled={loading || !jobId} onClick={() => load()} className="rounded-md border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Обновить</button>
        {support && <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 px-2.5 py-2 text-xs font-semibold text-indigo-700"><Copy aria-hidden="true" className="size-3.5" />Скопировать для поддержки</button>}
        {onDownload && <button type="button" onClick={onDownload} className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700"><Download aria-hidden="true" className="size-3.5" />Скачать результат JSON</button>}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {copyState === 'done' && <p role="status" className="text-sm text-slate-700">Сведения скопированы.</p>}
        {copyState === 'manual' && <label className="block text-xs text-slate-700">Браузер не разрешил копирование. Выделите сводку вручную.
          <textarea aria-label="Сводка для ручного копирования" readOnly value={support} rows={5} className="mt-1 w-full rounded-md border border-slate-200 p-2" />
        </label>}
        {entries.length > 0 ? <ol aria-label="Хронология выполнения задачи" className="space-y-2">
          {entries.map((entry) => <TraceEntry key={entry.id} entry={entry} detail={details[entry.id]} expanded={Boolean(expanded[entry.id])} onToggle={() => toggle(entry)} />)}
        </ol> : <p className="text-sm text-slate-600">{loading ? 'Загружаем журнал…' : 'События пока не записаны.'}</p>}
        {trace?.nextCursor && <button type="button" disabled={loading} onClick={() => load(true)} className="w-full rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Загрузить ещё</button>}
      </div>
    </aside>
  </div>, document.body);
}
