import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link2, X } from 'lucide-react';
import { resolveRequirementPreview } from './research-review.js';

/* eslint-disable react-refresh/only-export-components */

export const RequirementPreviewContext = createContext(null);

function snapshotAnchorRect(trigger) {
  const rect = trigger?.getBoundingClientRect?.();
  if (!rect || (rect.width === 0 && rect.height === 0)) return null;
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function RequirementPreviewSurface({ preview, index, surfaceRef, onClose }) {
  const closeButtonRef = useRef(null);
  const [layout, setLayout] = useState({ narrow: false, top: 12, left: 12 });
  const resolved = resolveRequirementPreview(index, preview.id);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const narrow = window.innerWidth < 768;
      if (narrow) {
        setLayout((current) => current.narrow ? current : { narrow: true, top: 0, left: 0 });
        return;
      }
      const rect = snapshotAnchorRect(preview.trigger) || preview.anchorRect;
      const width = Math.min(360, Math.max(240, window.innerWidth - 24));
      const estimatedHeight = 320;
      const left = rect ? Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12)) : 12;
      const below = rect ? rect.bottom + 12 : 12;
      const top = below + estimatedHeight <= window.innerHeight - 12 ? below : Math.max(12, (rect?.top || estimatedHeight) - estimatedHeight - 12);
      setLayout({ narrow: false, top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [preview.anchorRect, preview.id, preview.trigger]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, [preview.id]);

  const record = resolved.status === 'available' ? resolved.record : null;
  const panelClass = layout.narrow
    ? 'reqai-requirement-preview fixed inset-x-3 bottom-3 z-[100] max-h-[min(72vh,36rem)] overflow-y-auto rounded-2xl'
    : 'reqai-requirement-preview fixed z-[100] w-[min(22.5rem,calc(100vw-1.5rem))] max-h-[min(70vh,30rem)] overflow-y-auto rounded-2xl';

  return createPortal(
    <section
      ref={surfaceRef}
      id="requirement-preview-dialog"
      role="dialog"
      aria-modal="false"
      aria-labelledby="requirement-preview-title"
      aria-describedby="requirement-preview-description"
      tabIndex={-1}
      className={panelClass}
      style={layout.narrow ? undefined : { top: layout.top, left: layout.left }}
    >
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-indigo-600">Предпросмотр требования</p>
          <h2 id="requirement-preview-title" className="mt-1 text-sm font-bold text-slate-900">{record?.typeLabel || 'Запись требования'} · {resolved.id || 'Без ID'}</h2>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Закрыть предпросмотр требования"
          onClick={onClose}
          className="reqai-quiet-focus -mr-1 -mt-1 shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <div id="requirement-preview-description" className="space-y-3 px-4 py-4 text-sm text-slate-700">
        {record ? <>
          <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-900">{record.text}</p>
          {record.quality && <p><span className="font-semibold text-slate-500">Качество:</span> {record.quality}</p>}
          {record.source && <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <p className="font-semibold text-slate-700">Источник</p>
            <p className="mt-1">{record.source.label}{record.source.locator ? ` · ${record.source.locator}` : ''}</p>
            {record.source.quote && <details className="mt-2"><summary className="cursor-pointer font-semibold text-indigo-700">Цитата из источника</summary><blockquote className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{record.source.quote}</blockquote></details>}
          </div>}
          {record.relationships.length > 0 && <div className="space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500"><Link2 aria-hidden="true" className="h-3.5 w-3.5" />Связи</p>
            <div className="flex flex-wrap gap-2">{record.relationships.map((id) => <RequirementPreviewLink key={id} id={id} className="reqai-preview-link" />)}</div>
          </div>}
        </> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-3">
          <p className="font-semibold text-slate-800">Запись недоступна</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">В сохранённом снимке исследования нет требования с идентификатором {resolved.id || '«не указан»'}.</p>
        </div>}
      </div>
    </section>,
    document.body,
  );
}

export function RequirementPreviewProvider({ index, children }) {
  const [preview, setPreview] = useState(null);
  const previewRef = useRef(null);
  const surfaceRef = useRef(null);

  const open = useCallback((id, trigger) => {
    const current = previewRef.current;
    const isNestedTransition = Boolean(current && surfaceRef.current?.contains(trigger));
    const next = isNestedTransition
      ? { ...current, id }
      : { id, trigger, anchorRect: snapshotAnchorRect(trigger) };
    previewRef.current = next;
    setPreview(next);
  }, []);

  const close = useCallback(() => {
    const trigger = previewRef.current?.trigger;
    previewRef.current = null;
    setPreview(null);
    trigger?.focus?.();
  }, []);

  useEffect(() => {
    if (!preview) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    const onPointerDown = (event) => {
      const target = event.target;
      if (surfaceRef.current?.contains(target) || target?.closest?.('[data-requirement-preview-trigger="true"]')) return;
      close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [close, preview]);

  const context = {
    activeId: preview?.id || null,
    open,
    close,
  };
  return <RequirementPreviewContext.Provider value={context}>
    {children}
    {preview && <RequirementPreviewSurface preview={preview} index={index} surfaceRef={surfaceRef} onClose={close} />}
  </RequirementPreviewContext.Provider>;
}

export function RequirementPreviewLink({ id, className = '', onNavigate }) {
  const preview = useContext(RequirementPreviewContext);
  const triggerRef = useRef(null);
  if (!preview) return <a href={`#record-${id}`} onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate(id); } }} className={className}>{id}</a>;
  return <button
    ref={triggerRef}
    type="button"
    data-requirement-preview-trigger="true"
    aria-haspopup="dialog"
    aria-expanded={preview.activeId === id}
    aria-controls="requirement-preview-dialog"
    title={`Открыть предпросмотр ${id}`}
    onClick={() => preview.open(id, triggerRef.current)}
    className={className || 'reqai-preview-link'}
  >{id}</button>;
}

/* eslint-enable react-refresh/only-export-components */
