import { useEffect, useState } from 'react';
import ReviewDialog from './ReviewDialog.jsx';
import { enterpriseApi } from './api/enterprise-api.js';

export default function VersionExport({ version, isDirty, onSave }) {
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
    if (isDirty()) setPending({ action, version }); else perform(action, version);
  }
  return <section aria-label="Экспорт сохранённой версии" className="rounded-xl border bg-white mb-4"><details className="p-3">
    <summary className="cursor-pointer p-1 text-sm font-semibold text-slate-700">Экспорт сохранённой версии · {label}</summary>
    <div className="space-y-3 pt-3"><p className="text-sm text-slate-600">В документ войдут все типы требований и открытые вопросы, независимо от фильтра.</p>
    <div className="flex gap-2 flex-wrap">{[['copy', 'Копировать Markdown'], ['markdown', 'Скачать Markdown'], ['docx', 'Скачать DOCX'], ['print', 'Печать / PDF']].map(([action, label]) => <button key={action} disabled={busy} onClick={() => request(action)} className="p-3 rounded-lg border text-sm text-indigo-700 disabled:text-slate-400">{label}</button>)}</div>
    {message && <p role="status" className="text-sm text-slate-700">{printLink && printLink.versionId !== version?.versionId ? 'Сохранённая версия изменилась. Для печати подготовьте документ заново.' : message}</p>}
    {printLink?.versionId === version?.versionId && printLink && <a href={printLink.url} target="_blank" rel="noopener noreferrer" className="inline-block p-3 border rounded-lg text-sm text-indigo-700">Открыть печатное представление</a>}
    </div></details>
    {pending && <ReviewDialog label="Экспорт при несохранённых изменениях" onClose={() => setPending(null)}><h2 className="text-lg font-bold">Есть несохранённые изменения</h2><p className="my-3 text-sm">Сохраните их перед экспортом или явно выгрузите предыдущую редакцию от {new Date(pending.version.createdAt).toLocaleString()}.</p><div className="flex gap-2 flex-wrap"><button className="p-3 border rounded-lg" onClick={async () => { const { action } = pending; setPending(null); try { const saved = await onSave(); if (saved?.versionId) perform(action, saved); } catch { setMessage('Сохранение не подтверждено. Экспорт не выполнен; проверьте черновик и повторите сохранение.'); } }}>Сохранить и экспортировать</button><button className="p-3 border rounded-lg" onClick={() => { const { action, version } = pending; setPending(null); perform(action, version); }}>Экспортировать предыдущую версию</button><button className="p-3 border rounded-lg" onClick={() => setPending(null)}>Отмена</button></div></ReviewDialog>}
    {manual !== null && <ReviewDialog label="Скопировать Markdown вручную" onClose={() => setManual(null)}><h2 className="font-bold">Markdown сохранённой версии</h2><textarea aria-label="Markdown для ручного копирования" readOnly value={manual} rows={14} className="w-full p-3 my-3 border rounded-lg font-mono text-xs" onFocus={(event) => event.target.select()} /><button className="p-3 border rounded-lg" onClick={() => setManual(null)}>Закрыть</button></ReviewDialog>}
  </section>;
}
