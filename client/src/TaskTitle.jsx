import { useRef, useState } from 'react';
import ReviewDialog from './ReviewDialog.jsx';
import ResultSettings from './ResultSettings.jsx';
import { Pencil, MoreHorizontal } from 'lucide-react';
import { enterpriseApi } from './api/enterprise-api.js';

export default function TaskTitle({ job, onUpdated, result }) {
  const [showRun, setShowRun] = useState(false);
  const menu = useRef(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const trigger = useRef(null);
  const finish = () => { setDraft(null); setError(''); requestAnimationFrame(() => trigger.current?.focus()); };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const result = await enterpriseApi.updateJobMetadata(job.jobId, { title: draft.title.trim(), expectedRevision: draft.revision });
      onUpdated?.(result); finish();
    } catch (failure) {
      setError(failure.status === 409 ? 'Название изменено в другом окне. Ваш текст сохранён в поле. Загрузите новое название и сравните перед повтором.' : 'Не удалось сохранить название. Попробуйте ещё раз.');
    } finally { setBusy(false); }
  };
  if (draft) return <form onSubmit={save} className="space-y-2">
    <label className="block text-sm font-semibold">Название задачи<input autoFocus maxLength={120} required disabled={busy} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="reqai-control mt-1 block w-full rounded-lg border p-2.5" /></label>
    {error && <div role="alert" className="text-sm text-red-700"><p>{error}</p><button type="button" disabled={busy} className="p-2 underline" onClick={async () => { try { const current = await enterpriseApi.getJob(job.jobId); setDraft((value) => ({ ...value, revision: current.metadataRevision, remoteTitle: current.title })); setError(''); } catch { setError('Не удалось загрузить название. Ваш текст остаётся в поле.'); } }}>Загрузить новое название для сравнения</button></div>}
    {draft.remoteTitle && <p className="text-sm text-slate-600">Сейчас на сервере: {draft.remoteTitle}. Сохранение заменит его текстом из поля.</p>}
    <div className="flex gap-2"><button disabled={busy || !draft.title.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:bg-slate-400">{busy ? 'Сохраняем…' : 'Сохранить название'}</button><button type="button" disabled={busy} onClick={finish} className="px-3 py-2 text-sm">Отмена</button></div>
  </form>;
  return <div className="flex items-start gap-2 min-w-0"><h2 className="reqai-title-clamp font-semibold text-slate-900 break-words min-w-0">{job.title || 'Подготовка требований'}</h2><button ref={trigger} aria-label="Переименовать задачу" onClick={() => setDraft({ title: job.title || '', revision: job.metadataRevision || 0 })} className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500"><Pencil className="w-4 h-4" /></button>{result && <details ref={menu} className="relative ml-auto shrink-0" onKeyDown={(event) => { if (event.key === 'Escape') { menu.current.open = false; menu.current.querySelector('summary').focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) menu.current.open = false; }}><summary role="button" aria-label="Действия задачи" className="list-none cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500"><MoreHorizontal className="h-5 w-5" /></summary><div className="absolute right-0 top-full z-40 w-56 rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><button onClick={() => { menu.current.open = false; menu.current.querySelector('summary').focus(); setShowRun(true); }} className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-100">Сведения о запуске</button></div></details>}{showRun && <ReviewDialog label="Сведения о запуске" onClose={() => setShowRun(false)}><h2 className="text-lg font-bold">Сведения о запуске</h2><ResultSettings result={result} /><button onClick={() => setShowRun(false)} className="mt-5 rounded-lg border px-4 py-2 text-sm">Закрыть</button></ReviewDialog>}</div>;
}
