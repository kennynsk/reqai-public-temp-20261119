import { useReviewUiState } from './review-state.js';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Send, X } from 'lucide-react';
import DiscussionProposal from './DiscussionProposal.jsx';
import { enterpriseApi } from './api/enterprise-api.js';

const SafeMarkdown = lazy(() => import('./SafeMarkdown.jsx'));

function MessageText({ role, text }) {
  if (role !== 'assistant') return <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{text}</p>;
  return <div className="mt-1 break-words text-sm text-slate-800 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"><Suspense fallback={<p className="my-2 text-sm text-slate-500">Форматируем ответ…</p>}><SafeMarkdown chat>{text}</SafeMarkdown></Suspense></div>;
}

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
  if (error?.code === 'DISCUSSION_VERSION_REQUIRED') return 'Сначала сохраните требования, чтобы открыть AI-обсуждение.';
  return error?.message || 'Не удалось загрузить обсуждение.';
}

export default function DiscussionPanel({ jobId, anchorId, anchorLabel = '', baseVersionId, draft, contextReady = true, contextError = '', readOnly = false, onClose, onApplyProposal, onRejectProposal, proposalDecisions, savedProposalDecisions = {}, gapStates = {}, savedGapStates = {}, onSave, hasUnsavedChanges = false, onSaveContext, savingContext = false, embedded = false, active = true }) {
  const panelRef = useRef(null);
  const latestMessageRef = useRef(null);
  const sendLock = useRef(false);
  const focusAfterSend = useRef(false);
  const pendingMessage = useRef(null);
  const requestScope = useRef(`${jobId}:${anchorId}:${baseVersionId}`);
  useEffect(() => { requestScope.current = `${jobId}:${anchorId}:${baseVersionId}`; }, [jobId, anchorId, baseVersionId]);
  const guided = anchorId?.startsWith('GAP-');
  const [discussion, setDiscussion] = useState(null);
  const [drafts, setDrafts, draftStorageError] = useReviewUiState('discussionMessages', {}, { persist: true });
  const [loading, setLoading] = useState(true);
  const [loadRevision, setLoadRevision] = useState(0);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!sending && focusAfterSend.current) {
      focusAfterSend.current = false;
      panelRef.current?.querySelector('textarea:not(:disabled)')?.focus();
    }
  }, [sending]);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(new Set());
  const [rejected, setRejected] = useState(new Set());
  const [staleProposal, setStaleProposal] = useState(false);
  const message = drafts[anchorId] || '';
  const answer = gapStates[anchorId]?.answer?.trim() || '';
  const answerSaved = Boolean(answer && answer === savedGapStates[anchorId]?.answer?.trim());
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const latestMessageId = discussion?.messages?.at(-1)?.messageId;
  useEffect(() => { latestMessageRef.current?.scrollIntoView?.({ block: 'start' }); }, [latestMessageId]);

  useEffect(() => {
    if (embedded) return;
    const previous = document.activeElement;
    const node = panelRef.current;
    const focusable = () => [...node?.querySelectorAll('button:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || []];
    const first = () => focusable()[0] || node;
    const frame = requestAnimationFrame(() => { if (!node?.contains(document.activeElement)) first()?.focus(); });
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current?.(); return; }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); node?.focus(); return; }
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    node?.addEventListener('keydown', keyboard);
    return () => { cancelAnimationFrame(frame); node?.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, [anchorId, embedded]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    async function load() {
      if (!jobId || !anchorId || !active) { setLoading(false); return; }
      setLoading(true); setError(''); setDiscussion(null); setStaleProposal(false);
      try {
        let value;
        try { value = await enterpriseApi.getRequirementDiscussion(jobId, anchorId, { signal: controller.signal }); }
        catch (cause) {
          if (cause?.status !== 404) throw cause;
          // Without a saved base version the discussion cannot be created; the
          // contextError banner explains the prerequisite instead of a doomed request.
          if (readOnly || !baseVersionId) { if (!cancelled) setDiscussion({ messages: [], nextCursor: null }); return; }
          value = await enterpriseApi.openRequirementDiscussion(jobId, anchorId, { baseVersionId }, { signal: controller.signal });
        }
        if (!cancelled) setDiscussion(value);
      } catch (cause) { if (!cancelled) setError(controller.signal.aborted ? 'Сервер не отвечает. Проверьте, что приложение запущено, и повторите загрузку.' : errorText(cause)); }
      finally { clearTimeout(timeout); if (!cancelled) setLoading(false); }
    }
    load();
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [jobId, anchorId, baseVersionId, readOnly, loadRevision, active]);

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
        // Events are replayed on reconnect, including starts of older attempts.
        // Only the server's latest attempt identifies a cancellable generation.
        if (event?.type === 'attempt.started') await refresh();
        if (event?.type === 'reconcile') setDiscussion(data);
        if (['message.completed', 'attempt.failed', 'attempt.cancelled'].includes(event?.type)) await refresh();
      },
    }).catch(() => {});
    return () => controller.abort();
  }, [jobId, anchorId, discussion?.discussionId, readOnly]);

  async function send(prepared) {
    const value = (typeof prepared === 'string' ? prepared : message).trim();
    if (!value || readOnly || sendLock.current || sending || loading || !contextReady || ['running', 'pending', 'streaming'].includes(discussion?.attempt?.status)) return;
    const scope = `${jobId}:${anchorId}:${baseVersionId}`;
    const fingerprint = JSON.stringify({ jobId, anchorId, message: value, baseVersionId, draft });
    if (pendingMessage.current?.fingerprint !== fingerprint) pendingMessage.current = { fingerprint, id: crypto.randomUUID() };
    const clientMessageId = pendingMessage.current.id;
    sendLock.current = true;
    setDiscussion((current) => current ? { ...current, proposal: null, attempt: null } : current);
    setSending(true); setError('');
    try {
      const response = await enterpriseApi.sendRequirementDiscussionMessage(jobId, anchorId, { message: value, baseVersionId, draft, clientMessageId }, clientMessageId);
      if (requestScope.current !== scope) return;
      pendingMessage.current = null;
      setDiscussion((current) => ({ ...(current || {}), ...response, messages: response.messages || [...(current?.messages || []), response.userMessage, response.assistantMessage].filter(Boolean) }));
      setStaleProposal(false);
      setDrafts((current) => ({ ...current, [anchorId]: '' }));
    } catch (cause) {
      if (requestScope.current !== scope) return;
      if (cause?.details?.attemptId) {
        try {
          const saved = await enterpriseApi.getRequirementDiscussion(jobId, anchorId);
          if (requestScope.current !== scope) return;
          setDiscussion(saved);
          setDrafts((current) => ({ ...current, [anchorId]: '' }));
        } catch { /* Keep the input if history could not be recovered. */ }
      }
      if (cause?.details?.attemptId) setDiscussion((current) => ({ ...(current || {}), attempt: { ...(current?.attempt || {}), attemptId: cause.details.attemptId, status: 'failed' } }));
      setError(errorText(cause));
    }
    finally {
      sendLock.current = false;
      focusAfterSend.current = requestScope.current === scope;
      setSending(false);
    }
  }

  async function retry(attemptId) {
    if (sendLock.current || readOnly || !contextReady) return;
    sendLock.current = true;
    const scope = `${jobId}:${anchorId}:${baseVersionId}`;
    setSending(true); setError('');
    try {
      const response = await enterpriseApi.retryRequirementDiscussion(jobId, attemptId);
      if (requestScope.current !== scope) return;
      setDiscussion((current) => ({ ...(current || {}), ...response, messages: response.messages || current?.messages || [] }));
    } catch (cause) { if (requestScope.current === scope) setError(errorText(cause)); }
    finally { sendLock.current = false; setSending(false); }
  }

  async function cancelAttempt(attemptId) {
    try {
      const response = await enterpriseApi.cancelRequirementDiscussion(jobId, attemptId);
      setDiscussion((current) => {
        const assistantMessageId = current?.attempt?.assistantMessageId || current?.assistantMessage?.messageId;
        if (current?.attempt?.attemptId !== attemptId) return current;
        return { ...(current || {}), attempt: { ...current.attempt, ...response }, messages: (current?.messages || []).map((item) => response.status === 'cancelled' && item.messageId === assistantMessageId ? { ...item, status: 'cancelled' } : item) };
      });
      if (response.status !== 'cancelled') setError('Ответ уже завершился до отмены. Требования не изменены; предложение можно проверить отдельно.');
    } catch (cause) { setError(errorText(cause)); }
  }

  if (!anchorId) return null;
  const messages = discussion?.messages || [];
  const activeAttempt = discussion?.attempt && ['running', 'pending', 'streaming'].includes(discussion.attempt.status);
  const proposal = discussion?.proposal;
  const decision = proposalDecisions?.[proposal?.proposalId];
  const proposalApplied = proposalDecisions ? decision?.decision === 'accepted' && !decision.discarded : applied.has(proposal?.proposalId);
  const proposalRejected = proposalDecisions ? decision?.decision === 'rejected' : rejected.has(proposal?.proposalId);
  const retryableAttempt = discussion?.attempt && ['failed', 'cancelled'].includes(discussion.attempt.status) ? discussion.attempt : null;
  return <div className={embedded ? "flex min-h-0 flex-1 flex-col" : "fixed inset-0 z-[95]"} role={embedded ? undefined : "dialog"} aria-modal={embedded ? undefined : "true"} aria-label={`Обсуждение ${anchorId}`}>
    {!embedded && <button type="button" aria-label="Закрыть обсуждение" onClick={onClose} className="absolute inset-0 bg-slate-950/30" />}
    <aside ref={panelRef} tabIndex={-1} className={embedded ? "flex min-h-0 flex-1 flex-col bg-white outline-hidden" : "absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl outline-hidden"}>
      {!embedded && <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-600"><MessageCircle className="h-4 w-4" />{guided ? 'Уточнение вопроса с AI' : 'Контекстное обсуждение'}</p><h2 title={anchorLabel} className="mt-1 line-clamp-3 break-words text-lg font-bold text-slate-900"><span>{anchorId}</span>{!embedded && anchorLabel && <span className="ml-2 font-normal text-slate-700">{anchorLabel}</span>}</h2>{!embedded && <p className="mt-1 text-xs text-slate-500">{guided ? 'Разберём недостающие решения, затем проверим правки требований и результат уточнения.' : 'Задавайте вопросы по этой записи. AI учитывает связанные требования и вопросы для уточнения.'}</p>}</div>
        <button type="button" aria-label="Закрыть обсуждение" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><X className="h-5 w-5" /></button>
      </header>}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {guided && <section aria-label="Ваш ответ на вопрос" className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-sm">
          <p className="font-semibold text-slate-900">Ваш ответ · {answer ? answerSaved ? 'сохранён в версии' : 'в черновике' : 'ещё не зафиксирован'}</p>
          {answer ? <p className="mt-2 whitespace-pre-wrap break-words text-slate-700">{answer}</p> : <p className="mt-2 text-slate-600">Напишите, что уже знаете, в сообщении ниже. После обсуждения проверьте и примите уточнение — оно зафиксирует ваш ответ.</p>}
          <p className="mt-2 text-xs text-slate-600">Ответ → проверка уточнения → принятие → сохранение версии. Переписка с AI сама по себе не меняет требования.</p>
        </section>}
        {loading && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загружаем историю…</p>}
        {error && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}{!discussion && !loading && <button type="button" onClick={() => setLoadRevision((value) => value + 1)} className="mt-2 block font-semibold underline">Повторить загрузку</button>}</div>}
        {contextError && <div role="status" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{contextError}{onSaveContext && <button type="button" disabled={savingContext} onClick={() => onSaveContext()} className="mt-2 block rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingContext ? 'Сохраняем…' : 'Сохранить и начать уточнение'}</button>}</div>}
        {discussion?.contextSummary && <details className="mb-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-700">Что учитывает AI</summary><div className="mt-2 space-y-1 text-xs text-slate-600"><p>Включены записи: {(discussion.contextSummary.manifest?.includedIds || []).join(', ') || '—'}</p><p>Несохранённая редакция: {discussion.contextSummary.unsavedDraft ? 'да' : 'нет'}</p>{discussion.contextSummary.omitted?.length > 0 && <p>Исключено: {discussion.contextSummary.omitted.join(', ')}</p>}</div></details>}
        {retryableAttempt && <button type="button" disabled={sending || readOnly || !contextReady} onClick={() => retry(retryableAttempt.attemptId)} className="mb-3 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50">Повторить ответ</button>}
        {!loading && !messages.length && <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          <p>{readOnly ? 'История пуста.' : guided ? 'Начните с разбора вопроса или напишите то, что уже знаете. AI спросит недостающие сведения по одному и подготовит уточнения связанных требований.' : 'Спросите, что нужно уточнить, попросите объяснить требование или предложить новую формулировку.'}</p>
          {guided && !readOnly && contextReady && <button type="button" disabled={loading || sending || activeAttempt || !contextReady} onClick={() => send('Помоги уточнить этот вопрос. Объясни, какого решения не хватает, учти уже известные ответы и задай один конкретный следующий вопрос.')} className="rounded-lg bg-indigo-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Начать уточнение</button>}
        </div>}
        <div className="space-y-3">
          {messages.map((item, index) => <article ref={index === messages.length - 1 ? latestMessageRef : undefined} key={item.messageId || `${item.role}-${item.createdAt}`} className={`rounded-xl border p-3 ${item.role === 'user' ? 'ml-6 border-indigo-100 bg-indigo-50/60' : 'mr-2 border-slate-200 bg-slate-50'}`}>
            <p className="text-xs font-semibold text-slate-500">{item.role === 'user' ? 'Вы' : 'AI'}{statusLabel[item.status] ? ` · ${statusLabel[item.status]}` : ''}</p>
            {item.text && (item.role === 'assistant' && proposal && item.text === proposal.explanation
              ? <details><summary className="cursor-pointer text-sm font-semibold text-slate-700">Ответ AI с предложением</summary><MessageText role={item.role} text={item.text} /></details>
              : <MessageText role={item.role} text={item.text} />)}
          </article>)}
        </div>
        {!loading && discussion?.attempt?.status === 'completed' && !proposal && <p role="status" aria-label="Результат ответа AI" className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{discussion.attempt.errorCode
          ? 'Предложение отклонено при проверке. Причина указана в ответе AI; доступных для принятия правок нет.'
          : guided ? 'Обсуждение продолжается. Если AI задал вопрос, ответьте в поле ниже. Когда всё необходимое выяснено, нажмите «Подготовить уточнение», чтобы проверить результат перед принятием.' : 'AI ответил, но предложение для принятия не подготовлено. Формулировки требований не изменены.'}</p>}
        {proposal && <DiscussionProposal proposal={proposal} applied={proposalApplied} saved={savedProposalDecisions[proposal.proposalId]?.decision === 'accepted'} canSaveHere={Boolean(onSave)} gapState={gapStates[proposal.clarification?.gapId]?.state} rejected={proposalRejected} stale={staleProposal} disabled={readOnly || sending || Boolean(activeAttempt) || !contextReady}
          onApply={() => { const ok = onApplyProposal?.(proposal); if (ok !== false) setApplied((current) => new Set(current).add(proposal.proposalId)); else setStaleProposal(true); }}
          onReject={() => { const ok = onRejectProposal?.(proposal); if (ok !== false) setRejected((current) => new Set(current).add(proposal.proposalId)); }} />}

      </div>
      <footer className="border-t border-slate-200 px-5 py-4">
        {guided && active && !readOnly && onSave && !(contextError && onSaveContext) && <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-3">
          <p role="status" className="text-xs text-slate-600">{savingContext ? 'Сохраняем версию…' : hasUnsavedChanges ? 'Есть изменения в черновике. Сохраните их в версию требований.' : 'Все изменения требований сохранены.'}</p>
          <button type="button" disabled={savingContext || sending || Boolean(activeAttempt) || !hasUnsavedChanges} onClick={() => { Promise.resolve().then(() => onSave()).catch((cause) => setError(errorText(cause))); }} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-300">{savingContext ? 'Сохраняем…' : 'Сохранить требования'}</button>
        </div>}
        {activeAttempt && <button type="button" onClick={() => cancelAttempt(discussion.attempt.attemptId)} className="mb-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Отменить генерацию</button>}
        {guided && !readOnly && messages.length > 0 && <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" disabled={sending || activeAttempt || !contextReady} onClick={() => send('Я пока не знаю ответа. Помоги сформулировать вопрос специалисту и объясни, какое решение нужно получить. Не выдумывай его за меня.')} className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 disabled:opacity-50">Не знаю ответа</button>
          <button type="button" disabled={sending || activeAttempt || !contextReady} onClick={() => send('Подготовь уточнения связанных требований на основании моих ответов. Покажи пакет решения с обоснованиями и оставшимися вопросами. Если данных недостаточно, задай один следующий вопрос.')} className="rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50">Подготовить уточнение</button>
        </div>}
        {draftStorageError && <p role="alert" className="mb-2 text-sm text-amber-800">Не удалось сохранить черновик сообщения в браузере. Отправьте его до перезагрузки страницы.</p>}
        <textarea aria-label={`Сообщение для ${anchorId}`} disabled={readOnly || sending} rows={3} value={message} onChange={(event) => setDrafts((current) => ({ ...current, [anchorId]: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} placeholder={guided ? 'Напишите ответ своими словами…' : 'Задайте вопрос по записи…'} className="w-full resize-none rounded-xl border border-slate-300 p-3 text-sm focus:border-indigo-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-100" />
        <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-500">Ctrl/⌘ + Enter отправляет сообщение.</p><button type="button" disabled={readOnly || sending || !message.trim() || activeAttempt || !contextReady} onClick={send} className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Отправить</button></div>
      </footer>
    </aside>
  </div>;
}
