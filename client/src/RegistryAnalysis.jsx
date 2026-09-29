import ReviewQuestions from './ReviewQuestions.jsx';
import { MaterialCoverage, SourceEvidence } from './SourceEvidence.jsx';
import { RequirementPreviewContext, RequirementPreviewLink } from './RequirementPreview.jsx';
import { useContext } from 'react';

export function RecordLinks({ ids = [], onNavigate }) {
  const preview = useContext(RequirementPreviewContext);
  return <span className="inline-flex flex-wrap gap-2">{ids.map((id) => preview
    ? <RequirementPreviewLink key={id} id={id} className="reqai-preview-link" />
    : <a key={id} href={`#record-${id}`} onClick={(event) => { if (onNavigate) { event.preventDefault(); onNavigate(id); } }} className="inline-block rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 underline underline-offset-2">{id}</a>)} </span>;
}

function groupTraceabilityLinks(links = []) {
  return links.reduce((groups, link) => {
    const sourceId = link.from || '';
    const group = groups.find((item) => item.sourceId === sourceId);
    if (group) group.links.push(link);
    else groups.push({ sourceId, links: [link] });
    return groups;
  }, []);
}

function linkCountLabel(count) {
  if (count % 10 === 1 && count % 100 !== 11) return 'связь';
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return 'связи';
  return 'связей';
}

function TraceabilityGroup({ group, onNavigate }) {
  return <article aria-label={group.sourceId ? `Связи от ${group.sourceId}` : 'Связи без исходного требования'} className="p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Из</span>
        {group.sourceId ? <RecordLinks ids={[group.sourceId]} onNavigate={onNavigate} /> : <span className="text-sm text-slate-600">Источник не указан</span>}
      </div>
      <span className="shrink-0 text-xs text-slate-500">{group.links.length} {linkCountLabel(group.links.length)}</span>
    </div>
    <div className="mt-3 divide-y divide-slate-100">
      {group.links.map((link, index) => <div key={`${link.from || 'unknown'}-${link.to || 'unknown'}-${index}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-slate-100 py-3 first:border-t-0 first:pt-0 last:pb-0">
        <span aria-hidden="true" className="text-slate-400">→</span>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs font-semibold text-slate-500">К</span>
          {link.to ? <RecordLinks ids={[link.to]} onNavigate={onNavigate} /> : <span className="text-sm text-slate-600">Цель не указана</span>}
          {link.relation && <span className="text-sm text-slate-700">{link.relation}</span>}
        </div>
        {link.status && <span className="text-right text-xs text-slate-600">{link.status}</span>}
      </div>)}
    </div>
  </article>;
}

function TraceabilityLinks({ links, onNavigate }) {
  return <section aria-label="Связи требований" className="space-y-3">
    <h2 className="text-lg font-bold">Связи требований · {links.length}</h2>
    {links.length > 0
      ? <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200">{groupTraceabilityLinks(links).map((group) => <TraceabilityGroup key={group.sourceId || 'unknown-source'} group={group} onNavigate={onNavigate} />)}</div>
      : <p className="text-sm text-slate-600">Отдельная схема связей не сформирована. Связанные записи доступны на карточках требований.</p>}
  </section>;
}

export default function RegistryAnalysis({ registry, section, onNavigate, onDiscuss, readOnly }) {
  const analysis = registry.analysis;
  return <div className="space-y-4">
    {section === 'questions' && <ReviewQuestions registry={registry} onNavigate={onNavigate} onDiscuss={onDiscuss} readOnly={readOnly} />}
    {section === 'links' && <TraceabilityLinks links={analysis.traceability} onNavigate={onNavigate} />}
    {section === 'report' && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-semibold text-sm p-1">Приложения: контекст, материалы и анализ</summary><div className="mt-4 space-y-4">
      {registry.summary?.conclusions?.length > 0 && <ul className="list-disc pl-5 text-sm">{registry.summary.conclusions.map((text, index) => <li key={index}>{text}</li>)}</ul>}
      <MaterialCoverage materials={registry.materials} scope={registry.scope} />
      {[["Контекст", registry.context], ["Гипотезы", analysis.HYP], ["Термины", analysis.TERM], ["Сравнение с базовым набором", analysis.delta.filter((item) => item.kind !== 'дубликат')]].map(([label, items]) => <details key={label} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">{label} · {items.length}</summary>{items.map((item) => <article id={`record-${item.id}`} tabIndex={-1} key={item.id} className="scroll-mt-20 border-t mt-3 pt-3"><p className="text-xs font-semibold">{item.id}</p><p className="text-sm my-2 whitespace-pre-wrap">{item.text || item.comment || `${item.term}: ${item.meaning || 'Требует уточнения'}`}</p><>{item.baselineId && <p className="text-xs text-slate-600">В базовом наборе: {item.baselineId}</p>}{item.kind && item.id.startsWith('DELTA-') && <p className="text-xs text-slate-600">{item.kind}</p>}<RecordLinks ids={item.relatedIds || item.affectedIds || [item.newId].filter(Boolean)} onNavigate={onNavigate} /></>{item.source && <SourceEvidence source={item.source} materials={registry.materials} />}</article>)}</details>)}
    </div></details>}
  </div>;
}
