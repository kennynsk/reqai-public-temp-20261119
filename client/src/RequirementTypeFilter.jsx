import { useId } from 'react';

export default function RequirementTypeFilter({ columns, groups, value, onChange, children }) {
  const id = useId();
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
    <label htmlFor={id} className="flex min-w-0 max-w-full items-center gap-2 text-sm text-slate-700">Тип
      <select id={id} aria-label="Тип требований" value={value} onChange={(event) => onChange(event.target.value)} className="min-h-10 min-w-0 max-w-full rounded-lg border border-slate-500 bg-white px-3 py-2 text-sm focus-visible:outline-indigo-600">
        <option value="all">Все типы</option>
        {columns.map(([key, label]) => <option key={key} value={key}>{label} · {groups[key]?.length || 0}</option>)}
      </select>
    </label>
    {children}
  </div>;
}
