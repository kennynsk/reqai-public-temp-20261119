import { useRef, useState } from 'react';
import { useDraftField } from './review-state.js';
import { STRUCTURED_FIELDS } from './review-fields.js';

export default function RequirementContentEditor({ type, requirement, onApply, onCancel, namespace = 'registry' }) {
  const field = useDraftField({ group: type, id: requirement.id, text: requirement.text || '' });
  const ref = useRef(null);
  const [error, setError] = useState('');
  const text = field.draft?.text ?? requirement.text ?? '';
  const value = (name) => Object.hasOwn(field.draft?.fields || {}, name) ? field.draft.fields[name] : requirement[name];
  function apply() {
    const missing = !text.trim() ? ['text', 'Формулировка'] : (STRUCTURED_FIELDS[type] || []).find(([name, , required]) => required && !value(name)?.trim());
    if (missing) { setError(`Заполните поле «${missing[1]}».`); ref.current?.querySelector(`[data-review-field="${requirement.id}:${missing[0]}"]`)?.focus(); return; }
    onApply(text.trim(), field.draft?.fields || {});
    field.clear();
  }
  return <div ref={ref} id={`${namespace}-editor-${requirement.id}`} className="space-y-3">
    <label className="block text-xs font-semibold text-slate-600">Формулировка<textarea autoFocus data-review-field={`${requirement.id}:text`} aria-label={`Текст требования ${requirement.id}`} rows={4} value={text} onChange={(event) => field.change(event.target.value)} className="mt-1 block w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal focus:border-indigo-500 focus:outline-none" /></label>
    <div className="grid gap-3 sm:grid-cols-2">{(STRUCTURED_FIELDS[type] || []).map(([name, label, required]) => { const multiline = name === 'successIndicator'; const Control = multiline ? 'textarea' : 'input'; return <label key={name} className={`text-xs font-semibold text-slate-600 ${multiline ? 'sm:col-span-2' : ''}`}>{label}{required ? ' *' : ''}<Control rows={multiline ? 3 : undefined} data-review-field={`${requirement.id}:${name}`} aria-label={`${label} ${requirement.id}`} value={value(name) ?? ''} onChange={(event) => field.changeField(name, event.target.value || (required ? '' : null))} className="mt-1 block w-full rounded-lg border p-2 text-sm font-normal" /></label>; })}</div>
    <details className="text-sm"><summary className="cursor-pointer p-2">Редактировать связи</summary><div className="flex flex-wrap gap-3 p-2">{field.relatedOptions.map((id) => { const name = type === 'BR' ? 'relatedIds' : 'relatedTo'; const selected = value(name) || []; return <label key={id} className="inline-flex items-center gap-2 p-1"><input type="checkbox" checked={selected.includes(id)} onChange={(event) => field.changeField(name, event.target.checked ? [...selected, id] : selected.filter((item) => item !== id))} />{id}</label>; })}</div></details>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <p className="text-xs text-slate-500">Правки попадут в черновик. Затем сохраните изменения общей кнопкой.</p>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={apply} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700">Применить к черновику</button><button type="button" onClick={() => { field.clear(); onCancel?.(); }} className="rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-600 hover:bg-gray-200">Отмена</button></div>
  </div>;
}
