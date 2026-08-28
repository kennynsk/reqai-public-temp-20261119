import { useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { enterpriseApi } from './api/enterprise-api.js';

export default function TaskTitle({ job, onUpdated }) {
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
    <label className="block text-sm font-semibold">Название задачи<input autoFocus maxLength={120} required disabled={busy} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-1 block w-full rounded-lg border border-slate-300 p-2.5" /></label>
    {error && <div role="alert" className="text-sm text-red-700"><p>{error}</p><button type="button" disabled={busy} className="p-2 underline" onClick={async () => { try { const current = await enterpriseApi.getJob(job.jobId); setDraft((value) => ({ ...value, revision: current.metadataRevision, remoteTitle: current.title })); setError(''); } catch { setError('Не удалось загрузить название. Ваш текст остаётся в поле.'); } }}>Загрузить новое название для сравнения</button></div>}
    {draft.remoteTitle && <p className="text-sm text-slate-600">Сейчас на сервере: {draft.remoteTitle}. Сохранение заменит его текстом из поля.</p>}
    <div className="flex gap-2"><button disabled={busy || !draft.title.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white disabled:bg-slate-400">{busy ? 'Сохраняем…' : 'Сохранить название'}</button><button type="button" disabled={busy} onClick={finish} className="px-3 py-2 text-sm">Отмена</button></div>
  </form>;
  return <div className="flex items-start gap-2 min-w-0"><h2 className="font-semibold text-slate-900 break-words min-w-0">{job.title || 'Подготовка требований'}</h2><button ref={trigger} aria-label="Переименовать задачу" onClick={() => setDraft({ title: job.title || '', revision: job.metadataRevision || 0 })} className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500"><Pencil className="w-4 h-4" /></button></div>;
}
