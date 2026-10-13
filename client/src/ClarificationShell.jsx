import { isolateModal } from './modal-layer.js';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function ClarificationShell({ title, onClose, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const node = ref.current;
    const previous = document.activeElement;
    const release = isolateModal(node);
    const focusable = () => [...node.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter((item) => !item.closest('[hidden], [inert], .hidden') && ![...node.querySelectorAll('details:not([open])')].some((detail) => detail.contains(item) && !detail.querySelector('summary')?.contains(item)));
    (focusable()[0] || node).focus();
    const key = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); node.focus(); }
      else if (event.shiftKey && (document.activeElement === items[0] || document.activeElement === node)) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    };
    node.addEventListener('keydown', key);
    return () => { node.removeEventListener('keydown', key); release(); if (previous?.isConnected && !previous.closest('[hidden], [inert]')) previous.focus(); };
  }, []);
  return createPortal(<div className="fixed inset-0 z-[95]" role="dialog" aria-modal="true" aria-label={title}>
    <button type="button" tabIndex={-1} aria-label="Закрыть вопрос" onClick={onClose} className="absolute inset-0 bg-slate-950/30" />
    <aside ref={ref} tabIndex={-1} className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl outline-none">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4"><h2 className="min-w-0 break-words text-lg font-bold text-slate-900">{title}</h2><button type="button" aria-label="Закрыть вопрос" onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600"><X className="h-5 w-5" /></button></header>
      {children}
    </aside>
  </div>, document.body);
}
