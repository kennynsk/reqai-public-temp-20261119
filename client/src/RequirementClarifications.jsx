import { useContext, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { DraftContext } from './review-context.js';
import ReviewDialog from './ReviewDialog.jsx';
import { gapChecklist, updateReviewMetadata } from './review-metadata.js';

export default function RequirementClarifications({ requirement, editing, readOnly, onNavigate, onDiscuss }) {
  const review = useContext(DraftContext);
  const [noChange, setNoChange] = useState(null);
  const gaps = (review?.content.analysis?.GAP || []).filter((gap) => (gap.affectedIds || []).includes(requirement.id)
    || [...(requirement.relatedIds || []), ...(requirement.relatedTo || [])].includes(gap.id));
  if (!gaps.length) return null;
  const metadata = review.state.decisions.review || {};
  const states = metadata.gaps || {};
  function updateCheck(gap, requirementId, patch) {
    const current = metadata.gapRequirements || {};
    const nextGap = { ...(current[gap.id] || {}), [requirementId]: { ...(current[gap.id]?.[requirementId] || {}), ...patch, stale: false } };
    review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { gapRequirements: { ...current, [gap.id]: nextGap } }) });
  }
  function markNoChange(gap, requirementId) {
    setNoChange({ gapId: gap.id, requirementId, reason: '' });
  }
  function markIncorporated(gap, requirementId) {
    updateCheck(gap, requirementId, { state: 'incorporated', reason: '' });
  }
  function changeGap(id, patch) {
    const prior = states[id] || { state: 'open', answer: '', reason: '' };
    const next = { ...prior, ...patch };
    delete next.actorUserId; delete next.recordedAt;
    review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { gaps: { ...states, [id]: next } }) });
  }
  function resolveGap(gap) {
    changeGap(gap.id, { state: 'closed', closureKind: 'resolved', reason: `Проверены все связанные требования: ${gapChecklist(review.content, gap, metadata).map((item) => item.requirementId).join(', ')}.` });
  }
  return <>
    <div className="mt-3 space-y-2">
      {onDiscuss && <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">Уточнения · {gaps.length}</p>
        <button type="button" onClick={() => onDiscuss(requirement.id)} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:ring-2 focus-visible:ring-indigo-500"><MessageCircle aria-hidden="true" className="h-4 w-4" />Уточнить с AI</button>
      </div>}
    <details open={editing || undefined} className="rounded-lg border border-amber-200 bg-amber-50/40">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">{onDiscuss ? 'Вопросы и учёт ответов' : `Уточнения · ${gaps.length}`}</summary>
      <div className="divide-y divide-amber-200 px-3">
        {gaps.map((gap) => {
          const state = states[gap.id] || { state: 'open', answer: '' };
          const legacyClosed = state.state === 'closed' && !metadata.gapRequirements?.[gap.id];
          const questions = review.content.analysis.questions.filter((question) => question.gapId === gap.id);
          const checklist = gapChecklist(review.content, gap, metadata);
          const complete = checklist.length > 0 && checklist.every((item) => !item.unresolved && (item.state === 'incorporated' || item.state === 'no-change'));
          return <div key={gap.id} className="py-3 space-y-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" onClick={() => onNavigate?.(gap.id)} className="font-semibold text-indigo-700 underline underline-offset-2">{gap.id} · Открыть вопрос</button><span className="text-xs text-slate-600">{legacyClosed ? <><span>Закрыт</span><span className="ml-1 text-slate-500">(проверка по требованиям не зафиксирована)</span></> : state.state === 'closed' ? 'Закрыт' : state.answer?.trim() ? 'Есть ответ · не закрыт' : 'Ожидает ответа'}</span></div>
            <p>{gap.text}</p>
            {questions.map((question) => <p key={question.id} className="text-slate-600">{question.text}</p>)}
            {state.answer?.trim() ? <div><p className="font-semibold">Ваш ответ</p><p className="whitespace-pre-wrap break-words">{state.answer}</p></div> : <p className="text-slate-500">Ответ ещё не добавлен.</p>}
            {state.reason && <p className="text-slate-600">Причина закрытия: {state.reason}</p>}
            {checklist.length > 0 && <div className="rounded-lg border border-amber-200 bg-white/70 p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">Проверка требований · {checklist.filter((item) => !item.unresolved && item.state !== 'pending').length} из {checklist.length}</p><span className="text-xs text-slate-500">{complete && !state.answer?.trim() ? 'Остался ответ' : complete ? 'Готово к закрытию' : 'Нужно проверить все'}</span></div><div className="mt-2 space-y-1.5">{checklist.map((item) => <div key={item.requirementId} className="flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={item.unresolved} onClick={() => onNavigate?.(item.requirementId, { edit: true })} className="text-indigo-700 underline underline-offset-2 disabled:text-red-700">{item.requirementId}</button><span className="flex items-center gap-1.5">{item.unresolved && <span className="text-xs font-semibold text-red-700">Связь не найдена</span>}{!item.unresolved && item.state === 'incorporated' && <span className="text-xs font-semibold text-emerald-700">Ответ учтён</span>}{!item.unresolved && item.state === 'no-change' && <span className="text-xs font-semibold text-slate-600">Изменение не требуется</span>}{item.state === 'pending' && !item.unresolved && !readOnly && <><button type="button" aria-label={`Ответ учтён для ${gap.id} в ${item.requirementId}`} disabled={editing || !state.answer?.trim()} onClick={() => markIncorporated(gap, item.requirementId)} className="rounded border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 disabled:opacity-50">Ответ учтён</button><button type="button" aria-label={`Изменение не требуется для ${gap.id} в ${item.requirementId}`} disabled={editing} onClick={() => markNoChange(gap, item.requirementId)} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50">Не требуется</button></>}{item.state !== 'pending' && !item.unresolved && !readOnly && <button type="button" onClick={() => updateCheck(gap, item.requirementId, { state: 'pending' })} className="px-1 text-xs text-slate-500 underline">Сбросить</button>}</span></div>)}</div></div>}
            {!readOnly && complete && state.state !== 'closed' && (state.answer?.trim()
              ? <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => resolveGap(gap)} className="min-h-9 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">Закрыть как решённый</button><span className="text-xs text-emerald-700">Все связанные требования проверены</span></div>
              : <p className="text-xs text-slate-500">Все связанные требования проверены. <button type="button" onClick={() => onNavigate?.(gap.id)} className="font-semibold text-indigo-700 underline underline-offset-2">Добавьте ответ к вопросу</button>, чтобы закрыть его.</p>)}
          </div>;
        })}
      </div>
    </details>
    </div>
    {noChange && createPortal(<ReviewDialog label="Подтверждение требования" onClose={() => setNoChange(null)}><h2 className="text-lg font-bold">{noChange.requirementId}: изменение не требуется</h2><label className="block text-sm mt-3">Обоснование<textarea aria-label="Обоснование отсутствия изменения" value={noChange.reason} maxLength={5000} onChange={(event) => setNoChange({ ...noChange, reason: event.target.value })} className="block w-full border rounded-lg p-3 my-2" /></label><p className="text-sm text-slate-600">Это подтверждение относится только к выбранному требованию. Решение станет частью черновика.</p><div className="mt-4 flex gap-2"><button onClick={() => setNoChange(null)} className="border rounded-lg p-3">Отмена</button><button disabled={!noChange.reason.trim()} onClick={() => { const gap = review.content.analysis.GAP.find((item) => item.id === noChange.gapId); updateCheck(gap, noChange.requirementId, { state: 'no-change', reason: noChange.reason.trim() }); setNoChange(null); }} className="rounded-lg bg-indigo-600 text-white p-3 disabled:bg-slate-400">Подтвердить</button></div></ReviewDialog>, document.body)}
  </>;
}
