import { FileUp } from 'lucide-react';
import { useState } from 'react';

const uploadControl = 'inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-500 transition-colors hover:bg-indigo-50 hover:text-indigo-600 focus-within:bg-indigo-50 focus-within:text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2';

export default function ContextInput({ text, onText, file, onFile, baseline, onBaseline, references, onReferences, uploads, busy, integrationAvailable, maxBytes = 100 * 1024 * 1024 }) {
  const [error, setError] = useState('');
  const choose = (files, setter, multiple = false) => {
    const valid = [...files].filter((item) => item.size > 0 && item.size <= maxBytes);
    setError(valid.length !== files.length ? `Пустые файлы и файлы больше ${Math.floor(maxBytes / 1024 / 1024)} МБ не добавлены. Остальные материалы сохранены.` : '');
    if (multiple) { if (references.length + valid.length > 20) setError('Можно добавить не более 20 справочных материалов.'); setter([...references, ...valid].slice(0, 20)); }
    else if (valid[0]) setter(valid[0]);
  };
  const item = (value, remove) => value && <div className="flex flex-wrap items-center gap-2 text-sm p-2 rounded-lg bg-slate-50"><span className="break-all flex-1">{value.name}</span><span>{uploads.get(value)?.artifactId ? 'Загружен' : uploads.get(value)?.error ? 'Ошибка загрузки — повторите запуск' : uploads.get(value)?.progress != null ? `Загрузка ${Math.round(uploads.get(value).progress * 100)}%` : 'Готов к загрузке'}</span><button type="button" disabled={busy} aria-label={`Убрать ${value.name}`} onClick={remove} className="p-2 text-red-700">Убрать</button></div>;
  return <div className="space-y-4">
    <label className="block text-sm font-semibold">Бизнес-контекст<textarea aria-label="Бизнес-контекст" disabled={busy || Boolean(file)} value={text} rows={Math.min(18, Math.max(6, text.split('\n').length + Math.ceil(text.length / 120)))} onChange={(event) => onText(event.target.value)} placeholder="Опишите бизнес-задачу..." className="block w-full mt-2 min-h-40 px-4 py-3 border-2 border-slate-200 rounded-lg focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100 resize-y bg-slate-50/50 font-normal disabled:bg-slate-100" /></label>
    {file && <p className="text-sm text-slate-600">Основной источник — приложенный файл. Текст выше сохранён, но не будет отправлен вместе с файлом. Уберите файл, чтобы использовать текст.</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <fieldset disabled={busy} className="space-y-3"><legend className="text-sm font-semibold mb-2">Материалы · до {Math.floor(maxBytes / 1024 / 1024)} МБ каждый</legend>
      <div><p className="text-sm">Основной файл вместо текста</p><label className={uploadControl}><FileUp className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{file ? 'Заменить основной файл' : `Приложить файл до ${Math.floor(maxBytes / 1024 / 1024)} МБ`}</span><input aria-label="Файл требований" type="file" onChange={(event) => { choose(event.target.files, onFile); event.target.value = ''; }} className="sr-only" /></label></div>{item(file, () => onFile(null))}
      <details><summary className="cursor-pointer p-2 text-sm font-semibold">Предыдущая версия и справочные материалы (необязательно)</summary>{integrationAvailable ? <div className="space-y-3 p-2"><div><p className="text-sm">Предыдущие требования для сравнения</p><label className={uploadControl}><FileUp className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{baseline ? 'Заменить предыдущую версию' : 'Приложить предыдущую версию'}</span><input aria-label="Предыдущая версия требований" type="file" onChange={(event) => { choose(event.target.files, onBaseline); event.target.value = ''; }} className="sr-only" /></label></div>{item(baseline, () => onBaseline(null))}<div><p className="text-sm">Справочные материалы · не более 20</p><label className={uploadControl}><FileUp className="h-4 w-4 shrink-0" aria-hidden="true" /><span>Приложить справочные материалы</span><input aria-label="Справочные материалы" type="file" multiple onChange={(event) => { choose(event.target.files, onReferences, true); event.target.value = ''; }} className="sr-only" /></label></div>{references.map((value, index) => <div key={`${value.name}-${index}`}>{item(value, () => onReferences(references.filter((_, position) => position !== index)))}</div>)}</div> : <p className="text-sm p-2 text-slate-600">Дополнительные роли материалов недоступны на этом сервере.</p>}</details>
    </fieldset>
  </div>;
}
