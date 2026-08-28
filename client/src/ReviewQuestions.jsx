import { useContext, useState } from 'react';
import { DraftContext } from './review-context.js';
import ReviewDialog from './ReviewDialog.jsx';
import { SourceEvidence } from './SourceEvidence.jsx';
import { updateReviewMetadata } from './review-metadata.js';

export default function ReviewQuestions({ registry, readOnly, onNavigate }) {
  const review = useContext(DraftContext);
  const states = review?.state.decisions.review?.gaps || {};
  const [filter, setFilter] = useState('all');
  const [action, setAction] = useState(null);
  const change = (id, patch) => {
    const prior = states[id] || { state: 'open', answer: '', reason: '' };
    const next = { ...prior, ...patch };
    delete next.actorUserId; delete next.recordedAt;
    review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { gaps: { ...states, [id]: next } }) });
  };
  const gaps = registry.analysis.GAP.filter((gap) => filter === 'all' || (filter === 'closed' ? states[gap.id]?.state === 'closed' : states[gap.id]?.state !== 'closed'));
  return <section aria-label="Вопросы для уточнения" className="space-y-3">
    <h2 className="text-lg font-bold">Вопросы для уточнения · {registry.analysis.GAP.length}</h2>
    <p className="text-sm text-slate-600">Ответ сам по себе не закрывает вопрос и не изменяет требования.</p>
    <label className="text-sm flex gap-2 items-center">Показывать вопросы<select aria-label="Статус вопросов" value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border p-2"><option value="all">Все</option><option value="open">Открытые и с ответом</option><option value="closed">Закрытые</option></select></label>
    {gaps.map((gap) => { const state = states[gap.id] || { state: 'open', answer: '' }; return <article key={gap.id} id={`record-${gap.id}`} tabIndex={-1} className="scroll-mt-56 rounded-xl border border-amber-200 bg-white p-4">
      <div className="flex gap-3 justify-between flex-wrap"><h3 className="font-semibold">{gap.id} · {gap.text}</h3><span className="text-sm text-slate-600">{({ open: 'Открыт', answered: 'Дан ответ · ещё открыт', closed: 'Закрыт' })[state.state]}</span></div>
      <div className="flex flex-wrap gap-2 my-2">{gap.affectedIds.map((id) => <a key={id} href={`#record-${id}`} onClick={(event) => { event.preventDefault(); onNavigate(id); }} className="text-sm p-1 text-indigo-700 underline">{id}</a>)}</div>
      {gap.nextStep && <p className="text-sm my-2">Следующий шаг: {gap.nextStep}</p>}
      {registry.analysis.questions.filter((question) => question.gapId === gap.id).map((question) => <div key={question.id} className="my-3 rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-900">{({ P0: 'Критический', P1: 'Высокий', P2: 'Обычный' })[question.priority] || 'Приоритет не указан'} · {question.addressee}</p><p className="mt-1 text-sm">{question.text}</p></div>)}
      {!readOnly && <label className="block text-sm font-semibold mt-3">Ответ на {gap.id}<textarea aria-label={`Ответ на ${gap.id}`} maxLength={20000} rows={3} value={state.answer} disabled={state.state === 'closed'} onChange={(event) => change(gap.id, { answer: event.target.value, state: event.target.value.trim() ? 'answered' : 'open' })} className="mt-1 border rounded-lg p-3 block w-full font-normal" /></label>}
      {state.reason && <p className="text-sm mt-2">Причина решения: {state.reason}</p>}
      {state.recordedAt && <p className="text-xs text-slate-500 mt-2">Решение сохранено: {state.actorUserId} · {new Date(state.recordedAt).toLocaleString()}</p>}
      {!readOnly && <button onClick={() => setAction({ id: gap.id, state: state.state === 'closed' ? 'open' : 'closed', reason: '' })} className="mt-2 px-3 py-2 rounded-lg border text-sm text-indigo-700">{state.state === 'closed' ? 'Открыть вопрос снова' : 'Закрыть вопрос с причиной'}</button>}
      <details className="text-sm mt-2"><summary className="cursor-pointer p-2">Источник вопроса</summary><SourceEvidence source={gap.source} materials={registry.materials} /></details>
    </article>; })}
    {!gaps.length && <p className="text-sm text-slate-600 p-3">В этом списке нет вопросов. Это не подтверждает полноту требований.</p>}
    {action && <ReviewDialog label="Решение по вопросу" onClose={() => setAction(null)}><h2 className="text-lg font-bold">{action.state === 'closed' ? 'Закрыть' : 'Снова открыть'} {action.id}</h2><label className="block text-sm mt-3">Причина решения<textarea aria-label="Причина решения" value={action.reason} maxLength={5000} onChange={(event) => setAction({ ...action, reason: event.target.value })} className="block w-full border rounded-lg p-3 my-2" /></label><p className="text-sm text-slate-600">Решение станет частью черновика. Сохраните версию для фиксации автора и времени.</p><div className="mt-4 flex gap-2"><button onClick={() => setAction(null)} className="border rounded-lg p-3">Отмена</button><button disabled={!action.reason.trim()} onClick={() => { change(action.id, { state: action.state, reason: action.reason }); setAction(null); }} className="rounded-lg bg-indigo-600 text-white p-3 disabled:bg-slate-400">Подтвердить решение</button></div></ReviewDialog>}
  </section>;
}
