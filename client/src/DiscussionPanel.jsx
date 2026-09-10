import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import { enterpriseApi } from './api/enterprise-api.js';

const statusLabel = {
  pending: 'Готовится ответ…',
  streaming: 'AI отвечает…',
  completed: '',
  failed: 'Ответ не завершён',
  cancelled: 'Ответ отменён',
};

function errorText(error) {
  if (error?.code === 'DISCUSSION_GENERATION_FAILED') {
    const reason = error.details?.reasonCode;
    if (['MODEL_HTTP_401', 'MODEL_HTTP_403'].includes(reason)) return 'Не удалось подключиться к AI: серверу отказано в доступе к модели. Нужно проверить настройки подключения.';
    if (reason === 'MODEL_TIMEOUT') return 'AI не успел ответить. Ваш вопрос сохранён — нажмите «Повторить ответ».';
    if (reason === 'MODEL_RATE_LIMIT') return 'AI временно перегружен. Ваш вопрос сохранён — повторите ответ немного позже.';
    return 'Не удалось получить ответ AI. Ваш вопрос сохранён — нажмите «Повторить ответ».';
  }
  if (error?.code === 'DISCUSSION_CONTEXT_LIMIT') return 'Связанные материалы не помещаются в лимит контекста. Сузьте вопрос или сохраните текущую редакцию.';
  if (error?.code === 'DISCUSSION_GENERATION_ACTIVE') return 'В этом обсуждении уже готовится ответ.';
  return error?.message || 'Не удалось загрузить обсуждение.';
}

