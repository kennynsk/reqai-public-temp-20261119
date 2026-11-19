import { useContext, useId } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { RequirementsReviewContext } from './requirements-review-context.js';
import { researchPresentation, reviewPrimary, formatRuDateTime } from './requirements-review-presentation.js';
import { ResultExportAction } from './ResultExportContext.jsx';

export default function RequirementsReviewHeader({ version, dirty, busy, researchBusy, onSave, onResearch, onFinal, reopenWarning = [] }) {
  const context = useContext(RequirementsReviewContext);
  const statusId = useId();
  const saved = Boolean(version?.versionId);
  const needsSave = !saved || dirty;
  const research = researchPresentation({ ...context, versionId: version?.versionId });
  const canLaunch = Boolean(onResearch && !research.active);
  const repeatInMenu = canLaunch && research.openPrimary && !needsSave;
  const primary = reviewPrimary({ needsSave, busy, research, submitting: context.submitting, conflict: context.conflict, canLaunch });
  const gateBlocked = Boolean(context.conflict || busy || researchBusy || research.active);
  const gateHint = context.conflict ? 'Разрешите конфликт версий' : busy ? 'Подождите завершения операции' : researchBusy || research.active ? 'Дождитесь завершения AI-исследования' : '';
  const savedAt = formatRuDateTime(version?.createdAt);
  const versionStatus = !saved ? 'Черновик ещё не сохранён' : dirty ? 'В черновике есть несохранённые изменения' : `Черновик сохранён${savedAt ? ` · ${savedAt}` : ''}`;
  const buttonClass = (key) => `min-h-10 rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50 ${primary === key ? 'border-transparent bg-indigo-600 text-white hover:bg-indigo-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`;
  const launchHintId = `${statusId}-launch`;

  async function startResearch() {
    const savedVersion = needsSave ? await onSave() : version;
    if (savedVersion?.versionId) onResearch(savedVersion.versionId);
  }

  const repeatAction = repeatInMenu && <button
    type="button"
    className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left font-semibold text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
    aria-describedby={statusId}
    disabled={gateBlocked}
    onClick={(event) => {
      const menu = event.currentTarget.closest('details');
      menu.open = false;
      menu.querySelector('summary').focus();
      startResearch();
    }}
  >
    <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0" />
    Запустить AI-исследование повторно
  </button>;

  return <header className="space-y-2" aria-label="Работа с требованиями">
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Требования</h1>
        <p id={statusId} role="status" className="mt-1 text-sm text-slate-600">{gateHint || versionStatus}</p>
        {(needsSave || (busy && !context.submitting)) && <button type="button" className={`mt-2 ${buttonClass('save')}`} disabled={busy || Boolean(context.conflict)} onClick={onSave}>
          {busy ? <><Loader2 aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" />Сохраняем…</> : 'Сохранить черновик'}
        </button>}
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2" aria-label="Действия с требованиями">
          {canLaunch && !repeatInMenu && <button type="button" className={buttonClass('research')} aria-describedby={needsSave && !gateBlocked ? launchHintId : statusId} disabled={gateBlocked} onClick={startResearch}>Запустить AI-исследование</button>}
          {context.submitting && !context.childId && <button type="button" disabled className={buttonClass('starting')}><Loader2 aria-hidden="true" className="mr-2 inline h-4 w-4 animate-spin" />Запускаем AI-исследование…</button>}
          {context.childId && <button type="button" className={buttonClass('open')} disabled={busy} onClick={() => context.onOpenResearch()}>{research.openLabel}</button>}
          <button type="button" className={buttonClass('final')} aria-describedby={statusId} disabled={gateBlocked} onClick={onFinal}>Завершить подготовку</button>
          {saved && <ResultExportAction triggerLabel="Ещё">{repeatAction}</ResultExportAction>}
        </div>
        {canLaunch && needsSave && !gateBlocked && <p id={launchHintId} className="text-xs text-slate-600">Черновик сохранится перед запуском.</p>}
      </div>
    </div>
    {context.source}
    {research.status && <p role="status" className="text-sm text-slate-600">{research.status}</p>}
    {dirty && reopenWarning.length > 0 && <p role="status" className="text-sm text-amber-700">Правка переоткроет вопросы: {reopenWarning.join(', ')} — их прежние решения сохранятся и потребуют повторного подтверждения.</p>}
  </header>;
}
