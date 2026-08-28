import { useEffect, useRef } from 'react';

export default function ReviewDialog({ label, onClose, children }) {
  const ref = useRef(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    const focusable = () => [...node.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary, [tabindex="0"]')].filter((item) => {
      if (item.closest('[hidden], [inert]') || item.tabIndex < 0) return false;
      for (let parent = item.parentElement; parent && parent !== node; parent = parent.parentElement) {
        if (parent.tagName === 'DETAILS' && !parent.open && !parent.querySelector(':scope > summary')?.contains(item)) return false;
      }
      return true;
    });
    (focusable()[0] || node).focus();
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0]; const last = elements.at(-1);
      if (!first) { event.preventDefault(); node.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', keyboard);
    return () => { node.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="fixed inset-0 z-[100] bg-slate-900/40 p-4 flex items-center justify-center"><section ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-6 shadow-xl">{children}</section></div>;
}
