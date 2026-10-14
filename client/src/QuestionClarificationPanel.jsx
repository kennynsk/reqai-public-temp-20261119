import { RequirementsReviewContext } from './requirements-review-context.js';
import { gapStateLabel } from './question-presentation.js';
import { useContext, useEffect, useState } from 'react';
import { DraftContext } from './review-context.js';
import { gapChecklist, gapChecklistComplete, gapClarificationObjection, gapHasPendingClarification, gapReviewHint, updateReviewMetadata } from './review-metadata.js';
import { SourceEvidence } from './SourceEvidence.jsx';
import ClarificationShell from './ClarificationShell.jsx';
import RequirementContentEditor from './RequirementContentEditor.jsx';

export default function QuestionClarificationPanel({ gapId, onClose, onEdit, renderDiscussion, error, onSave, busy, subview, setSubview }) {
  const review = useContext(DraftContext);
  const workflow = useContext(RequirementsReviewContext);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const panel = document.querySelector('[role="dialog"]');
      if (document.activeElement?.closest('[id^="question-editor-"]')) return;
      (panel?.querySelector(subview ? '[data-question-back]' : '[data-question-answer]'))?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [subview]);
  const [action, setAction] = useState(null);
  const gap = review.content.analysis.GAP.find((item) => item.id === gapId);
  const metadata = review.state.decisions.review || {};
  const state = metadata.gaps?.[gapId] || { state: 'open', answer: '' };
  const checklist = gap ? gapChecklist(review.content, gap, metadata) : [];
  const questions = review.content.analysis.questions.filter((item) => item.gapId === gapId);
  const closed = state.state === 'closed';
  const complete = gap && gapChecklistComplete(review.content, gap, metadata);
  const answerReady = Boolean(state.answer?.trim());
  const pendingObjection = gapHasPendingClarification(metadata, gapId) ? gapClarificationObjection(metadata, gapId) : '';
  function change(patch) {
    const next = { ...state, ...patch }; delete next.actorUserId; delete next.recordedAt;
    review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { gaps: { ...metadata.gaps, [gapId]: next } }) });
  }
  function check(id, patch) {
    review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { gapRequirements: { ...metadata.gapRequirements, [gapId]: { ...metadata.gapRequirements?.[gapId], [id]: { ...metadata.gapRequirements?.[gapId]?.[id], ...patch, stale: false } } } }) });
  }
  const entry = Object.entries(review.content.groups).flatMap(([type, records]) => records.map((requirement) => ({ type, requirement }))).find((item) => item.requirement.id === subview);
  const button = 'rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500';
  const decisionForm = action && <div className="space-y-3 rounded-lg border border-slate-200 p-3"><p className="font-semibold">{action.requirementId ? `${action.requirementId}: изменение не требуется` : action.override ? 'Не согласны с AI — закрыть вопрос' : closed ? 'Снова открыть вопрос' : 'Снять с рассмотрения'}</p><label className="block">{action.requirementId ? 'Обоснование отсутствия изменения' : action.override ? 'Почему вопрос можно закрыть' : 'Причина решения'}<textarea autoFocus aria-label={action.requirementId ? 'Обоснование отсутствия изменения' : action.override ? 'Почему вопрос можно закрыть' : 'Причина решения'} maxLength={5000} value={action.reason} onChange={(event) => setAction({ ...action, reason: event.target.value })} className="mt-1 block w-full rounded-lg border p-3" /></label><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={!action.reason.trim()} onClick={() => { if (action.requirementId) check(action.requirementId, { state: 'no-change', reason: action.reason.trim() }); else if (action.override) change({ state: 'closed', closureKind: 'resolved', reason: `Закрыто пользователем вопреки замечанию AI (AI считал: ${pendingObjection || 'уточнение неполное'}). Причина: ${action.reason.trim()}` }); else change({ state: closed ? 'open' : 'closed', closureKind: closed ? null : 'dismissed', reason: action.reason.trim() }); setAction(null); }}>Подтвердить решение</button><button type="button" className={button} onClick={() => setAction(null)}>Отмена</button></div></div>;
  const closeControls = gap ? <>
    <p role="status" aria-label={`Статус проверки ${gapId}`} className="text-slate-600">{gapReviewHint(review.content, gap, metadata)}</p>
    {!closed && checklist.some((item) => item.stale && item.state !== 'pending' && !item.unresolved) && <button type="button" className={button} onClick={() => {
      const reconfirm = Object.fromEntries(checklist.filter((item) => item.stale && item.state !== 'pending').map((item) => [item.requirementId, { ...(metadata.gapRequirements?.[gapId]?.[item.requirementId] || {}), stale: false }]));
      if (Object.keys(reconfirm).length) review.dispatch({ type: 'decisions', value: updateReviewMetadata(review.state.decisions, { gapRequirements: { ...metadata.gapRequirements, [gapId]: { ...(metadata.gapRequirements?.[gapId] || {}), ...reconfirm } } }) });
    }}>Подтвердить прежние решения</button>}
    {!closed && <button type="button" disabled={!answerReady || !complete || Boolean(pendingObjection)} onClick={() => change({ state: 'closed', closureKind: 'resolved', reason: `Проверены все связанные требования: ${checklist.map((item) => item.requirementId).join(', ')}.` })} className="rounded-lg bg-emerald-600 px-3 py-2 font-semibold text-white disabled:bg-slate-300">Закрыть как решённый</button>}
    {!closed && answerReady && complete && pendingObjection && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">AI считает уточнение неполным</p>
      <p className="break-words">{pendingObjection}</p>
      <p>Не согласны — закройте вопрос решением человека: возражение AI и ваша причина сохранятся в истории вопроса.</p>
      <button type="button" className={button} onClick={() => setAction({ override: true, reason: '' })}>Не согласен — вопрос выяснен, закрыть</button>
    </div>}
  </> : null;
  return <ClarificationShell title={`Уточнение ${gapId}`} onClose={onClose}>
    <fieldset disabled={busy} className="flex min-h-0 min-w-0 flex-1 flex-col">
    {!gap ? <div className="p-5 text-sm text-slate-600" role="status">Вопрос не найден. Закройте панель и выберите доступный вопрос; черновик сохранён.</div> : <>
      <div className="max-h-40 shrink-0 overflow-y-auto border-b border-slate-200 px-5 py-3"><p className="text-xs font-semibold text-amber-800">{gapStateLabel(state)}</p><p className="mt-1 break-words text-sm text-slate-700">{gap.text}</p>{subview && <button type="button" data-question-back className={`${button} mt-3`} onClick={() => setSubview(null)}>← К вопросу {gapId}</button>}</div>
      {workflow.saveError && <p role="alert" className="px-5 py-3 text-sm text-red-700">{workflow.saveError}</p>}
      {workflow.conflict && <div role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900"><p>Доступна новая сохранённая версия. Ваши правки сохранены в черновике.</p><button type="button" onClick={() => { onClose(); requestAnimationFrame(() => workflow.onCompareVersions?.()); }} className="mt-2 font-semibold text-indigo-700 underline">Сравнить версии</button></div>}
      {error && <p role="alert" className="px-5 py-3 text-sm text-red-700">{error.id}: {error.message}</p>}
      <div className={subview === 'ai' ? "min-h-0 flex-1 flex flex-col" : "hidden"}>{renderDiscussion?.({ embedded: true, onClose: () => setSubview(null), active: subview === 'ai' })}</div>
      {subview === 'ai' && gap && <div className="shrink-0 space-y-3 border-t border-slate-200 bg-slate-50 px-5 py-4 text-sm">{closeControls}{action?.override && decisionForm}</div>}
      {entry ? <div className="flex-1 overflow-y-auto px-5 py-4"><h3 className="mb-3 font-semibold">Редактировать {entry.requirement.id}</h3><RequirementContentEditor key={entry.requirement.id} namespace="question" type={entry.type} requirement={entry.requirement} onApply={(text, fields) => { onEdit(entry.type, entry.requirement.id, text, fields); setSubview(null); }} onCancel={() => setSubview(null)} /></div> : subview !== 'ai' && <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-slate-700">
        {questions.map((question) => <div key={question.id} className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-900">{({ P0: 'Критический', P1: 'Высокий', P2: 'Обычный' })[question.priority] || 'Приоритет не указан'}{question.addressee && ` · ${question.addressee}`}</p><p className="mt-1 break-words">{question.text}</p></div>)}
        <label className="block font-semibold">Ответ на {gapId}<textarea data-question-answer aria-label={`Ответ на ${gapId}`} disabled={closed} maxLength={20000} rows={4} value={state.answer || ''} onChange={(event) => change({ answer: event.target.value, state: event.target.value.trim() ? 'answered' : 'open' })} className="mt-1 block w-full rounded-lg border p-3 font-normal" /></label>
        {!closed && <p className="text-sm text-slate-600">Сохранение ответа не меняет формулировки требований. Отредактируйте их{renderDiscussion ? ' или подготовьте правки с AI' : ''}. Затем подтвердите учёт ответа в каждом требовании.</p>}
        {renderDiscussion && <button type="button" className={button} onClick={() => setSubview('ai')}>Помочь уточнить с AI</button>}
        <section aria-label="Учёт ответа в требованиях" className="space-y-3"><h3 className="font-semibold">Проверка требований · {checklist.filter((item) => !item.unresolved && item.state !== 'pending').length} из {checklist.length}</h3>{checklist.map((item) => { const record = Object.values(review.content.groups).flat().find((record) => record.id === item.requirementId); return <div key={item.requirementId} className="space-y-2 rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{item.requirementId}</span>{!item.unresolved && <button type="button" className="font-semibold text-indigo-700 underline underline-offset-2" onClick={() => setSubview(item.requirementId)}>Редактировать {item.requirementId}</button>}</div>{record && <p className="whitespace-pre-wrap break-words">{record.text}</p>}
          {item.unresolved ? <p className="text-red-700">Связь не найдена</p> : <><p className="text-xs text-slate-600">{item.state === 'incorporated' ? 'Ответ учтён' : item.state === 'no-change' ? 'Изменение не требуется' : 'Нужно проверить'}{item.stale && item.state !== 'pending' ? ' · требуется повторное подтверждение' : ''}</p>{item.reason && <p className="break-words text-xs text-slate-500">{item.reason}</p>}{!closed && <div className="flex flex-wrap gap-2">{item.state === 'pending' ? <><button type="button" disabled={!state.answer?.trim()} onClick={() => check(item.requirementId, { state: 'incorporated', reason: '' })} className={`${button} disabled:opacity-50`}>Подтвердить учёт ответа</button><button type="button" onClick={() => setAction({ requirementId: item.requirementId, reason: '' })} className={button}>Изменение не требуется</button></> : <button type="button" onClick={() => check(item.requirementId, { state: 'pending' })} className="text-xs text-slate-500 underline">Сбросить</button>}</div>}</>}
          {action?.requirementId === item.requirementId && decisionForm}
        </div>; })}</section>
        {closeControls}
        {!action?.requirementId && decisionForm}
        <button type="button" onClick={() => setAction({ reason: '' })} className={`${button} block`}>{closed ? 'Открыть вопрос снова' : 'Снять с рассмотрения…'}</button>
        {state.reason && <p className="break-words text-xs text-slate-500">Причина решения: {state.reason}</p>}
        <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer font-semibold text-slate-600">Источник и связи</summary><div className="mt-3 space-y-2"><SourceEvidence source={gap.source} materials={review.content.materials} /><p className="break-words text-xs text-slate-500">Связанные записи: {(gap.affectedIds || []).join(', ') || '—'}</p>{(gap.affectedIds || []).filter((id) => !checklist.some((item) => item.requirementId === id)).map((id) => { const record = [...(review.content.context || []), ...Object.values(review.content.analysis).filter(Array.isArray).flat()].find((record) => record.id === id); return record && <p key={id} className="break-words text-xs text-slate-600">{id}: {record.text}</p>; })}</div></details>
      </div>}
      {subview !== 'ai' && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><p role="status" className="text-xs text-slate-500">{busy ? 'Сохраняем изменения…' : review.dirty ? 'Есть несохранённые изменения' : review.session?.baseVersionId ? 'Все изменения сохранены в версии требований' : 'Версия требований ещё не сохранена'}</p><button type="button" disabled={busy || (!review.dirty && Boolean(review.session?.baseVersionId))} onClick={onSave} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Сохраняем…' : 'Сохранить требования'}</button></footer>}
    </>}
    </fieldset>
  </ClarificationShell>;
}
