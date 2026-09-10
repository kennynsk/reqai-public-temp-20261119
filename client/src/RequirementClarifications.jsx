import { useContext } from 'react';
import { DraftContext } from './review-context.js';
import { gapChecklist, updateReviewMetadata } from './review-metadata.js';

export default function RequirementClarifications({ requirement, editing, readOnly, onNavigate }) {
  const review = useContext(DraftContext);
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
    const reason = window.prompt('Почему изменение требования не требуется?');
    if (reason?.trim()) updateCheck(gap, requirementId, { state: 'no-change', reason: reason.trim() });
  }
  function markIncorporated(gap, requirementId) {
    updateCheck(gap, requirementId, { state: 'incorporated', reason: '' });
  }
  return <details open={editing || undefined} className="mt-3 rounded-lg border border-amber-200 bg-amber-50/40">
    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Уточнения · {gaps.length}</summary>
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
          {checklist.length > 0 && <div className="rounded-lg border border-amber-200 bg-white/70 p-2.5"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">Проверка требований · {checklist.filter((item) => !item.unresolved && item.state !== 'pending').length} из {checklist.length}</p><span className="text-xs text-slate-500">{complete ? 'Готово к закрытию' : 'Нужно проверить все'}</span></div><div className="mt-2 space-y-1.5">{checklist.map((item) => <div key={item.requirementId} className="flex flex-wrap items-center justify-between gap-2"><button type="button" disabled={item.unresolved} onClick={() => onNavigate?.(item.requirementId, { edit: true })} className="text-indigo-700 underline underline-offset-2 disabled:text-red-700">{item.requirementId}</button><span className="flex items-center gap-1.5">{item.unresolved && <span className="text-xs font-semibold text-red-700">Связь не найдена</span>}{!item.unresolved && item.state === 'incorporated' && <span className="text-xs font-semibold text-emerald-700">Ответ учтён</span>}{!item.unresolved && item.state === 'no-change' && <span className="text-xs font-semibold text-slate-600">Изменение не требуется</span>}{item.state === 'pending' && !item.unresolved && !readOnly && <><button type="button" aria-label={`Ответ учтён для ${gap.id} в ${item.requirementId}`} disabled={editing || !state.answer?.trim()} onClick={() => markIncorporated(gap, item.requirementId)} className="rounded border border-indigo-200 px-2 py-1 text-xs font-semibold text-indigo-700 disabled:opacity-50">Ответ учтён</button><button type="button" aria-label={`Изменение не требуется для ${gap.id} в ${item.requirementId}`} disabled={editing} onClick={() => markNoChange(gap, item.requirementId)} className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 disabled:opacity-50">Не требуется</button></>}{item.state !== 'pending' && !item.unresolved && !readOnly && <button type="button" onClick={() => updateCheck(gap, item.requirementId, { state: 'pending' })} className="px-1 text-xs text-slate-500 underline">Сбросить</button>}</span></div>)}</div></div>}
          {!readOnly && complete && state.state !== 'closed' && state.answer?.trim() && <p className="text-xs text-emerald-700">Все связанные требования проверены. Закрытие выполняется во вкладке «Вопросы».</p>}
        </div>;
      })}
    </div>
  </details>;
}