export default function DiscussionPanel({ jobId, anchorId, anchorLabel = '', baseVersionId, draft, contextReady = true, contextError = '', readOnly = false, onClose, onApplyProposal, onRejectProposal }) {
  const panelRef = useRef(null);
  const [discussion, setDiscussion] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());
  const [staleProposal, setStaleProposal] = useState(false);
  const message = drafts[anchorId] || '';

  useEffect(() => {
    const previous = document.activeElement;
    const node = panelRef.current;
    const focusable = () => [...node?.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []];
    const first = () => focusable()[0] || node;
    requestAnimationFrame(() => first()?.focus());
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose?.(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); node?.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    node?.addEventListener('keydown', keyboard);
    return () => { node?.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, [anchorId, onClose]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    async function load() {
      if (!jobId || !anchorId) return;
      setLoading(true); setError(''); setDiscussion(null); setStaleProposal(false);
      try {
        let value;
        try { value = await enterpriseApi.getRequirementDiscussion(jobId, anchorId, { signal: controller.signal }); }
        catch (cause) {
          if (cause?.status !== 404) throw cause;
          if (readOnly) { if (!cancelled) setDiscussion({ messages: [], nextCursor: null }); return; }
          value = await enterpriseApi.openRequirementDiscussion(jobId, anchorId, { baseVersionId }, { signal: controller.signal });
        }
        if (!cancelled) setDiscussion(value);
      } catch (cause) { if (!cancelled) setError(controller.signal.aborted ? 'Сервер не отвечает. Проверьте, что приложение запущено, и повторите загрузку.' : errorText(cause)); }
      finally { clearTimeout(timeout); if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [jobId, anchorId, baseVersionId, readOnly, loadRevision]);

  useEffect(() => {
    if (!jobId || !anchorId || !discussion?.discussionId || readOnly || typeof enterpriseApi.subscribeRequirementDiscussionEvents !== 'function') return undefined;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const value = await enterpriseApi.getRequirementDiscussion(jobId, anchorId, { signal: controller.signal });
        if (!controller.signal.aborted) setDiscussion(value);
      } catch { /* the next event or reconnect will reconcile the panel */ }
    };
    void enterpriseApi.subscribeRequirementDiscussionEvents(jobId, anchorId, {
      signal: controller.signal,
      lastEventId: 0,
      onEvent: async (event) => {
        if (controller.signal.aborted) return;
        const data = event?.data || {};
        if (event?.type === 'attempt.started') {
          setDiscussion((current) => ({ ...(current || {}), attempt: { ...(current?.attempt || {}), ...data, status: 'running' } }));
        }
        if (['message.completed', 'attempt.failed', 'attempt.cancelled'].includes(event?.type)) await refresh();
      },
    }).catch(() => {});
    return () => controller.abort();
  }, [jobId, anchorId, discussion?.discussionId, readOnly]);

  async function send() {
    const value = message.trim();
    if (!value || readOnly || sending || !contextReady) return;
    setSending(true); setError('');
    try {
      const response = await enterpriseApi.sendRequirementDiscussionMessage(jobId, anchorId, { message: value, baseVersionId, draft });
      setDiscussion((current) => ({ ...(current || {}), ...response, messages: response.messages || [...(current?.messages || []), response.userMessage, response.assistantMessage].filter(Boolean) }));
      setStaleProposal(false);
      setDrafts((current) => ({ ...current, [anchorId]: '' }));
    } catch (cause) {
      if (cause?.details?.attemptId) {
        try {
          const saved = await enterpriseApi.getRequirementDiscussion(jobId, anchorId);
          setDiscussion(saved);
          setDrafts((current) => ({ ...current, [anchorId]: '' }));
        } catch { /* Keep the input if history could not be recovered. */ }
      }
      if (cause?.details?.attemptId) setDiscussion((current) => ({ ...(current || {}), attempt: { ...(current?.attempt || {}), attemptId: cause.details.attemptId, status: 'failed' } }));
      setError(errorText(cause));
    }
    finally { setSending(false); }
  }

  async function retry(attemptId) {
    setSending(true); setError('');
    try {
      const response = await enterpriseApi.retryRequirementDiscussion(jobId, attemptId);
      setDiscussion((current) => ({ ...(current || {}), ...response, messages: response.messages || current?.messages || [] }));
    } catch (cause) { setError(errorText(cause)); }
    finally { setSending(false); }
  }

  async function cancelAttempt(attemptId) {
    try {
      const response = await enterpriseApi.cancelRequirementDiscussion(jobId, attemptId);
      setDiscussion((current) => {
        const assistantMessageId = current?.attempt?.assistantMessageId || current?.assistantMessage?.messageId;
        return { ...(current || {}), attempt: { ...(current?.attempt || {}), ...response, status: 'cancelled' }, messages: (current?.messages || []).map((item) => item.messageId === assistantMessageId ? { ...item, status: 'cancelled' } : item) };
      });
    } catch (cause) { setError(errorText(cause)); }
  }

  if (!anchorId) return null;
  const messages = discussion?.messages || [];
  const activeAttempt = discussion?.attempt && ['running', 'pending', 'streaming'].includes(discussion.attempt.status);
  const retryableAttempt = discussion?.attempt && ['failed', 'cancelled'].includes(discussion.attempt.status) ? discussion.attempt : null;
  return <div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label={`Обсуждение ${anchorId}`}>
    <button type="button" aria-label="Закрыть обсуждение" onClick={onClose} className="absolute inset-0 bg-slate-950/30" />
    <aside ref={panelRef} tabIndex={-1} className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl outline-none">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600"><MessageCircle className="h-4 w-4" />Контекстное обсуждение</p><h2 className="mt-1 break-words text-lg font-bold text-slate-900"><span>{anchorId}</span>{anchorLabel && <span className="ml-2 font-normal text-slate-700">{anchorLabel}</span>}</h2><p className="mt-1 text-xs text-slate-500">Задавайте вопросы по этой записи. AI учитывает связанные требования и вопросы для уточнения.</p></div>
        <button type="button" aria-label="Закрыть обсуждение" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем историю…</p>}
        {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{!discussion && !loading && <button type="button" onClick={() => setLoadRevision((value) => value + 1)} className="mt-2 block font-semibold underline">Повторить загрузку</button>}</div>}
        {contextError && <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{contextError}</div>}
        {discussion?.contextSummary && <details className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-700">Что учитывает AI</summary><div className="mt-2 space-y-1 text-xs text-slate-600"><p>Версия: {discussion.contextSummary.baseVersionId || 'текущий черновик'}</p><p>Включены записи: {(discussion.contextSummary.manifest?.includedIds || []).join(', ') || '—'}</p><p>Размер: {discussion.contextSummary.includedBytes || 0} байт</p><p>Несохранённая редакция: {discussion.contextSummary.unsavedDraft ? 'да' : 'нет'}</p>{discussion.contextSummary.omitted?.length > 0 && <p>Исключено: {discussion.contextSummary.omitted.join(', ')}</p>}</div></details>}
        {retryableAttempt && <button type="button" onClick={() => retry(retryableAttempt.attemptId)} className="mb-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700">Повторить ответ</button>}
        {!loading && !messages.length && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">{readOnly ? 'История пуста.' : 'Спросите, что нужно уточнить, попросите объяснить требование или предложить новую формулировку.'}</p>}
        <div className="space-y-3">
          {messages.map((item) => <article key={item.messageId || `${item.role}-${item.createdAt}`} className={`rounded-xl border p-3 ${item.role === 'user' ? 'ml-6 border-indigo-100 bg-indigo-50/60' : 'mr-2 border-slate-200 bg-slate-50'}`}>
            <p className="text-xs font-semibold text-slate-500">{item.role === 'user' ? 'Вы' : 'AI'}{statusLabel[item.status] ? ` · ${statusLabel[item.status]}` : ''}</p>
            {item.text && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{item.text}</p>}
          </article>)}
        </div>
        {discussion?.proposal && <section className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" aria-label="Предложение изменений">
          <h3 className="text-sm font-semibold text-emerald-900">Предложение изменений · {discussion.proposal.changes.length}</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-950">{discussion.proposal.explanation}</p>
          <div className="mt-3 space-y-2">{discussion.proposal.changes.map((change) => <div key={change.targetId} className="rounded-lg border border-emerald-100 bg-white p-2 text-xs"><p className="font-semibold text-slate-700">{change.targetId}</p>{Object.keys(change.after).map((field) => <div key={field} className="mt-1 grid gap-1 sm:grid-cols-2"><span className="break-words text-slate-500">Было: {change.before[field] || '—'}</span><span className="break-words text-slate-800">Станет: {change.after[field] || '—'}</span></div>)}</div>)}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={readOnly || staleProposal || applied.has(discussion.proposal.proposalId) || rejected.has(discussion.proposal.proposalId)} onClick={() => { const ok = onApplyProposal?.(discussion.proposal); if (ok !== false) setApplied((current) => new Set(current).add(discussion.proposal.proposalId)); else setStaleProposal(true); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{applied.has(discussion.proposal.proposalId) ? 'Принято в черновик' : staleProposal ? 'Предложение устарело' : 'Применить к черновику'}</button>
            <button type="button" disabled={readOnly || applied.has(discussion.proposal.proposalId) || rejected.has(discussion.proposal.proposalId)} onClick={() => { const ok = onRejectProposal?.(discussion.proposal); if (ok !== false) setRejected((current) => new Set(current).add(discussion.proposal.proposalId)); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:bg-slate-200">{rejected.has(discussion.proposal.proposalId) ? 'Пакет отклонён' : 'Отклонить пакет'}</button>
          </div>
          <p className="mt-2 text-xs text-emerald-900">Применение не закрывает GAP и не сохраняет версию автоматически.</p>
        </section>}
      </div>
      <footer className="border-t border-slate-200 px-5 py-4">
        {activeAttempt && <button type="button" onClick={() => cancelAttempt(discussion.attempt.attemptId)} className="mb-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Отменить генерацию</button>}
        <textarea aria-label={`Сообщение для ${anchorId}`} disabled={readOnly || sending} rows={3} value={message} onChange={(event) => setDrafts((current) => ({ ...current, [anchorId]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} placeholder="Задайте вопрос по записи…" className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100" />
        <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Ctrl/⌘ + Enter отправляет сообщение.</p><button type="button" disabled={readOnly || sending || !message.trim() || activeAttempt || !contextReady} onClick={send} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Отправить</button></div>
      </footer>
    </aside>
  </div>;
}
