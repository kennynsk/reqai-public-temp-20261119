import { useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { babokTypeAccent } from './requirements-review-presentation.js';

const headingSeparator = 'shadow-[0_1px_0_0_theme(colors.slate.200),0_3px_10px_-4px_rgb(15_23_42/0.15)]';

export default function RequirementListWorkspace({
  columns, groups, entries, selected, onSelect, typeFilter, query, needsClarification,
  onFiltersChange, qualityLabels, drafts, composerMenu, composer, renderDetail,
}) {
  const filtered = typeFilter !== 'all' || query.trim() || needsClarification;
  const options = [['all', 'Все типы'], ...columns];
  const total = columns.reduce((sum, [type]) => sum + (groups[type]?.length || 0), 0);
  const reviewed = columns.reduce((sum, [type]) => sum + (groups[type] || []).filter((item) => item.quality === 'Готово').length, 0);
  const listRef = useRef(null);
  const detailRef = useRef(null);
  const select = (id) => {
    onSelect(id);
    if (window.matchMedia?.('(max-width: 1023px)').matches) requestAnimationFrame(() => { detailRef.current?.scrollIntoView?.({ block: 'start' }); detailRef.current?.focus(); });
  };
  const [scrolled, setScrolled] = useState(false);
  return <section aria-label="Реестр требований: список и детали" className="space-y-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
    <div role="group" aria-label="Типы требований" className="hidden flex-wrap gap-2 lg:flex">
      {options.map(([type, label]) => <button key={type} type="button" aria-pressed={typeFilter === type}
        aria-label={type === 'all' ? label : `${type} · ${label} · ${groups[type]?.length || 0}`}
        title={label} onClick={() => onFiltersChange({ type })}
        className={`min-h-9 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-indigo-500 ${typeFilter === type ? 'border-indigo-600 bg-indigo-600 text-white' : !(groups[type]?.length || 0) ? 'border-transparent bg-transparent text-slate-600 hover:bg-slate-50' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
        {type === 'all' ? 'Все типы' : <><span aria-hidden="true" className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${typeFilter === type ? 'bg-white' : (groups[type]?.length || 0) ? babokTypeAccent(type).dot : 'bg-slate-300'}`} />{type} · {groups[type]?.length || 0}</>}
      </button>)}
    </div>
    <label className="w-full text-sm font-semibold text-slate-700 lg:hidden">Тип требований
      <select value={typeFilter} onChange={(event) => onFiltersChange({ type: event.target.value })} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">
        {options.map(([type, label]) => <option key={type} value={type}>{label}{type === 'all' ? '' : ` · ${groups[type]?.length || 0}`}</option>)}
      </select>
    </label>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
      <label className="relative w-full min-w-48 flex-1 lg:max-w-xs">
        <span className="sr-only">Поиск требований</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input type="search" value={query} onChange={(event) => onFiltersChange({ query: event.target.value })} placeholder="ID или формулировка" className="min-h-10 w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm" />
      </label>
      <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={needsClarification} onChange={(event) => onFiltersChange({ needsClarification: event.target.checked })} />Нужно уточнить</label>
    </div>
    </div>
    {typeFilter !== 'all' && <p className="text-sm font-semibold text-slate-600">{columns.find(([type]) => type === typeFilter)?.[1]}</p>}
    {composer}
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(17.5rem,20rem)_minmax(0,1fr)]">
      <nav ref={listRef} tabIndex={-1} aria-label="Список требований" className="reqai-requirement-selector min-w-0 rounded-2xl border border-slate-200 bg-white px-2 pb-2" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 2)}>
        <div data-scrolled={scrolled ? 'true' : 'false'} className={`reqai-requirement-selector-heading top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-white px-3 py-2 text-xs font-semibold text-slate-500 ${scrolled ? headingSeparator : ''}`}><span className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="uppercase tracking-[0.08em]">Реестр</span>{total > 0 && <span className={reviewed === total ? 'text-emerald-700' : undefined}>Качество · {reviewed} из {total}</span>}{filtered && <span>Найдено: {entries.length}</span>}</span>{composerMenu}</div>
        {entries.length ? <ul className="space-y-1 pt-1">{entries.map(({ type, requirement }) => {
          const active = selected?.requirement.id === requirement.id;
          const ready = requirement.quality === 'Готово';
          return <li key={requirement.id}><button type="button" aria-pressed={active} aria-controls="selected-requirement-detail" aria-label={`Выбрать ${requirement.id}: ${requirement.text}`} onClick={() => select(requirement.id)}
            className={`w-full min-w-0 rounded-xl border px-3 py-3 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 ${active ? 'border-transparent bg-white shadow-xs ring-2 ring-indigo-600' : 'border-transparent hover:border-slate-200 hover:bg-slate-50'}`}>
            <span className="flex flex-wrap items-start justify-between gap-2 text-xs font-semibold"><span className="text-slate-600">{requirement.id}</span><span className={ready ? 'text-emerald-700' : 'text-amber-800'}>{qualityLabels[requirement.quality] || 'Не определена'}</span></span>
            <span className="reqai-title-clamp mt-1 text-sm font-semibold leading-5 text-slate-900">{requirement.text}</span>
            <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-500"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${babokTypeAccent(type).dot}`} />{columns.find(([key]) => key === type)?.[1]}</span>
            {drafts[`${type}:${requirement.id}`] && <span className="mt-1 block text-xs font-medium text-indigo-700">Редактируется</span>}
          </button></li>;
        })}</ul> : <p className="px-3 py-5 text-sm text-slate-500">Нет требований по выбранным условиям.</p>}
      </nav>
      <div ref={detailRef} tabIndex={-1} aria-label={selected ? `Детали требования ${selected.requirement.id}` : 'Детали требования'} id="selected-requirement-detail" className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        {selected ? <>
          <button type="button" onClick={() => { listRef.current?.scrollIntoView?.({ block: 'start' }); listRef.current?.querySelector('[aria-pressed="true"]')?.focus(); }} className="mb-4 min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 lg:hidden">К списку требований</button>
          <div className="mb-4"><span className={`inline-flex rounded-lg px-2.5 py-1.5 text-xs font-semibold ${babokTypeAccent(selected.type).chip}`}>{selected.type} · {columns.find(([type]) => type === selected.type)?.[1]}</span></div>
          {renderDetail(selected)}
        </> : <div className="py-8 text-center"><h2 className="text-lg font-bold text-slate-900">Нет требований</h2><p className="mt-2 text-sm text-slate-500">{filtered ? 'Измените условия поиска или добавьте требование.' : 'Добавьте первое требование через меню выше.'}</p>{filtered && <button type="button" onClick={() => onFiltersChange({ type: 'all', query: '', needsClarification: false })} className="mt-4 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700">Сбросить фильтры</button>}</div>}
      </div>
    </div>
  </section>;
}
