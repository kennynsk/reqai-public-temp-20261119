import { Search } from 'lucide-react';

export default function RequirementListWorkspace({
  columns, groups, entries, selected, onSelect, typeFilter, query, needsClarification,
  onFiltersChange, qualityLabels, drafts, composerMenu, composer, renderDetail,
}) {
  const filtered = typeFilter !== 'all' || query.trim() || needsClarification;
  const options = [['all', 'Все типы'], ...columns];
  return <section aria-label="Реестр требований: список и детали" className="space-y-3">
    <div role="group" aria-label="Типы требований" className="flex flex-wrap gap-2">
      {options.map(([type, label]) => <button key={type} type="button" aria-pressed={typeFilter === type}
        aria-label={type === 'all' ? label : `${type} · ${label} · ${groups[type]?.length || 0}`}
        title={label} onClick={() => onFiltersChange({ type })}
        className={`min-h-9 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500 ${typeFilter === type ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
        {type === 'all' ? 'Все типы' : `${type} · ${groups[type]?.length || 0}`}
      </button>)}
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <label className="relative min-w-0 w-full sm:w-72">
        <span className="sr-only">Поиск требований</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input type="search" value={query} onChange={(event) => onFiltersChange({ query: event.target.value })} placeholder="ID или формулировка" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={needsClarification} onChange={(event) => onFiltersChange({ needsClarification: event.target.checked })} />Нужно уточнить</label>
      <div className="sm:ml-auto">{composerMenu}</div>
    </div>
    {typeFilter !== 'all' && <p className="text-sm font-semibold text-slate-600">{columns.find(([type]) => type === typeFilter)?.[1]}</p>}
    {composer}
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(17.5rem,20rem)_minmax(0,1fr)]">
      <nav aria-label="Список требований" className="reqai-requirement-selector min-w-0 rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs font-semibold text-slate-500"><span className="uppercase tracking-[0.08em]">Требования</span>{filtered && <span>Найдено: {entries.length}</span>}</div>
        {entries.length ? <ul className="space-y-1">{entries.map(({ type, requirement }) => {
          const active = selected?.requirement.id === requirement.id;
          const ready = requirement.quality === 'Готово';
          return <li key={requirement.id}><button type="button" aria-pressed={active} aria-controls="selected-requirement-detail" aria-label={`Выбрать ${requirement.id}: ${requirement.text}`} onClick={() => onSelect(requirement.id)}
            className={`w-full min-w-0 rounded-xl border px-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'border-indigo-300 bg-indigo-50/70 shadow-sm' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
            <span className="flex flex-wrap items-start justify-between gap-2 text-xs font-semibold"><span className="text-slate-600">{requirement.id}</span><span className={ready ? 'text-emerald-700' : 'text-amber-800'}>{qualityLabels[requirement.quality] || 'Нужно уточнить'}</span></span>
            <span className="reqai-title-clamp mt-1 text-sm font-semibold leading-5 text-slate-900">{requirement.text}</span>
            <span className="mt-2 block text-xs text-slate-500">{columns.find(([key]) => key === type)?.[1]}</span>
            {drafts[`${type}:${requirement.id}`] && <span className="mt-1 block text-xs font-medium text-indigo-700">Редактируется</span>}
          </button></li>;
        })}</ul> : <p className="px-3 py-5 text-sm text-slate-500">Нет требований по выбранным условиям.</p>}
      </nav>
      <div id="selected-requirement-detail" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        {selected ? <>
          <div className="mb-4"><span className="inline-flex rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-700">{selected.type} · {columns.find(([type]) => type === selected.type)?.[1]}</span></div>
          {renderDetail(selected)}
        </> : <div className="py-8 text-center"><h2 className="text-lg font-bold text-slate-900">Нет требований</h2><p className="mt-2 text-sm text-slate-500">{filtered ? 'Измените условия поиска или добавьте требование.' : 'Добавьте первое требование через меню выше.'}</p>{filtered && <button type="button" onClick={() => onFiltersChange({ type: 'all', query: '', needsClarification: false })} className="mt-4 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700">Сбросить фильтры</button>}</div>}
      </div>
    </div>
  </section>;
}
