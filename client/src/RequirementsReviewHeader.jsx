import { useContext, useId } from 'react';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { RequirementsReviewContext } from './requirements-review-context.js';
import { researchPresentation, reviewPrimary } from './requirements-review-presentation.js';
import { ResultExportAction } from './ResultExportContext.jsx';

export default function RequirementsReviewHeader({ version, dirty, busy, researchBusy, onSave, onResearch, onFinal }) {
  const context = useContext(RequirementsReviewContext);
  const statusId = useId();
  const saved = Boolean(version?.versionId);
  const research = researchPresentation({ ...context, versionId: version?.versionId });
  const primary = reviewPrimary({ dirty, saved, busy, research, submitting: context.submitting, conflict: context.conflict });
  const gateBlocked = Boolean(context.conflict || busy || researchBusy || research.active);
  const gateHint = context.conflict ? 'Разрешите конфликт версий' : busy ? 'Подождите завершения операции' : researchBusy || research.active ? 'Дождитесь завершения AI-исследования' : '';
  const savedAt = version?.createdAt ? new Date(version.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const buttonClass = (key) => `min-h-10 rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 ${primary === key ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-slate-700 hover:bg-slate-100'}`;
  async function startResearch() {
    if (saved && !dirty) { onResearch(version.versionId); return; }
    const savedVersion = await onSave();
    if (savedVersion?.versionId) onResearch(savedVersion.versionId);
  }
  return <header className="space-y-1" aria-label="Работа с требованиями">
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div><h1 className="text-2xl font-bold text-slate-900">Требования</h1></div>
      <div className="flex flex-wrap items-center gap-2" aria-label="Действия с требованиями">
        <span id={statusId} role="status" className="flex min-h-10 items-center">
          {busy && !context.submitting ? <button type="button" disabled className={buttonClass('save')}><Loader2 aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" />Сохраняем…</button>
            : dirty || !saved ? <button type="button" className={buttonClass('save')} disabled={Boolean(context.conflict)} onClick={onSave}>{saved ? 'Сохранить изменения' : 'Сохранить требования'}</button>
            : <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><Check aria-hidden="true" className="h-4 w-4" />Сохранено{savedAt ? ` · ${savedAt}` : ''}</span>}
        </span>
        {context.submitting && !context.childId && <button disabled className={buttonClass('starting')}><Loader2 aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" />Запускаем AI-исследование…</button>}
        {context.childId && <button type="button" className={buttonClass('open')} disabled={busy} onClick={context.onOpenResearch}>{research.openLabel}</button>}
        <button type="button" className={buttonClass('final')} aria-label="Перейти к финальной версии" aria-describedby={statusId} title={gateBlocked && gateHint ? gateHint : undefined} disabled={gateBlocked} onClick={onFinal}>К финальной версии</button>
        {!research.active && onResearch && (research.current ? <details className="relative text-sm" onKeyDown={(event) => { if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary').focus(); } }}><summary className="cursor-pointer rounded-lg px-3 py-2 text-slate-700">Ещё</summary><div className="absolute right-0 z-20 w-64 rounded-lg border border-slate-300 bg-white p-2"><button type="button" className={buttonClass('research')} aria-label="Запустить AI-исследование повторно" disabled={gateBlocked} onClick={() => onResearch(version?.versionId)}><Sparkles aria-hidden="true" className="mr-1.5 inline h-4 w-4" />Запустить повторно</button></div></details> : <button type="button" className={buttonClass('research')} aria-label="Улучшить требования с помощью AI" aria-describedby={statusId} title={gateBlocked && gateHint ? gateHint : undefined} disabled={gateBlocked} onClick={() => startResearch()}><Sparkles aria-hidden="true" className="mr-1.5 inline h-4 w-4" />Улучшить с AI · необязательно</button>)}
        <ResultExportAction />
      </div>
    </div>
    {context.source}
    {research.status && <p role="status" className="text-sm text-slate-600">{research.status}</p>}
  </header>;
}
