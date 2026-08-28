import { useState } from 'react';

const example = 'Нужна система бронирования переговорных. Сотрудник выбирает комнату и время, видит занятость и отменяет свою бронь. Администратор закрывает комнату на обслуживание и повторно открывает её. Нельзя допускать пересекающиеся брони. Цель — сократить конфликты и время согласования встреч.';
const structure = '\n\nЦель:\nКто пользуется:\nЧто должно происходить:\nОграничения:\nКак проверим результат:\n';

export default function ContextInput({ text, onText, file, onFile, baseline, onBaseline, references, onReferences, uploads, busy, integrationAvailable, maxBytes = 100 * 1024 * 1024 }) {
  const [error, setError] = useState('');
  const [helper, setHelper] = useState(null);
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
    <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || Boolean(file)} onClick={() => setHelper(example)} className="p-2 rounded-lg text-sm text-indigo-700 border">Показать пример</button><button type="button" disabled={busy || Boolean(file)} onClick={() => setHelper(structure)} className="p-2 rounded-lg text-sm text-indigo-700 border">Структура описания</button></div>
    {helper && <section className="rounded-xl border p-3 text-sm space-y-2"><p className="whitespace-pre-wrap">{helper}</p><p className="text-slate-600">Ваш текст не изменится, пока вы не выберете действие.</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => { onText(text + '\n' + helper); setHelper(null); }} className="border p-2 rounded-lg">Добавить в конец</button><button type="button" disabled={busy} onClick={() => { onText(helper); setHelper(null); }} className="border p-2 rounded-lg">Заменить мой текст</button><button type="button" onClick={() => setHelper(null)} className="p-2">Закрыть пример</button></div></section>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <fieldset disabled={busy} className="space-y-3"><legend className="text-sm font-semibold mb-2">Материалы · до {Math.floor(maxBytes / 1024 / 1024)} МБ каждый</legend>
      <label className="block text-sm">Основной файл вместо текста<input aria-label="Файл требований" type="file" onChange={(event) => { choose(event.target.files, onFile); event.target.value = ''; }} className="block max-w-full mt-1 text-sm" /></label>{item(file, () => onFile(null))}
      <details><summary className="cursor-pointer p-2 text-sm font-semibold">Предыдущая версия и справочные материалы (необязательно)</summary>{integrationAvailable ? <div className="space-y-3 p-2"><label className="block text-sm">Предыдущие требования для сравнения<input aria-label="Предыдущая версия требований" type="file" onChange={(event) => { choose(event.target.files, onBaseline); event.target.value = ''; }} className="block max-w-full mt-1" /></label>{item(baseline, () => onBaseline(null))}<label className="block text-sm">Справочные материалы · не более 20<input aria-label="Справочные материалы" type="file" multiple onChange={(event) => { choose(event.target.files, onReferences, true); event.target.value = ''; }} className="block max-w-full mt-1" /></label>{references.map((value, index) => <div key={`${value.name}-${index}`}>{item(value, () => onReferences(references.filter((_, position) => position !== index)))}</div>)}</div> : <p className="text-sm p-2 text-slate-600">Дополнительные роли материалов недоступны на этом сервере.</p>}</details>
    </fieldset>
  </div>;
}
