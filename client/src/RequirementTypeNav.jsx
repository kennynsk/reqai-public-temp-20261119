import { useLayoutEffect, useRef, useState } from 'react';

export default function RequirementTypeNav({ columns, groups, activeType, onSelect }) {
  const container = useRef(null);
  const tabs = useRef(null);
  const requiredWidth = useRef(0);
  const [showTabs, setShowTabs] = useState(true);

  useLayoutEffect(() => {
    const host = container.current;
    const list = tabs.current;
    if (!host || !list) return undefined;
    const measure = () => {
      if (list.scrollWidth) requiredWidth.current = Math.max(requiredWidth.current, list.scrollWidth);
      const available = host.clientWidth;
      if (available) setShowTabs(requiredWidth.current <= available);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, [columns, groups]);

  return <div ref={container} className="relative min-w-0 overflow-x-clip" data-navigation-mode={showTabs ? 'tabs' : 'select'}>
    <label className={`${showTabs ? 'hidden' : 'block'} text-sm font-semibold`}>Тип требований<select aria-label="Выбрать тип требований" value={activeType} onChange={(event) => onSelect(event.target.value)} className="reqai-control mt-2 w-full rounded-lg border p-3 bg-white">{columns.map(([type, label]) => <option key={type} value={type}>{type} · {label} ({groups[type]?.length || 0})</option>)}</select></label>
    <div ref={tabs} role="tablist" aria-label="Типы требований" aria-hidden={!showTabs} className={`${showTabs ? 'flex' : 'absolute invisible pointer-events-none'} w-max min-w-full gap-2 pb-1`}>
      {columns.map(([type, label], index) => <button key={type} type="button" role="tab" tabIndex={activeType === type ? 0 : -1} aria-label={`${type} · ${label}`} aria-selected={activeType === type} aria-controls={`req-type-${type}`} onClick={() => onSelect(type)} onKeyDown={(event) => {
        const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : null;
        const target = offset !== null ? (index + offset + columns.length) % columns.length : event.key === 'Home' ? 0 : event.key === 'End' ? columns.length - 1 : null;
        if (target === null) return;
        event.preventDefault();
        onSelect(columns[target][0]);
        event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[target].focus();
      }} className={`shrink-0 rounded-xl border px-3 py-2 text-left focus-visible:ring-2 focus-visible:ring-indigo-500 ${activeType === type ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><span className="block text-xs font-bold">{type}</span><span className="block text-xs mt-0.5">{label}</span><span className="block text-xs font-semibold mt-1">{groups[type]?.length || 0}</span></button>)}
    </div>
  </div>;
}
