import { useEffect, useRef } from 'react';

export default function ReviewDialog({ label, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const node = ref.current;
    const focusable = () => [...node.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter((item) => !item.closest('[hidden]'));
    (focusable()[0] || node).focus();
    const keyboard = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0]; const last = elements.at(-1);
      if (!first) { event.preventDefault(); node.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    node.addEventListener('keydown', keyboard);
    return () => { node.removeEventListener('keydown', keyboard); if (previous?.isConnected) previous.focus(); };
  }, [onClose]);
  return <div className="fixed inset-0 z-[100] bg-slate-900/40 p-4 flex items-center justify-center"><section ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white p-6 shadow-xl">{children}</section></div>;
}
