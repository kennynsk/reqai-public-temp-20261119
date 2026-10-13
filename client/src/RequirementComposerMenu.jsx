import { useRef } from 'react';

export default function RequirementComposerMenu({ columns, onChoose, contained = false }) {
  const menu = useRef(null);
  function choose(type) {
    onChoose(type);
    menu.current.open = false;
    requestAnimationFrame(() => {
      const section = document.getElementById(`req-type-${type}`);
      section?.querySelector('[data-add-requirement]')?.click();
      requestAnimationFrame(() => {
        const field = section?.querySelector('textarea');
        field?.focus();
        field?.scrollIntoView?.({ block: 'nearest' });
      });
    });
  }
  return <details onKeyDown={(event) => { if (event.key === 'Escape') { menu.current.open = false; menu.current.querySelector('summary').focus(); } }} ref={menu} className={`relative text-xs sm:text-sm ${contained ? 'w-full' : 'open:w-full sm:open:w-auto'}`}>
    <summary className="cursor-pointer py-2 font-semibold text-indigo-700">Добавить требование</summary>
    <div className={`relative z-20 w-full ${contained ? 'sm:absolute sm:left-0' : 'sm:absolute sm:right-0 sm:w-72'} rounded-lg border border-slate-300 bg-white p-2`}>
      {columns.map(([type, label]) => <button type="button" key={type} className="block w-full rounded p-2 text-left hover:bg-slate-100" onClick={() => choose(type)}>{label}</button>)}
    </div>
  </details>;
}
