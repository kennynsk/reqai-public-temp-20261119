import { lazy, Suspense } from 'react';
import { QUALITY_POLICY } from '../../server/src/services/requirement-quality-context.js';

const SafeMarkdown = lazy(() => import('./SafeMarkdown.jsx'));

const fieldLabels = { text: 'Формулировка', role: 'Роль', successIndicator: 'Критерий успеха', category: 'Категория', scope: 'Область действия', verificationMethod: 'Проверка', completionCriterion: 'Критерий завершения', obligation: 'Обязательство' };

export default function DiscussionProposal({ proposal, applied, saved = false, gapState, rejected, stale, disabled, onApply, onReject }) {
  const clarification = proposal.clarification;
  const changes = proposal.changes || [];
  const actionLabel = clarification ? clarification.canResolve ? 'Применить уточнение и закрыть вопрос' : 'Применить уточнение' : 'Применить к черновику';
  return <section className="mt-4 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4" aria-label="Предложение изменений">
    <div>
      <h3 className="font-semibold text-slate-900">{clarification ? 'Проверьте уточнение' : `Предложение изменений · ${changes.length}`}</h3>
      <details open={!applied} className="mt-1 break-words text-sm text-slate-700 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"><summary className="cursor-pointer font-semibold">Обоснование AI</summary><Suspense fallback={<p className="my-2 text-sm text-slate-500">Форматируем ответ…</p>}><SafeMarkdown chat>{proposal.explanation}</SafeMarkdown></Suspense></details>
    </div>
    {clarification && <div className="rounded-lg bg-white p-3">
      <h4 className="text-sm font-semibold text-slate-900">Ваше решение</h4>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{clarification.answer}</p>
    </div>}
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
        <p className="font-semibold text-slate-700">{check.requirementId} · {check.state === 'incorporated' ? 'Будет уточнено' : 'Изменение не требуется'}</p>
        <p className="mt-0.5 text-slate-600">{check.reason}</p>
      </div>)}
      {!clarification.canResolve && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Вопрос останется открытым</p>
        {clarification.remainingQuestions.length > 0 ? <ul className="mt-1 list-disc space-y-1 pl-5">{clarification.remainingQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul> : <p className="mt-1">Ещё не рассмотрены все связанные требования или часть контекста не вошла в анализ.</p>}
      </div>}
    </div>}
    {stale && <p role="status" className="text-sm text-amber-900">Предложение устарело. Попросите AI подготовить новый вариант с учётом текущих правок.</p>}
    {proposal.qualityAssessment?.schemaVersion === QUALITY_POLICY && proposal.qualityAssessment.semanticReview?.pass === true && <section aria-label="Автоматическая переоценка качества" className="space-y-2 rounded-lg bg-white p-3">
      <h4 className="text-sm font-semibold text-slate-900">Качество формулировок по скиллу</h4>
      <p className="text-sm text-slate-700">{applied ? 'Оценки применены' : 'При принятии оценки обновятся автоматически'} · готово {proposal.qualityAssessment.assessments.filter((item) => item.quality === 'Готово').length} из {proposal.qualityAssessment.assessments.length}</p>
      <details className="text-sm"><summary className="cursor-pointer font-semibold text-indigo-700">Основания оценок</summary><ul className="mt-2 space-y-3">{proposal.qualityAssessment.assessments.map((item) => <li key={item.id}><p className="font-semibold">{item.id} · {item.quality}</p><p className="mt-1 break-words text-slate-600">{item.reason}</p></li>)}</ul></details>
    </section>}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || stale || applied || rejected} onClick={onApply} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{applied ? saved ? 'Принято и сохранено' : 'Принято в черновик' : stale ? 'Предложение устарело' : actionLabel}</button>
      <button type="button" disabled={disabled || applied || rejected} onClick={onReject} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{rejected ? 'Пакет отклонён' : 'Отклонить пакет'}</button>
    </div>
    <p role={applied ? 'status' : undefined} className="text-sm text-slate-600">{clarification
      ? applied ? saved ? `${gapState === 'closed' ? 'Вопрос закрыт' : 'Ответ сохранён; вопрос открыт'}. Решение сохранено в версии требований.` : `${clarification.canResolve ? 'Вопрос закрыт' : 'Ответ учтён, вопрос ещё открыт'} в черновике. Сохраните изменения на основном экране.`
        : `${clarification.canResolve ? 'При принятии подтвердятся ответ и его учёт во всех связанных требованиях; вопрос закроется' : 'При принятии сохранятся ответ и показанные правки; вопрос останется открытым'} в черновике. Версия сохранится общей кнопкой сохранения.`
      : 'Применение не закрывает GAP и не сохраняет версию автоматически.'}</p>
  </section>;
}
