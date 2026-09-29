import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReviewDialog from './ReviewDialog.jsx';
import { enterpriseApi } from './api/enterprise-api.js';

export default function VersionExport({ version, isDirty, onSave, placement = 'bottom' }) {
  const menu = useRef(null);
  const [pending, setPending] = useState(null);
  const [manual, setManual] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [printLink, setPrintLink] = useState(null);
  useEffect(() => () => { if (printLink) URL.revokeObjectURL(printLink.url); }, [printLink]);
  const label = version ? `Редакция от ${new Date(version.createdAt).toLocaleString()}` : 'Сначала сохраните версию требований';
  async function perform(action, selected) {
    setBusy(true); setMessage('');
    try {
      const blob = await enterpriseApi.exportRequirementsVersion(selected.versionId, action === 'copy' ? 'markdown' : action === 'print' ? 'html' : action);
      if (action === 'copy') {
        const text = await blob.text();
        try { await navigator.clipboard.writeText(text); setMessage('Markdown сохранённой версии скопирован.'); }
        catch { setManual(text); setMessage('Автоматическое копирование недоступно. Выделите текст вручную или скачайте Markdown.'); }
      } else {
        const url = URL.createObjectURL(blob);
        if (action === 'print') {
          setPrintLink({ url, versionId: selected.versionId });
          setMessage('Печатное представление готово. Откройте его по ссылке ниже, затем используйте «Печать» браузера (Ctrl/Cmd+P) и «Сохранить как PDF».');
        } else {
          const link = document.createElement('a'); link.href = url; link.download = `requirements.${action === 'markdown' ? 'md' : 'docx'}`; link.click(); setMessage('Файл сохранённой версии подготовлен к скачиванию.');
        }
        if (action !== 'print') window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch { setMessage('Не удалось получить документ. Версия не изменена; повторите экспорт.'); }
    finally { setBusy(false); }
  }
  function request(action) {
    if (!version) { setMessage('Для экспорта сначала сохраните требования. Исходный AI-результат не подменяет сохранённую версию.'); return; }
    if (isDirty()) { menu.current.querySelector('summary').focus(); setPending({ action, version }); } else perform(action, version);
  }
  return <section aria-label="Экспорт сохранённой версии" className="relative text-sm">
    {!version ? <button type="button" onClick={() => setMessage('Сначала сохраните требования кнопкой «Сохранить требования» — затем экспортируйте сохранённую версию. Исходный AI-результат не подменяет сохранённую версию.')} className="h-10 whitespace-nowrap cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Экспорт ▾</button> : <details ref={menu} onKeyDown={(event) => { if (event.key === 'Escape') { menu.current.open = false; menu.current.querySelector('summary').focus(); } }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) menu.current.open = false; }}>
    <summary role="button" onClick={() => { setMessage(''); menu.current?.querySelector('summary').focus(); }} className="list-none h-10 whitespace-nowrap cursor-pointer rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">Экспорт ▾</summary>
    <div className={`absolute ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 z-40 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg`}>
    <p className="px-3 py-2 text-xs text-slate-500">{label}. Все требования и открытые вопросы.</p>
    <div className="flex flex-col">{[['docx', 'Скачать DOCX'], ['markdown', 'Скачать Markdown'], ['print', 'Печать / PDF'], ['copy', 'Копировать Markdown']].map(([action, label]) => <button key={action} disabled={busy} onClick={() => request(action)} className="rounded-lg px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:text-slate-400">{label}</button>)}</div>
    </div></details>}
    {message && <div className={`absolute ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'} right-0 z-40 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-lg`}>
      <p role="status" className="text-xs text-slate-700">{printLink && printLink.versionId !== version?.versionId ? 'Сохранённая версия изменилась. Для печати подготовьте документ заново.' : message}</p>
      {printLink?.versionId === version?.versionId && printLink && <a href={printLink.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-indigo-700 underline">Открыть печатное представление</a>}
      <button onClick={() => { setMessage(''); menu.current?.querySelector('summary').focus(); }} className="mt-2 block rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100">Скрыть уведомление</button>
    </div>}
    {pending && createPortal(<ReviewDialog label="Экспорт при несохранённых изменениях" onClose={() => setPending(null)}><h2 className="text-lg font-bold">Есть несохранённые изменения</h2><p className="my-3 text-sm">Сохраните их перед экспортом или явно выгрузите предыдущую редакцию от {new Date(pending.version.createdAt).toLocaleString()}.</p><div className="flex gap-2 flex-wrap"><button className="p-3 border rounded-lg" onClick={async () => { const { action } = pending; setPending(null); try { const saved = await onSave(); if (saved?.versionId) perform(action, saved); } catch { setMessage('Сохранение не подтверждено. Экспорт не выполнен; проверьте черновик и повторите сохранение.'); } }}>Сохранить и экспортировать</button><button className="p-3 border rounded-lg" onClick={() => { const { action, version } = pending; setPending(null); perform(action, version); }}>Экспортировать предыдущую версию</button><button className="p-3 border rounded-lg" onClick={() => setPending(null)}>Отмена</button></div></ReviewDialog>, document.body)}
    {manual !== null && createPortal(<ReviewDialog label="Скопировать Markdown вручную" onClose={() => setManual(null)}><h2 className="font-bold">Markdown сохранённой версии</h2><textarea aria-label="Markdown для ручного копирования" readOnly value={manual} rows={14} className="w-full p-3 my-3 border rounded-lg font-mono text-xs" onFocus={(event) => event.target.select()} /><button className="p-3 border rounded-lg" onClick={() => setManual(null)}>Закрыть</button></ReviewDialog>, document.body)}
  </section>;
}
