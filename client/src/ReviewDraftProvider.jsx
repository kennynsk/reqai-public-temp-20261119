import { useEffect } from 'react';
import { DraftContext, SessionContext } from './review-context.js';
const copy = (value) => JSON.parse(JSON.stringify(value));
export function ReviewSessionProvider({ scope, jobId, baseVersionId, register, restoredState, compareRecovery, restoreRecovery, view, requestView, reservedIds, children }) {
  return <SessionContext.Provider value={{ key: scope ? `reqai.reviewDraft:${scope}:${jobId}` : null, baseVersionId: baseVersionId || null, register, restoredState, compareRecovery, restoreRecovery, view, requestView, reservedIds }}>{children}</SessionContext.Provider>;
}
export function ReviewDraftProvider({ review, submit, busy = false, children }) {
  useEffect(() => {
    review.session?.register?.({ save: submit, discard: review.discard, snapshot: () => copy(review.state) });
    return () => review.session?.register?.(null);
  }, [review.session, submit, review.state, review.discard]);
  return <DraftContext.Provider value={review}>
    {review.recovery && <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 mb-4">
      <p className="font-semibold">Найден несохранённый черновик этой вкладки</p>
      {review.recovery.baseVersionId === review.session?.baseVersionId ? <button onClick={review.restore} className="px-3 py-2 text-indigo-700">Восстановить черновик</button> : <><p>Сохранённая версия изменилась. Сравните черновик перед переносом правок.</p><details><summary>Показать текст черновика</summary><pre className="whitespace-pre-wrap max-h-72 overflow-auto">{Object.values(review.recovery.state.content.groups || review.recovery.state.content).filter(Array.isArray).flat().map((item) => `${item.id}: ${item.text}`).join('\n')}{'\n'}{Object.values(review.recovery.state.drafts).map((item) => `${item.id}: ${item.text}`).join('\n')}</pre></details></>}
      {review.recovery.baseVersionId !== review.session?.baseVersionId && review.recovery.baseContent && <button onClick={() => review.session.compareRecovery(review.recovery)} className="px-3 py-2 text-indigo-700">Сравнить и перенести</button>}
      <button onClick={review.discard} className="px-3 py-2 text-slate-700">Отбросить черновик</button>
    </section>}
    {review.storageError && <p role="alert" className="text-amber-800">Браузер не позволяет сохранить черновик вкладки. Не перезагружайте страницу до сохранения на сервере.</p>}
    <fieldset disabled={busy} className="min-w-0">{children}</fieldset>
  </DraftContext.Provider>;
}
