import { lazy, Suspense } from 'react';
import { QUALITY_POLICY } from '../../server/src/services/requirement-quality-context.js';

const SafeMarkdown = lazy(() => import('./SafeMarkdown.jsx'));

const fieldLabels = { text: 'Формулировка', role: 'Роль', successIndicator: 'Критерий успеха', category: 'Категория', scope: 'Область действия', verificationMethod: 'Проверка', completionCriterion: 'Критерий завершения', obligation: 'Обязательство' };

export default function DiscussionProposal({ proposal, applied, saved = false, canSaveHere = false, gapState, rejected, stale, disabled, onApply, onReject }) {
  const clarification = proposal.clarification;
  const changes = proposal.changes || [];
  const additions = proposal.additions || [];
  const hasRequirementChanges = changes.length > 0 || additions.length > 0;
  const actionLabel = clarification ? clarification.canResolve ? 'Применить уточнение и закрыть вопрос' : hasRequirementChanges ? 'Применить уточнение' : 'Зафиксировать ответ' : 'Применить к черновику';
  const nextStep = clarification && !clarification.canResolve ? clarification.remainingQuestions?.length ? ' Затем ответьте на оставшиеся вопросы в этом чате и подготовите уточнение снова.' : ' Затем закройте вопрос кнопкой в панели уточнения вопроса.' : '';
  const assessment = proposal.qualityAssessment?.schemaVersion === QUALITY_POLICY && proposal.qualityAssessment.semanticReview?.pass === true ? proposal.qualityAssessment : null;
  const changedAssessments = assessment?.assessments.filter((item) => item.before !== item.quality) || [];
  return <section className="mt-4 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4" aria-label="Предложение изменений">
    <div>
      <h3 className="font-semibold text-slate-900">{clarification ? 'Проверьте уточнение' : `Предложение изменений · ${changes.length + additions.length}`}</h3>
      <p className="mt-2 text-sm text-slate-700">{hasRequirementChanges ? [additions.length > 0 && `Новые требования: ${additions.length}.`, changes.length > 0 && `Изменения существующих требований: ${changes.length}.`].filter(Boolean).join(' ') : 'Формулировки существующих требований не изменяются.'}</p>
      <details className="mt-1 break-words text-sm text-slate-700 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"><summary className="cursor-pointer font-semibold">Пояснение к предложению</summary><Suspense fallback={<p className="my-2 text-sm text-slate-500">Форматируем ответ…</p>}><SafeMarkdown chat>{proposal.explanation}</SafeMarkdown></Suspense></details>
    </div>
    {clarification && <div className="rounded-lg bg-white p-3">
      <h4 className="text-sm font-semibold text-slate-900">Ваше решение</h4>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{clarification.answer}</p>
    </div>}
    {clarification && !clarification.canResolve && <section aria-label="Что осталось сделать" className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <h4 className="font-semibold">Что осталось сделать</h4>
      <p>Вопрос останется открытым.</p>
      {clarification.remainingQuestions.length > 0 ? <ul className="list-disc space-y-1 pl-5">{clarification.remainingQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul> : <p>Нужно проверить оставшиеся требования и сведения.</p>}

    </section>}
    {additions.length > 0 && <section aria-label="Новые требования" className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-900">{applied ? 'Добавленные требования' : 'Будут добавлены при принятии'}</h4>
      {additions.map(({ type, record, rationale }) => <article key={record.id} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3" aria-label={`Новое требование ${record.id}`}>
        <h5 className="text-sm font-semibold text-indigo-700">{record.id} · {type}</h5>
        <p className="whitespace-pre-wrap break-words text-sm text-slate-900">{record.text}</p>
        {Object.entries(fieldLabels).filter(([field]) => field !== 'text' && record[field]).map(([field, label]) => <p key={field} className="whitespace-pre-wrap break-words text-sm text-slate-700"><span className="font-semibold">{label}:</span> {record[field]}</p>)}
        {rationale && <p className="whitespace-pre-wrap break-words text-xs text-slate-600">{rationale}</p>}
      </article>)}
    </section>}
    {changes.map((change) => <div key={change.targetId} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-sm font-semibold text-indigo-700">{change.targetId}</h4>
      {Object.keys(change.after).map((field) => <div key={field} className="space-y-2 text-sm">
        {field !== 'text' && <p className="font-semibold text-slate-700">{fieldLabels[field] || field}</p>}
        <div><p className="text-xs font-semibold text-slate-500">Было</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-600">{change.before[field] || '—'}</p></div>
        <div><p className="text-xs font-semibold text-indigo-700">Станет</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-900">{change.after[field] || '—'}</p></div>
      </div>)}
      {change.rationale && <p className="text-xs text-slate-600">{change.rationale}</p>}
    </div>)}
    {clarification && <div className="space-y-2">
      <h4 className="text-sm font-semibold text-slate-900">Как ответ учтён в требованиях</h4>
      {clarification.checks.map((check) => <div key={check.requirementId} className="text-sm">
        <p className="font-semibold text-slate-700">{check.requirementId} · {check.state === 'incorporated' ? additions.some((item) => item.record.id === check.requirementId) ? applied ? 'Добавлено' : 'Будет добавлено' : applied ? 'Уточнено' : 'Будет уточнено' : 'Изменение не требуется'}</p>
        <p className="mt-0.5 text-slate-600">{check.reason}</p>
      </div>)}

    </div>}
    {stale && <p role="status" className="text-sm text-amber-900">Предложение устарело. Попросите AI подготовить новый вариант с учётом текущих правок.</p>}
    {assessment && <section aria-label="Оценка требований" className="space-y-2 border-t border-indigo-100 pt-3">
      <h4 className="text-sm font-semibold text-slate-900">Оценка требований</h4>
      <p className="text-sm text-slate-700">{changedAssessments.length ? `${applied ? 'Обновлены оценки' : 'При принятии обновятся оценки'}: ${changedAssessments.length}.` : 'Оценки требований не меняются.'}</p>
      <p className="text-xs text-slate-600">Это оценка ясности и полноты формулировок после принятия пакета. «Готово» означает, что формулировку можно использовать дальше; открытые вопросы по задаче остаются отдельными.</p>
      {changedAssessments.length > 0 && <ul className="space-y-1 text-sm text-slate-800">{changedAssessments.map((item) => <li key={item.id}>{item.id}: {item.before || 'Без оценки'} → {item.quality}</li>)}</ul>}
    </section>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || stale || applied || rejected} onClick={onApply} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{applied ? saved ? 'Принято и сохранено' : 'Принято в черновик' : stale ? 'Предложение устарело' : actionLabel}</button>
      <button type="button" disabled={disabled || applied || rejected} onClick={onReject} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{rejected ? 'Предложение отклонено' : 'Отклонить предложение'}</button>
    </div>
    <p role={applied ? 'status' : undefined} className="text-sm text-slate-600">{rejected ? 'Предложение отклонено. Требования и ответ не изменены этим пакетом.' : clarification
      ? applied ? saved ? `${gapState === 'closed' ? 'Вопрос закрыт' : 'Ответ сохранён; вопрос открыт'}. Решение сохранено в версии требований.${nextStep}` : `${clarification.canResolve ? 'Вопрос закрыт' : 'Ответ учтён, вопрос ещё открыт'} в черновике. ${canSaveHere ? 'Нажмите «Сохранить требования» внизу этой панели.' : 'Сохраните изменения на основном экране.'}${nextStep}`
        : `${clarification.canResolve ? 'При принятии подтвердятся ответ и его учёт во всех связанных требованиях; вопрос закроется' : hasRequirementChanges ? 'При принятии сохранятся ответ и показанные изменения требований; вопрос останется открытым' : 'При принятии зафиксируется ответ и обновятся показанные оценки; вопрос останется открытым'} в черновике. ${canSaveHere ? 'Затем нажмите «Сохранить требования» внизу этой панели.' : 'Версия сохранится общей кнопкой сохранения.'}${nextStep}`
      : 'После применения сохраните требования. Связанные вопросы проверяются отдельно.'}</p>
    {assessment && <details className="border-t border-indigo-100 pt-3 text-sm"><summary className="cursor-pointer font-semibold text-indigo-700">Почему выставлены эти оценки · {assessment.assessments.length}</summary><ul className="mt-3 space-y-3">{assessment.assessments.map((item) => <li key={item.id}><p className="font-semibold">{item.id} · {item.quality}</p><p className="mt-1 break-words text-slate-600">{item.reason}</p></li>)}</ul></details>}
  </section>;
}
